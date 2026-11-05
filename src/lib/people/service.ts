import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { HttpError } from '@/lib/apiErrors'
import type { AuthUser } from '@/types'
import { normalizeExternalId, identityKeyFor, identityHintFor, sourceRecordKey, IDENTITY_KEY_VERSION, IdentityError } from './identity'
import { birthMonthDay, formatDateOnly, parseDateOnly } from './birthdays'
import { gradeOrder, normalizeGrade } from './grades'
import type { NormalizedPersonRecord, PersonRoleType } from './normalize'

// All database access of the birthday module. Every function takes the school id from the signed-in
// user (peopleSchoolId) and puts it in every query; ids from the request are always combined with it,
// so another school's person is "not found". Only the fields listed in the DTOs leave this file:
// never identityKey, never the raw identifier.

/** The school whose people the user manages. Personal data is handled per school only: also a
 *  SUPER_ADMIN works on the school they are assigned to (none assigned → no access). */
export function peopleSchoolId(user: AuthUser): string {
  if (!user.schoolId) throw new HttpError(400, 'המשתמש אינו משויך לבית ספר')
  return user.schoolId
}

export type PersonListItem = {
  id: string; firstName: string; lastName: string; birthDay: number; birthMonth: number
  gender: 'MALE' | 'FEMALE' | null; active: boolean; roleActive: boolean
  grade: string | null; parallel: number | null; className: string | null
  dataSource: 'MANUAL' | 'EXCEL' | 'SMARTSCHOOL'; identityHint: string | null; otherRole: boolean; updatedAt: string
}
export type PersonDetail = {
  id: string; firstName: string; lastName: string; birthDate: string; gender: 'MALE' | 'FEMALE' | null
  active: boolean; dataSource: 'MANUAL' | 'EXCEL' | 'SMARTSCHOOL'; identityHint: string | null; hasIdentity: boolean
  roles: { role: PersonRoleType; grade: string | null; parallel: number | null; className: string | null; active: boolean }[]
  sources: { sourceType: 'MANUAL' | 'EXCEL' | 'SMARTSCHOOL'; status: string; lastImportedAt: string | null }[]
  lastSyncedAt: string | null; createdAt: string; updatedAt: string
}

export type ListQuery = {
  role: PersonRoleType; status: 'active' | 'inactive' | 'all'; q?: string; grade?: string; className?: string
  page: number; pageSize: number
}

const personSelect = {
  id: true, firstName: true, lastName: true, birthDate: true, gender: true, active: true, dataSource: true,
  identityHint: true, identityKey: true, lastSyncedAt: true, createdAt: true, updatedAt: true,
  roles: { select: { role: true, grade: true, parallel: true, className: true, active: true } },
  sources: { select: { sourceType: true, status: true, lastImportedAt: true } },
} satisfies Prisma.PersonSelect
type PersonRow = Prisma.PersonGetPayload<{ select: typeof personSelect }>

function toDetail(p: PersonRow): PersonDetail {
  return {
    id: p.id, firstName: p.firstName, lastName: p.lastName, birthDate: formatDateOnly(p.birthDate), gender: p.gender,
    active: p.active, dataSource: p.dataSource, identityHint: p.identityHint, hasIdentity: !!p.identityKey,
    roles: p.roles.map(r => ({ role: r.role, grade: r.grade, parallel: r.parallel, className: r.className, active: r.active })),
    sources: p.sources.map(s => ({ sourceType: s.sourceType, status: s.status, lastImportedAt: s.lastImportedAt?.toISOString() ?? null })),
    lastSyncedAt: p.lastSyncedAt?.toISOString() ?? null, createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString(),
  }
}

