import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { readJson, HttpError } from '@/lib/apiErrors'
import { isDate, nameKey, toDbDate } from '@/lib/duty/rules'
import {
  DutyError, dutyContext, parseWeek, loadSetup, weekView, assign, moveAssignment, unassign, copyWeek, publishWeek, suggestions,
  addAbsence, removeAbsence, approveSubstitution, cancelSubstitution, swapAssignments, revertOccurrence, setWeekTemplate, applyTemplate,
  loadTemplates, createTemplate, updateTemplate, deleteTemplate, saveTemplateEntry, deleteTemplateEntry, changeFromDate,
  loadCalendar, saveCalendarDay, deleteCalendarDay,
} from '@/lib/duty/service'

// Duty roster API (/api/duty/<action>). Every action checks the user's roster access on the server
// (VIEW to read, EDIT to change the draft, PUBLISH to publish or change school rules) and works only
// on the user's own school. Bodies are strict: unknown fields make the request invalid.

export const dynamic = 'force-dynamic'
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store, private' } })

const id = z.string().min(1).max(40)
const occurrence = z.string().min(1).max(60).regex(/^[A-Za-z0-9:_-]+$/)
const date = z.string().refine(isDate, 'תאריך לא תקין')
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'שעה לא תקינה (HH:mm)')
const weekdays = z.array(z.number().int().min(0).max(6)).max(7)
const limit = z.number().int().min(0).max(50).nullable()
const name = (max = 80) => z.string().trim().min(1, 'שדה חובה').max(max)

const dateOrNull = date.nullable()
const StaffSchema = z.object({ firstName: name(60), lastName: z.string().trim().max(60).optional(), kind: z.enum(['REGULAR', 'MANUAL', 'TEMPORARY']).optional(),
  validFrom: dateOrNull.optional(), validUntil: dateOrNull.optional(), active: z.boolean().optional(), maxPerDay: limit.optional(), maxPerWeek: limit.optional(),
  unavailable: z.array(z.object({ weekday: z.number().int().min(0).max(6), periodId: id.nullable() }).strict()).max(50).optional(), notes: z.string().max(300).nullable().optional() }).strict()
const LocationSchema = z.object({ name: name(), required: z.boolean().optional(), staffNeeded: z.number().int().min(1).max(10).optional(), sortOrder: z.number().int().min(0).max(999).optional(), active: z.boolean().optional() }).strict()
const PeriodSchema = z.object({ name: name(), startTime: time, endTime: time, weekdays, sortOrder: z.number().int().min(0).max(999).optional(), active: z.boolean().optional() }).strict()
  .refine(p => p.startTime < p.endTime, { message: 'שעת הסיום חייבת להיות אחרי שעת ההתחלה', path: ['endTime'] })
const SettingsSchema = z.object({ schoolDays: weekdays, maxPerDay: limit, maxPerWeek: limit, allowOverride: z.boolean(), scheduleMode: z.enum(['WEEKLY', 'RECURRING', 'HYBRID']).optional() }).strict()
const reason = z.string().max(300).nullable().optional()
const TemplateSchema = z.object({ name: name(), effectiveFrom: date, effectiveUntil: dateOrNull, fromWeekStart: dateOrNull.optional() }).strict()
const TemplateEntrySchema = z.object({ templateId: id, weekday: z.number().int().min(0).max(6), periodId: id, locationId: id, staffId: id, replaceEntryId: id.optional(), overrideReason: reason }).strict()
const CalendarSchema = z.object({ date, kind: z.enum(['HOLIDAY', 'NO_SCHOOL', 'SPECIAL']), name: name(60) }).strict()
const MoveSchema = z.object({ id: occurrence, weekStart: date.optional(), staffId: id.optional(), date: date.optional(), periodId: id.optional(), locationId: id.optional(), overrideReason: z.string().max(300).nullable().optional() }).strict()
const AssignSchema = z.object({ weekStart: date, date, periodId: id, locationId: id, staffId: id, overrideReason: z.string().max(300).nullable().optional() }).strict()
const CopySchema = z.object({ from: date, to: date, replace: z.boolean().default(false) }).strict()
const AbsenceSchema = z.object({ staffId: id, date, periodId: id.nullable(), reason: z.string().max(200).nullable().optional() }).strict()
const SubstitutionSchema = z.object({ assignmentId: occurrence, substituteStaffId: id }).strict()
const AccessSchema = z.object({ userId: id, dutyAccess: z.enum(['NONE', 'VIEW', 'EDIT', 'PUBLISH']) }).strict()

