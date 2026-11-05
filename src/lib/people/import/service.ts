import { createHash, randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { HttpError } from '@/lib/apiErrors'
import { identityKeyFor, identityHintFor, sourceRecordKey, IDENTITY_KEY_VERSION, IdentityError } from '../identity'
import { formatDateOnly, parseDateOnly } from '../birthdays'
import type { CoreFields } from '../sourcePrecedence'
import { readXlsx, type Workbook } from './xlsx'
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

function parseWorkbook(buf: Buffer): Workbook {
  return readXlsx(buf)
}

/** Expired imports of the school: rows removed, status EXPIRED (also imports stuck while applying). */
export async function expireImports(schoolId: string, now = new Date()) {
  await db.personImport.updateMany({
    where: { schoolId, status: { in: ['PREVIEWED', 'FAILED', 'APPLYING'] }, expiresAt: { lt: now } },
    data: { status: 'EXPIRED', rows: Prisma.DbNull },
  })
}

/** Sheets, header rows and the detected column mapping. Nothing is stored. */
export function inspectFile(buf: Buffer, kind: ImportKind) {
  const wb = parseWorkbook(buf)
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
  const wb = parseWorkbook(input.buf)
  const sheet = wb.sheets[input.sheetIndex]
  if (!sheet) throw new HttpError(400, 'הגיליון שנבחר אינו קיים בקובץ')
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
  await expireImports(schoolId, now)
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
  await expireImports(schoolId, now)
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
    }, { timeout: 120_000, maxWait: 10_000 })
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

  // Existing people: only real changes are written.
  for (let i = 0; i < plan.length; i++) {
    const p = plan[i], r = rows[i]
    if (p.status === 'DUPLICATE') { result.duplicates++; continue }
    if (p.status === 'ERROR') { result.invalid++; continue }
    if (p.status === 'NEW') continue
    sources.push({ personId: p.personId!, recordKey: r.recordKey! })
    if (p.status === 'UNCHANGED') { result.unchanged++; continue }
    if (p.status === 'SKIPPED') { result.skipped++; continue }
    const core = p.core
    const data: Prisma.PersonUpdateInput = { lastSyncedAt: now, updatedById: userId, ...(p.dataSource ? { dataSource: p.dataSource } : {}) }
    if (core.firstName !== undefined) data.firstName = core.firstName
    if (core.lastName !== undefined) data.lastName = core.lastName
    if (core.birthDate !== undefined) data.birthDate = parseDateOnly(core.birthDate)!
    if (core.gender !== undefined) data.gender = core.gender
    await tx.person.update({ where: { id: p.personId! }, data })
    const fields = Object.keys(core)
    if (fields.length) audits.push({ schoolId, personId: p.personId!, actorId: userId, action: 'UPDATED', metadata: { ...meta, fields } })
    if (p.roleAction === 'add') {
      await tx.personRole.create({ data: { personId: p.personId!, role: kind, ...roleData(r.role!) } })
      audits.push({ schoolId, personId: p.personId!, actorId: userId, action: 'ROLE_ADDED', metadata: { ...meta, role: kind } })
    } else if (p.roleAction === 'update') {
      const patch = Object.fromEntries(p.roleFields.map(f => [f, r.role![f]]))
      await tx.personRole.update({ where: { personId_role: { personId: p.personId!, role: kind } }, data: patch })
      audits.push({ schoolId, personId: p.personId!, actorId: userId, action: 'ROLE_CHANGED', metadata: { ...meta, role: kind, fields: p.roleFields } })
    }
    result.updated++
  }

  // The Excel source record of every matched or new person (one statement; re-links a record whose
  // person changed). Timestamps as UTC wall-clock time, like Prisma's own writes.
  if (sources.length) {
    await tx.$executeRaw`
      INSERT INTO "person_sources" ("id", "schoolId", "personId", "sourceType", "recordKey", "status", "lastSeenAt", "lastImportedAt", "lastImportId", "createdAt", "updatedAt")
      SELECT 's' || md5(random()::text || x.rk), ${schoolId}, x.pid, 'EXCEL'::"PersonSourceType", x.rk, 'ACTIVE'::"PersonSourceStatus",
        (${now}::timestamptz AT TIME ZONE 'UTC'), (${now}::timestamptz AT TIME ZONE 'UTC'), ${importId},
        (${now}::timestamptz AT TIME ZONE 'UTC'), (${now}::timestamptz AT TIME ZONE 'UTC')
      FROM unnest(${sources.map(s => s.personId)}::text[], ${sources.map(s => s.recordKey)}::text[]) AS x(pid, rk)
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