/** A page of people of one role. Search matches first or last name (case-insensitive). */
export async function listPeople(schoolId: string, q: ListQuery) {
  const roleWhere: Prisma.PersonRoleWhereInput = {
    role: q.role,
    ...(q.role === 'STUDENT' && q.grade ? { grade: q.grade } : {}),
    ...(q.role === 'STUDENT' && q.className ? { className: q.className } : {}),
  }
  const terms = (q.q ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 4)
  const where: Prisma.PersonWhereInput = {
    schoolId,
    roles: { some: roleWhere },
    ...(q.status === 'active' ? { active: true } : q.status === 'inactive' ? { active: false } : {}),
    ...(terms.length ? { AND: terms.map(t => ({ OR: [{ firstName: { contains: t, mode: 'insensitive' as const } }, { lastName: { contains: t, mode: 'insensitive' as const } }] })) } : {}),
  }
  const [total, rows, facetRows] = await Promise.all([
    db.person.count({ where }),
    db.person.findMany({ where, select: personSelect, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    q.role === 'STUDENT'
      ? db.personRole.findMany({ where: { role: 'STUDENT', person: { schoolId } }, select: { grade: true, className: true }, distinct: ['grade', 'className'] })
      : Promise.resolve([] as { grade: string | null; className: string | null }[]),
  ])
  const items: PersonListItem[] = rows.map(p => {
    const r = p.roles.find(x => x.role === q.role)!
    const md = birthMonthDay(p.birthDate)!
    return {
      id: p.id, firstName: p.firstName, lastName: p.lastName, birthDay: md.day, birthMonth: md.month, gender: p.gender,
      active: p.active, roleActive: r.active, grade: r.grade, parallel: r.parallel, className: r.className,
      dataSource: p.dataSource, identityHint: p.identityHint, otherRole: p.roles.some(x => x.role !== q.role), updatedAt: p.updatedAt.toISOString(),
    }
  })
  const grades = [...new Set(facetRows.map(f => f.grade).filter((g): g is string => !!g))].sort((a, b) => gradeOrder(a) - gradeOrder(b))
  const classes = [...new Set(facetRows.filter(f => !q.grade || f.grade === q.grade).map(f => f.className).filter((c): c is string => !!c))]
    .sort((a, b) => a.localeCompare(b, 'he', { numeric: true }))
  return { items, total, page: q.page, pageSize: q.pageSize, facets: { grades, classes } }
}

export async function getPerson(schoolId: string, id: string): Promise<PersonDetail> {
  const p = await db.person.findFirst({ where: { id, schoolId }, select: personSelect })
  if (!p) throw new HttpError(404, 'האדם לא נמצא')
  return toDetail(p)
}

function identityFor(schoolId: string, externalId: string | null) {
  if (externalId === null) return null
  const normalized = normalizeExternalId(externalId)
  if (!normalized) throw new HttpError(400, 'המזהה אינו תקין (ספרות ואותיות לטיניות בלבד, עד 20 תווים)')
  try {
    return { identityKey: identityKeyFor(schoolId, normalized), identityKeyVersion: IDENTITY_KEY_VERSION, identityHint: identityHintFor(normalized) }
  } catch (e) {
    if (e instanceof IdentityError) throw new HttpError(503, 'זיהוי לפי מזהה אינו מוגדר בשרת. פנו למנהל המערכת.')
    throw e
  }
}

/** Another person of the school with the same identity, if any (for a clear 409). */
async function identityOwner(schoolId: string, identityKey: string, exceptId?: string) {
  return db.person.findFirst({ where: { schoolId, identityKey, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true, firstName: true, lastName: true, roles: { select: { role: true } } } })
}

export class DuplicateIdentityError extends HttpError {
  constructor(public existing: { id: string; name: string; roles: PersonRoleType[] }) {
    super(409, 'כבר קיים בבית הספר אדם עם המזהה הזה')
  }
}

const roleData = (r: NormalizedPersonRecord) => r.role === 'STUDENT'
  ? { grade: r.grade, parallel: r.parallel, className: r.className }
  : { grade: null, parallel: null, className: null }

type Tx = Prisma.TransactionClient
type AuditAction = 'CREATED' | 'UPDATED' | 'ROLE_ADDED' | 'ROLE_CHANGED' | 'DEACTIVATED' | 'REACTIVATED' | 'IDENTITY_SET' | 'IDENTITY_REPLACED' | 'IDENTITY_REMOVED'

/** Audit records in the same transaction as the change. Metadata: field names and role types only. */
function audit(tx: Tx, schoolId: string, personId: string, actorId: string, events: { action: AuditAction; metadata?: Record<string, unknown> }[]) {
  if (!events.length) return Promise.resolve()
  return tx.personAuditEvent.createMany({
    data: events.map(e => ({ schoolId, personId, actorId, action: e.action, ...(e.metadata ? { metadata: e.metadata as Prisma.InputJsonValue } : {}) })),
  })
}

/** Locks the person row for the rest of the transaction (concurrent edits of one person queue up). */
async function lockPerson(tx: Tx, schoolId: string, id: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM people WHERE id = ${id} AND "schoolId" = ${schoolId} FOR UPDATE`
  if (!rows.length) throw new HttpError(404, 'האדם לא נמצא')
}

const duplicateFrom = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
  ? new HttpError(409, 'כבר קיים בבית הספר אדם עם המזהה הזה') : e

/** Adds a person by hand. An identifier already used in the school is a 409 (no duplicate is made;
 *  the unique index on (schoolId, identityKey) also settles concurrent requests). */
export async function createPerson(schoolId: string, userId: string, r: NormalizedPersonRecord): Promise<PersonDetail> {
  const identity = identityFor(schoolId, r.externalId)
  if (identity) {
    const owner = await identityOwner(schoolId, identity.identityKey)
    if (owner) throw new DuplicateIdentityError({ id: owner.id, name: `${owner.firstName} ${owner.lastName}`, roles: owner.roles.map(x => x.role) })
  }
  try {
    const id = await db.$transaction(async tx => {
      const p = await tx.person.create({
        data: {
          schoolId, firstName: r.firstName, lastName: r.lastName, birthDate: parseDateOnly(r.birthDate)!, gender: r.gender,
          ...(identity ?? {}), dataSource: 'MANUAL', createdById: userId, updatedById: userId,
          roles: { create: { role: r.role, ...roleData(r) } },
        },
        select: { id: true },
      })
      await tx.personSource.create({ data: { schoolId, personId: p.id, sourceType: 'MANUAL', recordKey: sourceRecordKey(schoolId, 'MANUAL', p.id) } })
      await audit(tx, schoolId, p.id, userId, [
        { action: 'CREATED', metadata: { role: r.role, source: 'MANUAL' } },
        ...(identity ? [{ action: 'IDENTITY_SET' as const }] : []),
      ])
      return p.id
    })
    return getPerson(schoolId, id)
  } catch (e) { throw duplicateFrom(e) }
}

export type PersonPatch = {
  firstName?: string; lastName?: string; birthDate?: string; gender?: 'MALE' | 'FEMALE' | null
  /** A new identifier (replaces the stored one); null removes it. */
  externalId?: string | null
  /** Adds or updates one role. */
  role?: { role: PersonRoleType; grade: string | null; parallel: number | null; className: string | null; active: boolean }
}

/** Updates the allowed fields of a person of the school. Only real changes are written and audited. */
export async function updatePerson(schoolId: string, userId: string, id: string, patch: PersonPatch): Promise<PersonDetail> {
  // Outside the transaction: hashing and the duplicate lookup (a clear 409 with the other record).
  const identity = patch.externalId !== undefined ? identityFor(schoolId, patch.externalId) : undefined
  if (identity) {
    const owner = await identityOwner(schoolId, identity.identityKey, id)
    if (owner) throw new DuplicateIdentityError({ id: owner.id, name: `${owner.firstName} ${owner.lastName}`, roles: owner.roles.map(x => x.role) })
  }
  try {
    await db.$transaction(async tx => {
      await lockPerson(tx, schoolId, id)
      const cur = await tx.person.findUniqueOrThrow({ where: { id }, select: { firstName: true, lastName: true, birthDate: true, gender: true, identityKey: true, roles: { select: { role: true, grade: true, parallel: true, className: true, active: true } } } })
      const data: Prisma.PersonUpdateInput = {}
      const changed: string[] = []
      if (patch.firstName !== undefined && patch.firstName !== cur.firstName) { data.firstName = patch.firstName; changed.push('firstName') }
      if (patch.lastName !== undefined && patch.lastName !== cur.lastName) { data.lastName = patch.lastName; changed.push('lastName') }
      if (patch.birthDate !== undefined && patch.birthDate !== formatDateOnly(cur.birthDate)) { data.birthDate = parseDateOnly(patch.birthDate)!; changed.push('birthDate') }
      if (patch.gender !== undefined && patch.gender !== cur.gender) { data.gender = patch.gender; changed.push('gender') }
      const events: { action: AuditAction; metadata?: Record<string, unknown> }[] = []
      if (changed.length) events.push({ action: 'UPDATED', metadata: { fields: changed } })
      if (identity !== undefined) {
        if (identity && identity.identityKey !== cur.identityKey) { Object.assign(data, identity); events.push({ action: cur.identityKey ? 'IDENTITY_REPLACED' : 'IDENTITY_SET' }) }
        if (!identity && cur.identityKey) { Object.assign(data, { identityKey: null, identityKeyVersion: null, identityHint: null }); events.push({ action: 'IDENTITY_REMOVED' }) }
      }
      if (patch.role) {
        const r = patch.role
        const fields = r.role === 'STUDENT' ? { grade: r.grade, parallel: r.parallel, className: r.className, active: r.active } : { grade: null, parallel: null, className: null, active: r.active }
        const before = cur.roles.find(x => x.role === r.role)
        if (!before) {
          await tx.personRole.create({ data: { personId: id, role: r.role, ...fields } })
          events.push({ action: 'ROLE_ADDED', metadata: { role: r.role } })
        } else {
          const roleChanged = (Object.keys(fields) as (keyof typeof fields)[]).filter(k => fields[k] !== before[k])
          if (roleChanged.length) {
            await tx.personRole.update({ where: { personId_role: { personId: id, role: r.role } }, data: fields })
            events.push({ action: 'ROLE_CHANGED', metadata: { role: r.role, fields: roleChanged } })
          }
        }
      }
      if (!events.length) return // nothing changed: no write, no audit
      await tx.person.update({ where: { id }, data: { ...data, updatedById: userId } })
      await audit(tx, schoolId, id, userId, events)
    })
  } catch (e) { throw duplicateFrom(e) }
  return getPerson(schoolId, id)
}

/** Deactivates or reactivates a person (never deletes). A request that changes nothing is not audited. */
export async function setPersonActive(schoolId: string, userId: string, id: string, active: boolean): Promise<PersonDetail> {
  await db.$transaction(async tx => {
    await lockPerson(tx, schoolId, id)
    const cur = await tx.person.findUniqueOrThrow({ where: { id }, select: { active: true } })
    if (cur.active === active) return
    await tx.person.update({ where: { id }, data: { active, deactivatedAt: active ? null : new Date(), updatedById: userId } })
    await audit(tx, schoolId, id, userId, [{ action: active ? 'REACTIVATED' : 'DEACTIVATED' }])
  })
  return getPerson(schoolId, id)
}

/** The person of the school with this identifier, if any (for imports and duplicate checks). */
export async function findPersonByExternalId(schoolId: string, externalId: string) {
  const normalized = normalizeExternalId(externalId)
  if (!normalized) return null
  const p = await db.person.findFirst({ where: { schoolId, identityKey: identityKeyFor(schoolId, normalized) }, select: personSelect })
  return p ? toDetail(p) : null
}

/** Canonical grade filter value from a query string, or undefined. */
export const gradeFilter = (raw: string | null) => (raw ? normalizeGrade(raw) ?? undefined : undefined)