type Params = { params: Promise<{ action: string }> }

function fail(e: unknown) {
  if (e instanceof DutyError) return json({ error: e.message, issues: e.issues }, e.status)
  if (e instanceof HttpError) return json({ error: 'קלט לא תקין' }, 400)
  if (e instanceof z.ZodError) return json({ error: e.issues[0]?.message ?? 'קלט לא תקין', fieldErrors: e.issues.map(i => ({ path: i.path.join('.'), message: i.message })) }, 400)
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return json({ error: 'הרשומה כבר קיימת' }, 409)
  console.error('Duty roster API failed:', e instanceof Error ? e.name : 'unknown')
  return json({ error: 'אירעה שגיאה. נסו שוב.' }, 500)
}

/** A record of the user's school, or 404 (also for another school's id). */
async function owned(kind: 'staff' | 'location' | 'period', recordId: string, schoolId: string) {
  const where = { id: recordId, schoolId }
  const found = kind === 'staff' ? await db.dutyStaff.findFirst({ where }) : kind === 'location' ? await db.dutyLocation.findFirst({ where }) : await db.dutyPeriod.findFirst({ where })
  if (!found) throw new DutyError(404, 'הרשומה לא נמצאה')
}

/** Periods referenced as unavailable must belong to the school. */
async function checkPeriods(ids: (string | null)[], schoolId: string) {
  const unique = [...new Set(ids.filter((x): x is string => !!x))]
  if (unique.length && (await db.dutyPeriod.count({ where: { id: { in: unique }, schoolId } })) !== unique.length) throw new DutyError(400, 'הפסקה לא תקינה')
}

function checkValidity(from?: string | null, until?: string | null) {
  if (from && until && from > until) throw new DutyError(400, 'תאריך הסיום חייב להיות אחרי תאריך ההתחלה')
}

/** Staff, period and location ids must belong to the school (and be active for new duties). */
async function checkRefs(schoolId: string, r: { staffId?: string; periodId?: string; locationId?: string }) {
  const [s, p, l] = await Promise.all([
    r.staffId ? db.dutyStaff.count({ where: { id: r.staffId, schoolId } }) : 1,
    r.periodId ? db.dutyPeriod.count({ where: { id: r.periodId, schoolId } }) : 1,
    r.locationId ? db.dutyLocation.count({ where: { id: r.locationId, schoolId } }) : 1,
  ])
  if (!s || !p || !l) throw new DutyError(404, 'הרשומה לא נמצאה')
}

