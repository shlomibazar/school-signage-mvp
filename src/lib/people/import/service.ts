import { createHash, randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { HttpError } from '@/lib/apiErrors'
import { identityKeyFor, identityHintFor, sourceRecordKey, IDENTITY_KEY_VERSION, IdentityError } from '../identity'
import { formatDateOnly, parseDateOnly } from '../birthdays'
import type { CoreFields } from '../sourcePrecedence'
import { readXlsxAsync, type Workbook } from './xlsx'
import { detectColumns, validateMapping, type ImportKind } from './columns'
import { buildRows, type ImportIssue } from './rows'
import { planImport, planHash, summarize, STATUS_LABELS, type ExistingPerson, type PlannedRow, type RoleFields, type RowStatus } from './plan'

// Database side of the people import. Flow: inspect (no storage) → preview (stores a PersonImport
// with the normalized rows — keyed identities only, never raw identifiers — and the plan's
// fingerprint) → apply (claims the import once, re-plans inside one transaction under a per-school
// lock, refuses if anything changed since the preview, writes everything or nothing, clears rows).
// Every query is scoped to the signed-in user's school. Nothing here logs row content.

export const IMPORT_TTL_MS = 30 * 60_000

type StoredRow = {
  line: number; firstName: string; lastName: string
  identityKey: string | null; identityHint: string | null; recordKey: string | null
  core: CoreFields | null; role: RoleFields | null; className: string | null
  issues: ImportIssue[]
}

export type PreviewRow = {
  line: number; name: string; className: string | null; birthDate: string | null; idHint: string | null
  status: RowStatus; statusLabel: string; issues: ImportIssue[]; notes: string[]
}
export type ImportPreview = {
  importId: string; kind: ImportKind; sheetName: string; fileName: string; expiresAt: string
  summary: Record<RowStatus, number>; rows: PreviewRow[]; recentSameFile: boolean
}

function keysFor(schoolId: string, normalizedId: string) {
  try {
    return {
      identityKey: identityKeyFor(schoolId, normalizedId), identityHint: identityHintFor(normalizedId),
      recordKey: sourceRecordKey(schoolId, 'EXCEL', normalizedId),
    }
  } catch (e) {
    if (e instanceof IdentityError) throw new HttpError(503, 'זיהוי לפי מזהה אינו מוגדר בשרת, ולכן אי אפשר לייבא. פנו למנהל המערכת.')
    throw e
  }
}

// One file is parsed at a time in this server process: parsing needs memory in proportion to the file
// (up to ~150MB for the largest permitted one), and the free instance has 512MB in all. A request that
// finds the slot taken waits its turn, up to PARSE_WAIT_MS, then gets a "busy" answer.
const PARSE_WAIT_MS = 20_000
let parseQueue: Promise<unknown> = Promise.resolve()
let parsePending = 0
const MAX_PARSE_PENDING = 4

async function parseWorkbook(buf: Buffer, onlySheet?: number): Promise<Workbook> {
  if (parsePending >= MAX_PARSE_PENDING) throw new HttpError(503, 'המערכת מעבדת כרגע קבצים אחרים. נסו שוב בעוד דקה.')
  parsePending++
  const turn = parseQueue
  let release!: () => void
  parseQueue = new Promise<void>(r => { release = r })
  try {
    let timer: NodeJS.Timeout | undefined
    const waited = await Promise.race([
      turn.then(() => true, () => true),
      new Promise<false>(r => { timer = setTimeout(() => r(false), PARSE_WAIT_MS) }),
    ])
    clearTimeout(timer)
    if (!waited) throw new HttpError(503, 'המערכת מעבדת כרגע קובץ אחר. נסו שוב בעוד דקה.')
    return await readXlsxAsync(buf, { onlySheet })
  } finally {
    parsePending--
    // A request that gave up still releases its place only after the one before it finished.
    void turn.then(release, release)
  }
}

const APPLY_TIMEOUT_MS = 120_000
/** An import still APPLYING this long after its expiry was interrupted (its transaction can no longer be running). */
const APPLYING_GRACE_MS = 10 * 60_000
/** Abandoned, cancelled and expired import records (no rows left) are deleted after this. Applied ones are kept. */
export const IMPORT_RECORD_RETENTION_MS = 7 * 24 * 3600_000

/**
 * Cleanup of every school's imports (a preview holds names and birth dates, so it must not outlive its
 * session even if the school never comes back): expired previews lose their rows and become EXPIRED;
 * imports interrupted while applying too, after a grace period; records without rows are deleted after
 * the retention period. Runs on every import request, at server start and every few minutes
 * (instrumentation.ts). Cheap: a few statements over a small table.
 */
export async function cleanupImports(now = new Date()) {
  const expired = await db.personImport.updateMany({
    where: { OR: [
      { status: { in: ['PREVIEWED', 'FAILED'] }, expiresAt: { lt: now } },
      { status: 'APPLYING', expiresAt: { lt: new Date(now.getTime() - APPLYING_GRACE_MS) } },
    ] },
    data: { status: 'EXPIRED', rows: Prisma.DbNull },
  })
  const deleted = await db.personImport.deleteMany({ where: { status: 'EXPIRED', updatedAt: { lt: new Date(now.getTime() - IMPORT_RECORD_RETENTION_MS) } } })
  return { expired: expired.count, deleted: deleted.count }
}

/** Sheets, header rows and the detected column mapping. Nothing is stored. */
export async function inspectFile(buf: Buffer, kind: ImportKind) {
  const wb = await parseWorkbook(buf)
  return {
    sheets: wb.sheets.map((s, index) => {
      const c = detectColumns(s, kind)
      return { index, name: s.name, headerRow: c.headerRow, headers: c.headers, mapping: c.mapping, dataRows: c.dataRows, truncated: s.truncated }
    }),
  }
}

type Client = Prisma.TransactionClient | typeof db

async function loadExisting(client: Client, schoolId: string, keys: string[]): Promise<Map<string, ExistingPerson>> {
  if (!keys.length) return new Map()
  const people = await client.person.findMany({
    where: { schoolId, identityKey: { in: keys } },
    select: { id: true, identityKey: true, firstName: true, lastName: true, birthDate: true, gender: true, dataSource: true, active: true,
      roles: { select: { role: true, grade: true, parallel: true, className: true, active: true } } },
  })
  return new Map(people.map(p => [p.identityKey!, {
    id: p.id, dataSource: p.dataSource, active: p.active,
    core: { firstName: p.firstName, lastName: p.lastName, birthDate: formatDateOnly(p.birthDate), gender: p.gender },
    roles: p.roles,
  }]))
}

const planFor = (kind: ImportKind, rows: StoredRow[], existing: Map<string, ExistingPerson>) =>
  planImport(kind, rows.map(r => ({ line: r.line, identityKey: r.identityKey, core: r.core, role: r.role })), existing)

function previewRows(rows: StoredRow[], plan: PlannedRow[]): PreviewRow[] {
  return rows.map((r, i) => {
    const p = plan[i]
    const date = r.core?.birthDate ? r.core.birthDate.split('-').reverse().join('.') : null
    return {
      line: r.line, name: `${r.firstName} ${r.lastName}`.trim(), className: r.className, birthDate: date,
      idHint: r.identityHint, status: p.status, statusLabel: STATUS_LABELS[p.status], issues: r.issues,
      notes: p.status === 'DUPLICATE' ? ['אותו מזהה מופיע בקובץ יותר מפעם אחת; אף אחת מהשורות לא תיובא'] : p.notes,
    }
  })
}

/** Parses, validates and plans an import, and stores it for confirmation. No person is changed. */
export async function createPreview(input: { schoolId: string; userId: string; kind: ImportKind; fileName: string; buf: Buffer; sheetIndex: number; mapping: unknown }): Promise<ImportPreview> {
  const { schoolId, kind } = input
  const wb = await parseWorkbook(input.buf, input.sheetIndex)
  const sheet = wb.sheets[input.sheetIndex]
  if (!sheet) throw new HttpError(400, 'הגיליון שנבחר אינו קיים בקובץ')
  if (sheet.truncated) throw new HttpError(400, 'בגיליון יש נתונים מעבר לשורה 5000. פצלו את הקובץ לכמה קבצים (עד 3000 שורות בכל אחד).')
  const cols = detectColumns(sheet, kind)
  if (cols.headerRow < 0) throw new HttpError(400, 'לא נמצאה בגיליון שורת כותרות (למשל "שם פרטי", "שם משפחה", "תאריך לידה")')
  const { mapping, errors } = validateMapping(input.mapping, kind, cols.headers)
  if (errors.length) throw new HttpError(400, errors.join(' · '))
  const built = buildRows(sheet, cols.headerRow, mapping, kind, wb.date1904)
  if (built.tooMany) throw new HttpError(400, 'בגיליון יותר מ־3000 שורות. פצלו את הקובץ לכמה קבצים.')
  if (!built.rows.length) throw new HttpError(400, 'לא נמצאו שורות נתונים מתחת לשורת הכותרות')

  const rows: StoredRow[] = built.rows.map(r => {
    const keys = r.record?.externalId ? keysFor(schoolId, r.record.externalId) : null
    return {
      line: r.line, firstName: r.firstName, lastName: r.lastName,
      identityKey: keys?.identityKey ?? null, identityHint: keys?.identityHint ?? null, recordKey: keys?.recordKey ?? null,
      core: r.record ? { firstName: r.record.firstName, lastName: r.record.lastName, birthDate: r.record.birthDate, gender: r.record.gender } : null,
      role: r.record ? { grade: r.record.grade, parallel: r.record.parallel, className: r.record.className } : null,
      className: r.record?.className ?? null, issues: r.issues,
    }
  })
  const existing = await loadExisting(db, schoolId, rows.flatMap(r => (r.identityKey ? [r.identityKey] : [])))
  const plan = planFor(kind, rows, existing)
  const summary = summarize(plan)
  const fileSha256 = createHash('sha256').update(input.buf).digest('hex')
  const now = new Date()
  await cleanupImports(now)
  const recentSameFile = !!(await db.personImport.findFirst({ where: { schoolId, fileSha256, status: 'APPLIED', appliedAt: { gt: new Date(now.getTime() - 24 * 3600_000) } }, select: { id: true } }))
  const record = await db.personImport.create({
    data: {
      schoolId, createdById: input.userId, kind, fileName: input.fileName.slice(0, 120) || 'file.xlsx', fileSha256, sheetName: sheet.name.slice(0, 100),
      rows: rows as unknown as Prisma.InputJsonValue, planHash: planHash(plan), summary, expiresAt: new Date(now.getTime() + IMPORT_TTL_MS),
    },
    select: { id: true, expiresAt: true },
  })
  return { importId: record.id, kind, sheetName: sheet.name, fileName: input.fileName, expiresAt: record.expiresAt.toISOString(), summary, rows: previewRows(rows, plan), recentSameFile }
}

export class PlanChangedError extends HttpError {
  constructor(public preview: ImportPreview) { super(409, 'הנתונים במערכת השתנו מאז התצוגה המקדימה. בדקו את התצוגה המעודכנת ואשרו שוב.') }
}

export type ImportResult = { created: number; updated: number; unchanged: number; skipped: number; duplicates: number; invalid: number; failed: number }

class PlanMismatch extends Error { constructor(public plan: PlannedRow[]) { super('plan changed') } }

/** Applies a previewed import once, completely or not at all. */
export async function applyImport(input: { schoolId: string; userId: string; importId: string }): Promise<ImportResult> {
  const { schoolId, userId, importId } = input
  const now = new Date()
  await cleanupImports(now)
  const claimed = await db.personImport.updateMany({ where: { id: importId, schoolId, status: 'PREVIEWED', expiresAt: { gt: now } }, data: { status: 'APPLYING', error: null } })
  if (!claimed.count) {
    const imp = await db.personImport.findFirst({ where: { id: importId, schoolId }, select: { status: true } })
    if (!imp) throw new HttpError(404, 'הייבוא לא נמצא')
    if (imp.status === 'APPLIED') throw new HttpError(409, 'הייבוא הזה כבר בוצע')
    if (imp.status === 'APPLYING') throw new HttpError(409, 'הייבוא הזה כבר בביצוע')
    throw new HttpError(410, 'פג תוקף התצוגה המקדימה. העלו את הקובץ שוב.')
  }
  const imp = await db.personImport.findUniqueOrThrow({ where: { id: importId }, select: { kind: true, rows: true, planHash: true, summary: true, fileName: true, sheetName: true, expiresAt: true } })
  const kind = imp.kind as ImportKind
  const rows = (imp.rows ?? []) as unknown as StoredRow[]
  try {
    const result = await db.$transaction(async tx => {
      // One import at a time per school; manual edits are protected by row locks and the unique index.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'people-import:' + schoolId}))`
      const existing = await loadExisting(tx, schoolId, rows.flatMap(r => (r.identityKey ? [r.identityKey] : [])))
      const plan = planFor(kind, rows, existing)
      if (planHash(plan) !== imp.planHash) throw new PlanMismatch(plan)
      return writePlan(tx, { schoolId, userId, importId, kind, rows, plan, now })
    }, { timeout: APPLY_TIMEOUT_MS, maxWait: 10_000 })
    await db.personImport.update({ where: { id: importId }, data: { status: 'APPLIED', appliedAt: new Date(), rows: Prisma.DbNull, summary: { ...(imp.summary as object), result } } })
    return result
  } catch (e) {
    if (e instanceof PlanMismatch) {
      // Nothing was written. The import becomes a fresh preview of the current plan.
      const summary = summarize(e.plan)
      await db.personImport.update({ where: { id: importId }, data: { status: 'PREVIEWED', planHash: planHash(e.plan), summary, expiresAt: new Date(Date.now() + IMPORT_TTL_MS) } })
      throw new PlanChangedError({ importId, kind, sheetName: imp.sheetName, fileName: imp.fileName, expiresAt: new Date(Date.now() + IMPORT_TTL_MS).toISOString(), summary, rows: previewRows(rows, e.plan), recentSameFile: false })
    }
    // The transaction was rolled back: nothing was applied. The admin may try again.
    const concurrent = e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
    await db.personImport.update({ where: { id: importId }, data: { status: 'PREVIEWED', error: concurrent ? 'concurrent-identity' : 'failed' } })
    if (concurrent) throw new HttpError(409, 'רשומה עם אחד המזהים נוספה בינתיים. העלו את הקובץ שוב כדי לראות תצוגה מעודכנת. לא בוצע שום שינוי.')
    console.error(`People import apply failed: ${e instanceof Prisma.PrismaClientKnownRequestError ? `Prisma ${e.code}` : e instanceof Error ? e.name : typeof e}`)
    throw new HttpError(500, 'הייבוא נכשל ולא בוצע שום שינוי. אפשר לנסות שוב.')
  }
}

async function writePlan(tx: Prisma.TransactionClient, a: { schoolId: string; userId: string; importId: string; kind: ImportKind; rows: StoredRow[]; plan: PlannedRow[]; now: Date }): Promise<ImportResult> {
  const { schoolId, userId, importId, kind, rows, plan, now } = a
  const meta = { source: 'EXCEL', importId }
  const roleData = (r: RoleFields) => (kind === 'STUDENT' ? { grade: r.grade, parallel: r.parallel, className: r.className } : { grade: null, parallel: null, className: null })
  const audits: Prisma.PersonAuditEventCreateManyInput[] = []
  const sources: { personId: string; recordKey: string }[] = []
  const result: ImportResult = { created: 0, updated: 0, unchanged: 0, skipped: 0, duplicates: 0, invalid: 0, failed: 0 }

  // New people: a handful of statements for any number of rows.
  const fresh = plan.map((p, i) => ({ p, r: rows[i] })).filter(x => x.p.status === 'NEW')
  if (fresh.length) {
    const people = fresh.map(({ r }) => ({ id: `c${randomUUID().replace(/-/g, '')}`, r }))
    await tx.person.createMany({
      data: people.map(({ id, r }) => ({
        id, schoolId, firstName: r.core!.firstName, lastName: r.core!.lastName, birthDate: parseDateOnly(r.core!.birthDate)!, gender: r.core!.gender,
        identityKey: r.identityKey, identityKeyVersion: IDENTITY_KEY_VERSION, identityHint: r.identityHint,
        dataSource: 'EXCEL', lastSyncedAt: now, createdById: userId, updatedById: userId,
      })),
    })
    await tx.personRole.createMany({ data: people.map(({ id, r }) => ({ personId: id, role: kind, ...roleData(r.role!) })) })
    for (const { id, r } of people) {
      sources.push({ personId: id, recordKey: r.recordKey! })
      audits.push({ schoolId, personId: id, actorId: userId, action: 'CREATED', metadata: { ...meta, role: kind } }, { schoolId, personId: id, actorId: userId, action: 'IDENTITY_SET', metadata: meta })
    }
    result.created = people.length
  }

  // Existing people: only real changes are written — collected here and written with one statement per
  // table below (a statement per row would cost a database round trip each: minutes for 3,000 rows
  // on a remote database, past the transaction timeout).
  // Sent as one JSON parameter each (typed by jsonb_to_recordset), not as parallel arrays: Prisma's
  // binary encoding of some text arrays is rejected by PostgreSQL ("improper binary format").
  const upd: { id: string; fn: string | null; ln: string | null; bd: string | null; g: string | null; g_set: boolean; ds: string | null }[] = []
  const roleUpd: { person_id: string; grade: string | null; grade_set: boolean; parallel: number | null; parallel_set: boolean; class_name: string | null; class_set: boolean }[] = []
  const roleAdds: Prisma.PersonRoleCreateManyInput[] = []
  for (let i = 0; i < plan.length; i++) {
    const p = plan[i], r = rows[i]
    if (p.status === 'DUPLICATE') { result.duplicates++; continue }
    if (p.status === 'ERROR') { result.invalid++; continue }
    if (p.status === 'NEW') continue
    sources.push({ personId: p.personId!, recordKey: r.recordKey! })
    if (p.status === 'UNCHANGED') { result.unchanged++; continue }
    if (p.status === 'SKIPPED') { result.skipped++; continue }
    const core = p.core
    // Names and birth date are never cleared (sourcePrecedence): null means "keep". Gender has its own flag.
    upd.push({
      id: p.personId!, fn: core.firstName ?? null, ln: core.lastName ?? null,
      bd: core.birthDate !== undefined ? formatDateOnly(parseDateOnly(core.birthDate)!) : null,
      g: core.gender ?? null, g_set: core.gender !== undefined, ds: p.dataSource ?? null,
    })
    const fields = Object.keys(core)
    if (fields.length) audits.push({ schoolId, personId: p.personId!, actorId: userId, action: 'UPDATED', metadata: { ...meta, fields } })
    if (p.roleAction === 'add') {
      roleAdds.push({ personId: p.personId!, role: kind, ...roleData(r.role!) })
      audits.push({ schoolId, personId: p.personId!, actorId: userId, action: 'ROLE_ADDED', metadata: { ...meta, role: kind } })
    } else if (p.roleAction === 'update') {
      const set = new Set(p.roleFields), role = r.role!
      roleUpd.push({
        person_id: p.personId!,
        grade: set.has('grade') ? role.grade : null, grade_set: set.has('grade'),
        parallel: set.has('parallel') ? role.parallel : null, parallel_set: set.has('parallel'),
        class_name: set.has('className') ? role.className : null, class_set: set.has('className'),
      })
      audits.push({ schoolId, personId: p.personId!, actorId: userId, action: 'ROLE_CHANGED', metadata: { ...meta, role: kind, fields: p.roleFields } })
    }
    result.updated++
  }
  if (upd.length) {
    const changed = await tx.$executeRaw`
      UPDATE "people" AS p SET
        "firstName" = COALESCE(x.fn, p."firstName"),
        "lastName" = COALESCE(x.ln, p."lastName"),
        "birthDate" = COALESCE(x.bd::date, p."birthDate"),
        "gender" = CASE WHEN x.g_set THEN x.g::"PersonGender" ELSE p."gender" END,
        "dataSource" = COALESCE(x.ds::"PersonSourceType", p."dataSource"),
        "lastSyncedAt" = (${now}::timestamptz AT TIME ZONE 'UTC'), "updatedById" = ${userId}, "updatedAt" = (${now}::timestamptz AT TIME ZONE 'UTC')
      FROM jsonb_to_recordset(${JSON.stringify(upd)}::jsonb) AS x(id text, fn text, ln text, bd text, g text, g_set boolean, ds text)
      WHERE p."id" = x.id AND p."schoolId" = ${schoolId}`
    if (changed !== upd.length) throw new Error('people update count mismatch')
  }
  if (roleUpd.length) {
    const changed = await tx.$executeRaw`
      UPDATE "person_roles" AS r SET
        "grade" = CASE WHEN x.grade_set THEN x.grade ELSE r."grade" END,
        "parallel" = CASE WHEN x.parallel_set THEN x.parallel ELSE r."parallel" END,
        "className" = CASE WHEN x.class_set THEN x.class_name ELSE r."className" END,
        "updatedAt" = (${now}::timestamptz AT TIME ZONE 'UTC')
      FROM jsonb_to_recordset(${JSON.stringify(roleUpd)}::jsonb) AS x(person_id text, grade text, grade_set boolean, parallel int, parallel_set boolean, class_name text, class_set boolean)
      WHERE r."personId" = x.person_id AND r."role" = ${kind}::"PersonRoleType"`
    if (changed !== roleUpd.length) throw new Error('role update count mismatch')
  }
  if (roleAdds.length) await tx.personRole.createMany({ data: roleAdds })

  // The Excel source record of every matched or new person (one statement; re-links a record whose
  // person changed). Timestamps as UTC wall-clock time, like Prisma's own writes.
  if (sources.length) {
    await tx.$executeRaw`
      INSERT INTO "person_sources" ("id", "schoolId", "personId", "sourceType", "recordKey", "status", "lastSeenAt", "lastImportedAt", "lastImportId", "createdAt", "updatedAt")
      SELECT 's' || md5(random()::text || x.rk), ${schoolId}, x.pid, 'EXCEL'::"PersonSourceType", x.rk, 'ACTIVE'::"PersonSourceStatus",
        (${now}::timestamptz AT TIME ZONE 'UTC'), (${now}::timestamptz AT TIME ZONE 'UTC'), ${importId},
        (${now}::timestamptz AT TIME ZONE 'UTC'), (${now}::timestamptz AT TIME ZONE 'UTC')
      FROM jsonb_to_recordset(${JSON.stringify(sources.map(s => ({ pid: s.personId, rk: s.recordKey })))}::jsonb) AS x(pid text, rk text)
      ON CONFLICT ("schoolId", "sourceType", "recordKey") DO UPDATE SET
        "personId" = EXCLUDED."personId", "status" = 'ACTIVE', "lastSeenAt" = EXCLUDED."lastSeenAt",
        "lastImportedAt" = EXCLUDED."lastImportedAt", "lastImportId" = EXCLUDED."lastImportId", "updatedAt" = EXCLUDED."updatedAt"`
  }
  if (audits.length) await tx.personAuditEvent.createMany({ data: audits })
  return result
}

/** Cancels a previewed import: its rows are deleted at once. */
export async function cancelImport(schoolId: string, importId: string) {
  const r = await db.personImport.updateMany({ where: { id: importId, schoolId, status: { in: ['PREVIEWED', 'FAILED'] } }, data: { status: 'EXPIRED', rows: Prisma.DbNull } })
  if (!r.count) throw new HttpError(404, 'הייבוא לא נמצא או שכבר הסתיים')
}

export type { ImportKind }