const audit = (schoolId: string, userId: string, action: string, entity: string, entityId: string | null) =>
  db.dutyAuditEvent.create({ data: { schoolId, userId, action, entity, entityId } })

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { action } = await params
    const q = req.nextUrl.searchParams
    const user = await getSession()
    if (action === 'access') {
      const { schoolId } = dutyContext(user, 'PUBLISH')
      if (user!.role !== 'SCHOOL_ADMIN' && user!.role !== 'SUPER_ADMIN') throw new DutyError(403, 'רק מנהל/ת בית הספר יכול/ה לנהל הרשאות')
      const users = await db.user.findMany({ where: { schoolId }, select: { id: true, name: true, email: true, role: true, dutyAccess: true }, orderBy: { name: 'asc' } })
      return json({ data: users })
    }
    const c = dutyContext(user, action === 'suggest' ? 'EDIT' : 'VIEW')
    if (action === 'setup') return json({ data: { ...(await loadSetup(c.schoolId)), access: c.access } })
    if (action === 'week') return json({ data: await weekView(c.schoolId, parseWeek(q.get('start'))) })
    if (action === 'templates') return json({ data: await loadTemplates(c.schoolId) })
    if (action === 'calendar') {
      const r = z.object({ from: date, to: date }).parse({ from: q.get('from'), to: q.get('to') })
      if (Date.parse(r.to) - Date.parse(r.from) > 800 * 864e5) throw new DutyError(400, 'טווח ארוך מדי')
      return json({ data: await loadCalendar(c.schoolId, r.from, r.to) })
    }
    if (action === 'suggest') {
      const slot = z.object({ start: date, date, periodId: id, locationId: id, exclude: id.optional() }).parse(Object.fromEntries(q.entries()))
      return json({ data: await suggestions(c.schoolId, parseWeek(slot.start), slot, slot.exclude) })
    }
    return json({ error: 'לא נמצא' }, 404)
  } catch (e) { return fail(e) }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { action } = await params
    const user = await getSession()
    const body = await readJson(req)
    if (action === 'publish') {
      const c = dutyContext(user, 'PUBLISH')
      return json({ data: await publishWeek(c.schoolId, c.userId, parseWeek(z.object({ weekStart: date }).strict().parse(body).weekStart)) })
    }
    if (action === 'settings') {
      const c = dutyContext(user, 'PUBLISH')
      const s = SettingsSchema.parse(body)
      await db.dutySettings.upsert({ where: { schoolId: c.schoolId }, update: s, create: { schoolId: c.schoolId, ...s } })
      await audit(c.schoolId, c.userId, 'settings', 'settings', null)
      return json({ data: s })
    }
    if (action === 'access') {
      const c = dutyContext(user, 'PUBLISH')
      if (user!.role !== 'SCHOOL_ADMIN' && user!.role !== 'SUPER_ADMIN') throw new DutyError(403, 'רק מנהל/ת בית הספר יכול/ה לנהל הרשאות')
      const a = AccessSchema.parse(body)
      const target = await db.user.findFirst({ where: { id: a.userId, schoolId: c.schoolId }, select: { id: true } })
      if (!target) throw new DutyError(404, 'המשתמש לא נמצא')
      await db.user.update({ where: { id: target.id }, data: { dutyAccess: a.dutyAccess } })
      await audit(c.schoolId, c.userId, 'access_' + a.dutyAccess.toLowerCase(), 'user', target.id)
      return json({ data: a })
    }
    const c = dutyContext(user, 'EDIT')
    switch (action) {
      case 'staff': {
        // A possible duplicate (same name, any record of the school) is reported with the matches;
        // the client may then pick an existing record or confirm a different person (confirmDuplicate).
        const { confirmDuplicate, ...s } = StaffSchema.extend({ confirmDuplicate: z.boolean().optional() }).parse(body)
        await checkPeriods((s.unavailable ?? []).map(u => u.periodId), c.schoolId)
        checkValidity(s.validFrom, s.validUntil)
        if (!confirmDuplicate) {
          const key = nameKey({ firstName: s.firstName, lastName: s.lastName ?? "" })
          const existing = await db.dutyStaff.findMany({ where: { schoolId: c.schoolId }, select: { id: true, firstName: true, lastName: true, kind: true, active: true, notes: true } })
          const matches = existing.filter(e => nameKey(e) === key)
          if (matches.length) return json({ error: 'כבר יש איש צוות בשם הזה', duplicates: matches.map(m => ({ id: m.id, name: `${m.firstName} ${m.lastName}`.trim(), kind: m.kind, active: m.active, notes: m.notes })) }, 409)
        }
        const r = await db.dutyStaff.create({ data: { ...s, lastName: s.lastName ?? '', validFrom: s.validFrom ? toDbDate(s.validFrom) : null, validUntil: s.validUntil ? toDbDate(s.validUntil) : null, unavailable: s.unavailable ?? [], schoolId: c.schoolId, source: 'MANUAL' } })
        await audit(c.schoolId, c.userId, 'create', 'staff', r.id); return json({ data: { id: r.id } }, 201)
      }
      case 'location': { const r = await db.dutyLocation.create({ data: { ...LocationSchema.parse(body), schoolId: c.schoolId } }); await audit(c.schoolId, c.userId, 'create', 'location', r.id); return json({ data: { id: r.id } }, 201) }
      case 'period': { const r = await db.dutyPeriod.create({ data: { ...PeriodSchema.parse(body), schoolId: c.schoolId } }); await audit(c.schoolId, c.userId, 'create', 'period', r.id); return json({ data: { id: r.id } }, 201) }
      case 'move': { const m = MoveSchema.parse(body); const { id: key, weekStart, ...change } = m; return json({ data: await moveAssignment(c.schoolId, c.userId, key, { ...change, weekStart: weekStart ? parseWeek(weekStart) : undefined }) }) }
      case 'swap': { const b = z.object({ a: occurrence, b: occurrence, weekStart: date }).strict().parse(body); return json({ data: await swapAssignments(c.schoolId, c.userId, b.a, b.b, parseWeek(b.weekStart)) }) }
      case 'revert': { const b = z.object({ entryId: id, date }).strict().parse(body); await revertOccurrence(c.schoolId, c.userId, b.entryId, b.date); return json({ data: { ok: true } }) }
      case 'week-template': { const b = z.object({ weekStart: date, useTemplate: z.boolean() }).strict().parse(body); await setWeekTemplate(c.schoolId, c.userId, parseWeek(b.weekStart), b.useTemplate); return json({ data: { ok: true } }) }
      case 'apply-template': { const b = z.object({ weekStart: date, templateId: id, replace: z.boolean().default(false) }).strict().parse(body); return json({ data: await applyTemplate(c.schoolId, c.userId, parseWeek(b.weekStart), b.templateId, b.replace) }) }
      case 'template': { const b = TemplateSchema.parse(body); return json({ data: await createTemplate(c.schoolId, c.userId, { ...b, fromWeekStart: b.fromWeekStart ? parseWeek(b.fromWeekStart) : null }) }, 201) }
      case 'template-entry': { const { templateId, replaceEntryId, overrideReason, ...e } = TemplateEntrySchema.parse(body); await checkRefs(c.schoolId, e); return json({ data: await saveTemplateEntry(c.schoolId, c.userId, templateId, e, replaceEntryId, overrideReason) }, 201) }
      case 'change-future': { const b = z.object({ entryId: id, fromDate: date, staffId: id.nullable(), overrideReason: reason }).strict().parse(body); if (b.staffId) await checkRefs(c.schoolId, { staffId: b.staffId }); return json({ data: await changeFromDate(c.schoolId, c.userId, b.entryId, b.fromDate, b.staffId, b.overrideReason) }) }
      case 'calendar': return json({ data: await saveCalendarDay(c.schoolId, c.userId, CalendarSchema.parse(body)) }, 201)
      case 'assign': {
        const a = AssignSchema.parse(body)
        if (parseWeek(a.weekStart) !== a.weekStart) throw new DutyError(400, 'תחילת השבוע חייבת להיות יום ראשון')
        return json({ data: await assign(c.schoolId, c.userId, a) }, 201)
      }
      case 'copy': { const b = CopySchema.parse(body); return json({ data: await copyWeek(c.schoolId, c.userId, parseWeek(b.from), parseWeek(b.to), b.replace) }) }
      case 'absence': { const b = AbsenceSchema.parse(body); return json({ data: await addAbsence(c.schoolId, c.userId, { ...b, reason: b.reason ?? null }) }, 201) }
      case 'substitution': { const b = SubstitutionSchema.parse(body); return json({ data: await approveSubstitution(c.schoolId, c.userId, b.assignmentId, b.substituteStaffId) }, 201) }
    }
    return json({ error: 'לא נמצא' }, 404)
  } catch (e) { return fail(e) }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { action } = await params
    const c = dutyContext(await getSession(), 'EDIT')
    const body = await readJson(req) as Record<string, unknown>
    const recordId = id.parse(body?.id)
    const rest = { ...body }; delete rest.id
    if (action === 'staff') {
      await owned('staff', recordId, c.schoolId)
      const s = StaffSchema.partial().parse(rest); await checkPeriods((s.unavailable ?? []).map(u => u.periodId), c.schoolId)
      const current = await db.dutyStaff.findUniqueOrThrow({ where: { id: recordId }, select: { validFrom: true, validUntil: true } })
      checkValidity(s.validFrom !== undefined ? s.validFrom : current.validFrom?.toISOString().slice(0, 10), s.validUntil !== undefined ? s.validUntil : current.validUntil?.toISOString().slice(0, 10))
      const { validFrom, validUntil, ...restStaff } = s
      await db.dutyStaff.update({ where: { id: recordId }, data: { ...restStaff,
        ...(validFrom !== undefined ? { validFrom: validFrom ? toDbDate(validFrom) : null } : {}),
        ...(validUntil !== undefined ? { validUntil: validUntil ? toDbDate(validUntil) : null } : {}) } })
    } else if (action === 'location') { await owned('location', recordId, c.schoolId); await db.dutyLocation.update({ where: { id: recordId }, data: LocationSchema.partial().parse(rest) }) }
    else if (action === 'period') {
      await owned('period', recordId, c.schoolId)
      const p = z.object({ name: name(), startTime: time, endTime: time, weekdays, sortOrder: z.number().int().min(0).max(999), active: z.boolean() }).partial().strict().parse(rest)
      const current = await db.dutyPeriod.findUniqueOrThrow({ where: { id: recordId } })
      if ((p.startTime ?? current.startTime) >= (p.endTime ?? current.endTime)) throw new DutyError(400, 'שעת הסיום חייבת להיות אחרי שעת ההתחלה')
      await db.dutyPeriod.update({ where: { id: recordId }, data: p })
    } else if (action === 'template') {
      await updateTemplate(c.schoolId, c.userId, recordId, z.object({ name: name().optional(), effectiveFrom: date.optional(), effectiveUntil: dateOrNull.optional() }).strict().parse(rest))
      return json({ data: { id: recordId } })
    } else return json({ error: 'לא נמצא' }, 404)
    await audit(c.schoolId, c.userId, 'update', action, recordId)
    return json({ data: { id: recordId } })
  } catch (e) { return fail(e) }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { action } = await params
    const c = dutyContext(await getSession(), 'EDIT')
    const recordId = (action === 'assign' ? occurrence : id).parse(req.nextUrl.searchParams.get('id'))
    switch (action) {
      case 'template': await deleteTemplate(c.schoolId, c.userId, recordId); break
      case 'template-entry': await deleteTemplateEntry(c.schoolId, c.userId, recordId); break
      case 'calendar': await deleteCalendarDay(c.schoolId, c.userId, recordId); break
      case 'assign': await unassign(c.schoolId, c.userId, recordId); break
      case 'absence': await removeAbsence(c.schoolId, c.userId, recordId); break
      case 'substitution': await cancelSubstitution(c.schoolId, c.userId, recordId); break
      case 'staff': case 'location': case 'period': {
        // Records used in a roster are deactivated (history and published rosters keep their names);
        // unused ones are deleted.
        await owned(action, recordId, c.schoolId)
        const used = action === 'staff' ? await db.dutyAssignment.count({ where: { staffId: recordId } }) : action === 'location' ? await db.dutyAssignment.count({ where: { locationId: recordId } }) : await db.dutyAssignment.count({ where: { periodId: recordId } })
        if (used) {
          if (action === 'staff') await db.dutyStaff.update({ where: { id: recordId }, data: { active: false } })
          else if (action === 'location') await db.dutyLocation.update({ where: { id: recordId }, data: { active: false } })
          else await db.dutyPeriod.update({ where: { id: recordId }, data: { active: false } })
        } else if (action === 'staff') await db.dutyStaff.delete({ where: { id: recordId } })
        else if (action === 'location') await db.dutyLocation.delete({ where: { id: recordId } })
        else await db.dutyPeriod.delete({ where: { id: recordId } })
        await audit(c.schoolId, c.userId, used ? 'deactivate' : 'delete', action, recordId)
        return json({ data: { id: recordId, deactivated: used > 0 } })
      }
      default: return json({ error: 'לא נמצא' }, 404)
    }
    return json({ data: { id: recordId } })
  } catch (e) { return fail(e) }
}
