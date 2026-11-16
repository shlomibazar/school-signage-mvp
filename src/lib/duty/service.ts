// Duty roster data access. Every function takes the school id resolved from the signed-in user
// (dutyContext), so records of another school are never read or changed: lookups by id always
// include the school id. Every change runs in a transaction that first takes a per-school lock
// (pg_advisory_xact_lock), so two concurrent edits are validated one after the other, and writes an
// audit event.
//
// One engine for the three ways of planning (see DutyScheduleMode): a week's duties are its own
// rows plus, when the week follows the recurring template, the template occurrences of its dates
// (computed by expandWeek, never stored per date). A one-time change of a template occurrence is a
// skip of that occurrence on its date (plus, for a replacement, a week row that records which
// occurrence it replaces); a change "from a date on" starts a new template version.

import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import type { AuthUser } from '@/types'
import {
  type WeekContext, type DutyAccessLevel, type DutyPublishedEntry, type Issue, type TemplateRule, type ScheduleMode, type AssignmentRule,
  validateAssignment, validateTemplateEntry, blocking, FIXED_ISSUES, coverageGaps, impactedAssignments, buildSnapshot, suggestStaff,
  expandWeek, weekUsesTemplate, templateOn, parseOccurrence, occurrenceKey,
  weekStartOf, addDays, weekdayOf, isDate, toDbDate, fromDbDate, dutyAccessOf, hasDutyAccess, DEFAULT_SETTINGS, staffName,
} from './rules'

export class DutyError extends Error {
  constructor(public status: number, message: string, public issues?: Issue[]) { super(message) }
}

/** The school and access of the signed-in user, or a 401/403 DutyError. */
export function dutyContext(user: AuthUser | null, need: DutyAccessLevel): { schoolId: string; userId: string; access: DutyAccessLevel } {
  if (!user) throw new DutyError(401, 'יש להתחבר מחדש')
  const access = dutyAccessOf(user)
  if (!hasDutyAccess(access, need)) throw new DutyError(403, 'אין לך הרשאה לפעולה הזו בלוח התורנויות')
  if (!user.schoolId) throw new DutyError(400, 'המשתמש אינו משויך לבית ספר')
  return { schoolId: user.schoolId, userId: user.id, access }
}

type Tx = Prisma.TransactionClient
const audit = (tx: Tx, schoolId: string, userId: string, action: string, entity: string, entityId: string | null, details?: Prisma.InputJsonValue) =>
  tx.dutyAuditEvent.create({ data: { schoolId, userId, action, entity, entityId, details } })

/** A change of the school's roster: serialized per school, then validated on fresh data. */
function change<T>(schoolId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'duty:' + schoolId}))`
    return fn(tx)
  }, { timeout: 15000 })
}

export function parseWeek(value: string | null | undefined): string {
  if (!value || !isDate(value)) throw new DutyError(400, 'תאריך לא תקין')
  return weekStartOf(value)
}

function reject(issues: Issue[], reason: string | null, allowOverride: boolean) {
  const errors = blocking(issues)
  const fixed = errors.find(e => FIXED_ISSUES.includes(e.code))
  if (fixed) throw new DutyError(409, fixed.message, issues)
  if (errors.length && (!reason || !allowOverride)) throw new DutyError(409, errors[0].message, issues)
  return errors
}

// ── Setup ──────────────────────────────────────────────────────────────────────

const unavailableOf = (v: Prisma.JsonValue | null): WeekContext['staff'][number]['unavailable'] =>
  Array.isArray(v) ? v.flatMap(u => u && typeof u === 'object' && !Array.isArray(u) && typeof (u as { weekday?: unknown }).weekday === 'number'
    ? [{ weekday: (u as { weekday: number }).weekday, periodId: typeof (u as { periodId?: unknown }).periodId === 'string' ? (u as { periodId: string }).periodId : null }] : []) : []

export async function loadSetup(schoolId: string, client: Tx | typeof db = db) {
  const [staff, locations, periods, settings] = await Promise.all([
    client.dutyStaff.findMany({ where: { schoolId }, orderBy: [{ active: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }] }),
    client.dutyLocation.findMany({ where: { schoolId }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    client.dutyPeriod.findMany({ where: { schoolId }, orderBy: [{ sortOrder: 'asc' }, { startTime: 'asc' }] }),
    client.dutySettings.findUnique({ where: { schoolId } }),
  ])
  return {
    staff: staff.map(s => ({ id: s.id, firstName: s.firstName, lastName: s.lastName, active: s.active, maxPerDay: s.maxPerDay, maxPerWeek: s.maxPerWeek, unavailable: unavailableOf(s.unavailable), notes: s.notes, source: s.source, externalRef: s.externalRef,
      kind: s.kind, validFrom: s.validFrom ? fromDbDate(s.validFrom) : null, validUntil: s.validUntil ? fromDbDate(s.validUntil) : null })),
    locations: locations.map(l => ({ id: l.id, name: l.name, required: l.required, staffNeeded: l.staffNeeded, active: l.active, sortOrder: l.sortOrder })),
    periods: periods.map(p => ({ id: p.id, name: p.name, startTime: p.startTime, endTime: p.endTime, weekdays: p.weekdays, active: p.active, sortOrder: p.sortOrder })),
    settings: settings ? { schoolDays: settings.schoolDays, maxPerDay: settings.maxPerDay, maxPerWeek: settings.maxPerWeek, allowOverride: settings.allowOverride, scheduleMode: settings.scheduleMode as ScheduleMode } : DEFAULT_SETTINGS,
  }
}

async function templatesOf(client: Tx | typeof db, schoolId: string, from?: string, to?: string): Promise<TemplateRule[]> {
  const rows = await client.dutyTemplate.findMany({
    where: { schoolId, ...(from && to ? { effectiveFrom: { lte: toDbDate(to) }, OR: [{ effectiveUntil: null }, { effectiveUntil: { gte: toDbDate(from) } }] } : {}) },
    include: { entries: true }, orderBy: { effectiveFrom: 'asc' },
  })
  return rows.map(t => ({ id: t.id, name: t.name, effectiveFrom: fromDbDate(t.effectiveFrom), effectiveUntil: t.effectiveUntil ? fromDbDate(t.effectiveUntil) : null,
    entries: t.entries.map(e => ({ id: e.id, weekday: e.weekday, periodId: e.periodId, locationId: e.locationId, staffId: e.staffId })) }))
}

export async function loadTemplates(schoolId: string) { return templatesOf(db, schoolId) }

export async function loadCalendar(schoolId: string, from: string, to: string) {
  const rows = await db.dutyCalendarDay.findMany({ where: { schoolId, date: { gte: toDbDate(from), lte: toDbDate(to) } }, orderBy: { date: 'asc' } })
  return rows.map(c => ({ id: c.id, date: fromDbDate(c.date), kind: c.kind, name: c.name }))
}

// ── Week ───────────────────────────────────────────────────────────────────────

/**
 * The week's record. A change pins the week's way of planning (`useTemplate`, as it is resolved now),
 * so a later change of the school's mode does not change weeks already worked on.
 */
async function weekRecord(tx: Tx, schoolId: string, weekStart: string, useTemplate?: boolean) {
  const w = await tx.dutyWeek.upsert({ where: { schoolId_weekStart: { schoolId, weekStart: toDbDate(weekStart) } }, update: {}, create: { schoolId, weekStart: toDbDate(weekStart), useTemplate: useTemplate ?? null } })
  if (w.useTemplate === null && useTemplate !== undefined) return tx.dutyWeek.update({ where: { id: w.id }, data: { useTemplate } })
  return w
}

/** Everything the rules need for one week, with the effective (template + week) duties. */
async function contextFor(client: Tx | typeof db, schoolId: string, weekStart: string) {
  const end = addDays(weekStart, 6)
  const range = { gte: toDbDate(weekStart), lte: toDbDate(end) }
  const [setup, week, absences, calendar, templates, skips] = await Promise.all([
    loadSetup(schoolId, client),
    client.dutyWeek.findUnique({ where: { schoolId_weekStart: { schoolId, weekStart: toDbDate(weekStart) } }, select: { id: true, useTemplate: true, published: true, publishedAt: true } }),
    client.dutyAbsence.findMany({ where: { schoolId, date: range } }),
    client.dutyCalendarDay.findMany({ where: { schoolId, date: range } }),
    templatesOf(client, schoolId, weekStart, end),
    client.dutyTemplateSkip.findMany({ where: { schoolId, date: range } }),
  ])
  const rows = week ? await client.dutyAssignment.findMany({ where: { schoolId, weekId: week.id } }) : []
  const useTemplate = week?.useTemplate ?? (rows.some(r => !r.overrideOfEntryId) ? false : weekUsesTemplate(null, setup.settings.scheduleMode))
  const base = { staff: setup.staff, periods: setup.periods, locations: setup.locations, settings: setup.settings,
    calendar: calendar.map(c => ({ date: fromDbDate(c.date), kind: c.kind, name: c.name })),
    absences: absences.map(a => ({ id: a.id, staffId: a.staffId, date: fromDbDate(a.date), periodId: a.periodId })) }
  const assignments = expandWeek(base, weekStart, useTemplate, templates,
    skips.map(k => ({ entryId: k.entryId, date: fromDbDate(k.date) })),
    rows.map(r => ({ id: r.id, date: fromDbDate(r.date), periodId: r.periodId, locationId: r.locationId, staffId: r.staffId, overrideOfEntryId: r.overrideOfEntryId })))
  const ctx: WeekContext = { ...base, assignments }
  return { ctx, week, rows, useTemplate, templates, skips: skips.map(k => ({ entryId: k.entryId, date: fromDbDate(k.date) })) }
}

/** Substitutions of the given occurrences (week rows by id, template occurrences by key). */
async function substitutionsFor(client: Tx | typeof db, schoolId: string, keys: string[]) {
  if (!keys.length) return []
  const subs = await client.dutySubstitution.findMany({ where: { schoolId, occurrenceKey: { in: keys } }, orderBy: { approvedAt: 'desc' } })
  return subs.map(s => ({ id: s.id, assignmentId: s.occurrenceKey!, substituteStaffId: s.substituteStaffId, cancelled: !!s.cancelledAt, approvedAt: s.approvedAt }))
}

const sameSnapshot = (a: unknown, b: DutyPublishedEntry[]) => {
  if (!Array.isArray(a) || a.length !== b.length) return false
  const k = (e: DutyPublishedEntry) => [e.date, e.periodId, e.locationId, e.staffId ?? '', e.periodName, e.locationName, e.startTime, e.endTime, e.staffName ?? ''].join('|')
  const x = (a as DutyPublishedEntry[]).map(k).sort(), y = b.map(k).sort()
  return x.every((v, i) => v === y[i])
}

/** The admin view of a week: effective duties (with origin), publication state, gaps, absences. */
export async function weekView(schoolId: string, weekStart: string) {
  const { ctx, week, rows, useTemplate, templates, skips } = await contextFor(db, schoolId, weekStart)
  // Template duties cancelled on a date (skipped, not replaced): shown so they can be restored.
  const replaced = new Set(rows.filter(r => r.overrideOfEntryId).map(r => r.overrideOfEntryId + '|' + fromDbDate(r.date)))
  const cancelled = useTemplate ? skips.filter(k => !replaced.has(k.entryId + '|' + k.date)).flatMap(k => {
    const e = templateOn(templates, k.date)?.entries.find(x => x.id === k.entryId)
    return e ? [{ entryId: e.id, date: k.date, periodId: e.periodId, locationId: e.locationId, staffId: e.staffId }] : []
  }) : []
  const substitutions = await substitutionsFor(db, schoolId, ctx.assignments.map(a => a.id))
  const absenceRows = await db.dutyAbsence.findMany({ where: { schoolId, date: { gte: toDbDate(weekStart), lte: toDbDate(addDays(weekStart, 6)) } }, orderBy: { date: 'asc' } })
  const reasons = new Map(rows.map(r => [r.id, r.overrideReason]))
  // Published = the snapshot equals what would be published now (template edits count as changes).
  const status = !week?.publishedAt ? 'draft' : sameSnapshot(week.published, buildSnapshot(ctx, weekStart)) ? 'published' : 'changed'
  return {
    weekStart, status, publishedAt: week?.publishedAt ?? null,
    useTemplate, weekChoice: week?.useTemplate ?? null, scheduleMode: ctx.settings.scheduleMode ?? 'WEEKLY',
    templates: [...new Map(ctx.assignments.length || useTemplate ? templates.map(t => [t.id, { id: t.id, name: t.name, effectiveFrom: t.effectiveFrom, effectiveUntil: t.effectiveUntil }]) : []).values()],
    calendar: ctx.calendar ?? [], cancelled,
    assignments: ctx.assignments.map(a => ({ ...a, overrideReason: reasons.get(a.id) ?? null })),
    gaps: coverageGaps(ctx, weekStart),
    absences: absenceRows.map(a => ({ id: a.id, staffId: a.staffId, date: fromDbDate(a.date), periodId: a.periodId, reason: a.reason, source: a.source })),
    impacted: impactedAssignments(ctx, substitutions).map(i => ({ assignmentId: i.assignment.id, substituteStaffId: i.substitution?.substituteStaffId ?? null, substitutionId: i.substitution?.id ?? null })),
    substitutions,
  }
}

export type AssignInput = { weekStart: string; date: string; periodId: string; locationId: string; staffId: string; overrideReason?: string | null }

/**
 * Adds a duty to the week (independent planning, or a one-time addition on a template week),
 * validated against the effective week inside the locked transaction. Rule errors reject the change
 * unless the school allows overrides and a reason is given (stored and audited).
 */
export async function assign(schoolId: string, userId: string, input: AssignInput) {
  return change(schoolId, async tx => {
    const { ctx, useTemplate } = await contextFor(tx, schoolId, input.weekStart)
    const issues = validateAssignment(ctx, input.weekStart, input)
    const reason = input.overrideReason?.trim() || null
    const errors = reject(issues, reason, ctx.settings.allowOverride)
    const week = await weekRecord(tx, schoolId, input.weekStart, useTemplate)
    const created = await tx.dutyAssignment.create({ data: {
      schoolId, weekId: week.id, date: toDbDate(input.date), periodId: input.periodId, locationId: input.locationId, staffId: input.staffId,
      overrideReason: errors.length ? reason : null, overrideById: errors.length ? userId : null, createdById: userId,
    } })
    await tx.dutyWeek.update({ where: { id: week.id }, data: { draftVersion: { increment: 1 } } })
    await audit(tx, schoolId, userId, errors.length ? 'assign_override' : 'assign', 'assignment', created.id,
      { date: input.date, periodId: input.periodId, locationId: input.locationId, staffId: input.staffId, ...(errors.length ? { reason, overridden: errors.map(e => e.code) } : {}) })
    return { id: created.id, warnings: issues.filter(i => i.severity === 'warning') }
  })
}

type OccurrenceChange = { staffId?: string; date?: string; periodId?: string; locationId?: string; overrideReason?: string | null }

/**
 * Changes one occurrence on its date (reassign and/or move to another slot of the same week). A week
 * row is updated in place; a template occurrence gets a one-time override (skip + replacement row),
 * and the template itself is not changed. Active substitutions of the old occurrence are cancelled.
 */
async function changeOccurrence(tx: Tx, schoolId: string, userId: string, ctx: WeekContext, weekId: string, weekStart: string, key: string, c: OccurrenceChange, extraIgnore?: string) {
  const current = ctx.assignments.find(a => a.id === key)
  if (!current) throw new DutyError(404, 'השיבוץ לא נמצא')
  const next = { date: c.date ?? current.date, periodId: c.periodId ?? current.periodId, locationId: c.locationId ?? current.locationId, staffId: c.staffId ?? current.staffId }
  if (weekStartOf(next.date) !== weekStart) throw new DutyError(400, 'אפשר להעביר רק בתוך אותו שבוע')
  const probe: WeekContext = extraIgnore ? { ...ctx, assignments: ctx.assignments.filter(a => a.id !== extraIgnore) } : ctx
  const issues = validateAssignment(probe, weekStart, next, key)
  const reason = c.overrideReason?.trim() || null
  const errors = reject(issues, reason, ctx.settings.allowOverride)
  const occ = parseOccurrence(key)
  let id = key
  if (occ) {
    await tx.dutyTemplateSkip.upsert({ where: { entryId_date: { entryId: occ.entryId, date: toDbDate(occ.date) } }, update: {}, create: { schoolId, entryId: occ.entryId, date: toDbDate(occ.date), createdById: userId } })
    const row = await tx.dutyAssignment.create({ data: { schoolId, weekId, ...next, date: toDbDate(next.date), overrideOfEntryId: occ.entryId, createdById: userId,
      overrideReason: errors.length ? reason : null, overrideById: errors.length ? userId : null } })
    id = row.id
  } else {
    await tx.dutyAssignment.update({ where: { id: key }, data: { ...next, date: toDbDate(next.date), overrideReason: errors.length ? reason : null, overrideById: errors.length ? userId : null } })
  }
  await tx.dutySubstitution.updateMany({ where: { schoolId, occurrenceKey: key, cancelledAt: null }, data: { cancelledAt: new Date(), cancelledById: userId } })
  // Keep the in-memory week current for a second change in the same transaction (swap).
  const idx = ctx.assignments.findIndex(a => a.id === key)
  ctx.assignments[idx] = { ...current, ...next, id, origin: occ ? 'override' : current.origin }
  await audit(tx, schoolId, userId, (occ ? 'override' : 'move') + (errors.length ? '_with_reason' : ''), 'assignment', id,
    { from: { date: current.date, periodId: current.periodId, locationId: current.locationId, staffId: current.staffId }, to: next, occurrence: key, ...(errors.length ? { reason, overridden: errors.map(e => e.code) } : {}) })
  return { id, warnings: issues.filter(i => i.severity === 'warning') }
}

export async function moveAssignment(schoolId: string, userId: string, key: string, c: OccurrenceChange & { weekStart?: string }) {
  return change(schoolId, async tx => {
    const weekStart = c.weekStart ?? await weekOfKey(tx, schoolId, key)
    const { ctx, useTemplate } = await contextFor(tx, schoolId, weekStart)
    const week = await weekRecord(tx, schoolId, weekStart, useTemplate)
    const r = await changeOccurrence(tx, schoolId, userId, ctx, week.id, weekStart, key, c)
    await tx.dutyWeek.update({ where: { id: week.id }, data: { draftVersion: { increment: 1 } } })
    return r
  })
}

/** Swaps the people of two occurrences of the same week (validated as a pair). */
export async function swapAssignments(schoolId: string, userId: string, a: string, b: string, weekStart: string) {
  return change(schoolId, async tx => {
    const { ctx, useTemplate } = await contextFor(tx, schoolId, weekStart)
    const x = ctx.assignments.find(o => o.id === a), y = ctx.assignments.find(o => o.id === b)
    if (!x || !y) throw new DutyError(404, 'השיבוץ לא נמצא')
    if (x.staffId === y.staffId) throw new DutyError(400, 'זה אותו איש צוות')
    const week = await weekRecord(tx, schoolId, weekStart, useTemplate)
    const [sx, sy] = [x.staffId, y.staffId]
    await changeOccurrence(tx, schoolId, userId, ctx, week.id, weekStart, a, { staffId: sy }, b)
    await changeOccurrence(tx, schoolId, userId, ctx, week.id, weekStart, b, { staffId: sx })
    await tx.dutyWeek.update({ where: { id: week.id }, data: { draftVersion: { increment: 1 } } })
    return { swapped: true }
  })
}

async function weekOfKey(tx: Tx, schoolId: string, key: string) {
  const occ = parseOccurrence(key)
  if (occ) return weekStartOf(occ.date)
  const a = await tx.dutyAssignment.findFirst({ where: { id: key, schoolId }, select: { date: true } })
  if (!a) throw new DutyError(404, 'השיבוץ לא נמצא')
  return weekStartOf(fromDbDate(a.date))
}

/** Removes a week row, or cancels a template occurrence on its date only (the template stays). */
export async function unassign(schoolId: string, userId: string, key: string) {
  return change(schoolId, async tx => {
    const occ = parseOccurrence(key)
    if (occ) {
      const entry = await tx.dutyTemplateEntry.findFirst({ where: { id: occ.entryId, schoolId } })
      if (!entry) throw new DutyError(404, 'השיבוץ לא נמצא')
      await tx.dutyTemplateSkip.upsert({ where: { entryId_date: { entryId: occ.entryId, date: toDbDate(occ.date) } }, update: {}, create: { schoolId, entryId: occ.entryId, date: toDbDate(occ.date), createdById: userId } })
      const week = await weekRecord(tx, schoolId, weekStartOf(occ.date), true)
      await tx.dutyWeek.update({ where: { id: week.id }, data: { draftVersion: { increment: 1 } } })
      await audit(tx, schoolId, userId, 'cancel_once', 'template_entry', occ.entryId, { date: occ.date })
      return
    }
    const a = await tx.dutyAssignment.findFirst({ where: { id: key, schoolId } })
    if (!a) throw new DutyError(404, 'השיבוץ לא נמצא')
    await tx.dutyAssignment.delete({ where: { id: key } })
    await tx.dutyWeek.update({ where: { id: a.weekId }, data: { draftVersion: { increment: 1 } } })
    await audit(tx, schoolId, userId, 'unassign', 'assignment', key, { date: fromDbDate(a.date), periodId: a.periodId, locationId: a.locationId, staffId: a.staffId })
  })
}

/** Undoes all one-time changes of a template occurrence on a date (it applies again as in the template). */
export async function revertOccurrence(schoolId: string, userId: string, entryId: string, date: string) {
  return change(schoolId, async tx => {
    const entry = await tx.dutyTemplateEntry.findFirst({ where: { id: entryId, schoolId } })
    if (!entry) throw new DutyError(404, 'השיבוץ הקבוע לא נמצא')
    await tx.dutyTemplateSkip.deleteMany({ where: { schoolId, entryId, date: toDbDate(date) } })
    await tx.dutyAssignment.deleteMany({ where: { schoolId, overrideOfEntryId: entryId, date: toDbDate(date) } })
    const week = await weekRecord(tx, schoolId, weekStartOf(date), true)
    await tx.dutyWeek.update({ where: { id: week.id }, data: { draftVersion: { increment: 1 } } })
    await audit(tx, schoolId, userId, 'revert_once', 'template_entry', entryId, { date })
  })
}

/**
 * Copies the effective duties of one week into another as that week's own rows (independent
 * planning; the target stops following the template). The target must be empty unless `replace`.
 * Duties that break a rule in the target week are skipped and reported.
 */
export async function copyWeek(schoolId: string, userId: string, from: string, to: string, replace: boolean) {
  if (from === to) throw new DutyError(400, 'יש לבחור שבוע אחר')
  return change(schoolId, async tx => {
    const source = await contextFor(tx, schoolId, from)
    return fillWeek(tx, schoolId, userId, to, source.ctx.assignments.map(a => ({ ...a, date: addDays(a.date, (Date.parse(to) - Date.parse(from)) / 864e5) })), replace, { from })
  })
}

/** Copies a saved template into a week as its own rows ("copy a template"). */
export async function applyTemplate(schoolId: string, userId: string, weekStart: string, templateId: string, replace: boolean) {
  return change(schoolId, async tx => {
    const t = (await templatesOf(tx, schoolId)).find(x => x.id === templateId)
    if (!t) throw new DutyError(404, 'התבנית לא נמצאה')
    const list = t.entries.map(e => ({ id: e.id, date: addDays(weekStart, e.weekday), periodId: e.periodId, locationId: e.locationId, staffId: e.staffId }))
    return fillWeek(tx, schoolId, userId, weekStart, list, replace, { templateId })
  })
}

async function fillWeek(tx: Tx, schoolId: string, userId: string, to: string, list: Pick<AssignmentRule, 'date' | 'periodId' | 'locationId' | 'staffId'>[], replace: boolean, info: Record<string, string>) {
  const target = await contextFor(tx, schoolId, to)
  if (target.ctx.assignments.length && !replace) throw new DutyError(409, 'בשבוע היעד כבר יש שיבוצים')
  const week = await weekRecord(tx, schoolId, to)
  await tx.dutyAssignment.deleteMany({ where: { schoolId, weekId: week.id } })
  await tx.dutyTemplateSkip.deleteMany({ where: { schoolId, date: { gte: toDbDate(to), lte: toDbDate(addDays(to, 6)) } } })
  await tx.dutyWeek.update({ where: { id: week.id }, data: { useTemplate: false, draftVersion: { increment: 1 } } })
  const ctx: WeekContext = { ...target.ctx, assignments: [] }
  let copied = 0
  const skipped: { date: string; staffName: string; reason: string }[] = []
  const rows: Prisma.DutyAssignmentCreateManyInput[] = []
  for (const a of list) {
    const next = { date: a.date, periodId: a.periodId, locationId: a.locationId, staffId: a.staffId }
    const errors = blocking(validateAssignment(ctx, to, next))
    if (errors.length) { skipped.push({ date: next.date, staffName: staffName(ctx.staff.find(s => s.id === a.staffId) ?? { firstName: '', lastName: '' }), reason: errors[0].message }); continue }
    rows.push({ schoolId, weekId: week.id, ...next, date: toDbDate(next.date), createdById: userId })
    ctx.assignments.push({ id: 'new' + copied, ...next }); copied++
  }
  if (rows.length) await tx.dutyAssignment.createMany({ data: rows })
  await audit(tx, schoolId, userId, 'fill_week', 'week', week.id, { ...info, to, replace, copied, skipped: skipped.length })
  return { copied, skipped }
}

/**
 * Chooses whether a week follows the template. Following → the week's own rows and one-time changes
 * are removed (the template applies as is); independent → the current effective duties become the
 * week's own rows. Both keep the published snapshot until the next publication.
 */
export async function setWeekTemplate(schoolId: string, userId: string, weekStart: string, useTemplate: boolean) {
  return change(schoolId, async tx => {
    const { ctx } = await contextFor(tx, schoolId, weekStart)
    const week = await weekRecord(tx, schoolId, weekStart)
    const range = { gte: toDbDate(weekStart), lte: toDbDate(addDays(weekStart, 6)) }
    if (useTemplate) {
      await tx.dutyAssignment.deleteMany({ where: { schoolId, weekId: week.id } })
      await tx.dutyTemplateSkip.deleteMany({ where: { schoolId, date: range } })
    } else {
      const fromTemplate = ctx.assignments.filter(a => a.origin === 'template')
      if (fromTemplate.length) await tx.dutyAssignment.createMany({ data: fromTemplate.map(a => ({ schoolId, weekId: week.id, date: toDbDate(a.date), periodId: a.periodId, locationId: a.locationId, staffId: a.staffId, createdById: userId })) })
      await tx.dutyAssignment.updateMany({ where: { schoolId, weekId: week.id }, data: { overrideOfEntryId: null } })
      await tx.dutyTemplateSkip.deleteMany({ where: { schoolId, date: range } })
    }
    await tx.dutyWeek.update({ where: { id: week.id }, data: { useTemplate, draftVersion: { increment: 1 } } })
    await audit(tx, schoolId, userId, useTemplate ? 'week_follow_template' : 'week_independent', 'week', week.id, { weekStart })
  })
}

/** Publishes the current effective week: the snapshot is what screens show until the next publication. */
export async function publishWeek(schoolId: string, userId: string, weekStart: string) {
  return change(schoolId, async tx => {
    const { ctx } = await contextFor(tx, schoolId, weekStart)
    const week = await weekRecord(tx, schoolId, weekStart)
    const snapshot = buildSnapshot(ctx, weekStart)
    await tx.dutyWeek.update({ where: { id: week.id }, data: { published: snapshot as unknown as Prisma.InputJsonValue, publishedAt: new Date(), publishedById: userId, publishedVersion: week.draftVersion } })
    await audit(tx, schoolId, userId, 'publish', 'week', week.id, { weekStart, entries: snapshot.length, gaps: coverageGaps(ctx, weekStart).length })
    return { entries: snapshot.length }
  })
}

export async function suggestions(schoolId: string, weekStart: string, slot: { date: string; periodId: string; locationId: string }, excludeStaffId?: string) {
  const { ctx } = await contextFor(db, schoolId, weekStart)
  return suggestStaff(ctx, weekStart, slot, 6, excludeStaffId ? [excludeStaffId] : [])
}

// ── Templates ──────────────────────────────────────────────────────────────────

function checkRange(from: string, until: string | null) { if (until && until < from) throw new DutyError(400, 'תאריך הסיום חייב להיות אחרי תאריך ההתחלה') }
async function checkNoOverlap(tx: Tx, schoolId: string, from: string, until: string | null, ignoreId?: string) {
  const others = (await templatesOf(tx, schoolId)).filter(t => t.id !== ignoreId)
  const clash = others.find(t => t.effectiveFrom <= (until ?? '9999-12-31') && from <= (t.effectiveUntil ?? '9999-12-31'))
  if (clash) throw new DutyError(409, `התאריכים חופפים לתבנית "${clash.name}" (${clash.effectiveFrom}${clash.effectiveUntil ? ' עד ' + clash.effectiveUntil : ' והלאה'})`)
}

/** A new template version; optionally filled from a week's effective duties. */
export async function createTemplate(schoolId: string, userId: string, input: { name: string; effectiveFrom: string; effectiveUntil: string | null; fromWeekStart?: string | null }) {
  checkRange(input.effectiveFrom, input.effectiveUntil)
  return change(schoolId, async tx => {
    await checkNoOverlap(tx, schoolId, input.effectiveFrom, input.effectiveUntil)
    const t = await tx.dutyTemplate.create({ data: { schoolId, name: input.name, effectiveFrom: toDbDate(input.effectiveFrom), effectiveUntil: input.effectiveUntil ? toDbDate(input.effectiveUntil) : null } })
    if (input.fromWeekStart) {
      const { ctx } = await contextFor(tx, schoolId, input.fromWeekStart)
      const seen = new Set<string>()
      const data = ctx.assignments.flatMap(a => { const k = [weekdayOf(a.date), a.periodId, a.locationId, a.staffId].join('|'); if (seen.has(k)) return []; seen.add(k); return [{ schoolId, templateId: t.id, weekday: weekdayOf(a.date), periodId: a.periodId, locationId: a.locationId, staffId: a.staffId }] })
      if (data.length) await tx.dutyTemplateEntry.createMany({ data })
    }
    await audit(tx, schoolId, userId, 'template_create', 'template', t.id, { ...input })
    return { id: t.id }
  })
}

export async function updateTemplate(schoolId: string, userId: string, id: string, input: { name?: string; effectiveFrom?: string; effectiveUntil?: string | null }) {
  return change(schoolId, async tx => {
    const t = await tx.dutyTemplate.findFirst({ where: { id, schoolId } })
    if (!t) throw new DutyError(404, 'התבנית לא נמצאה')
    const from = input.effectiveFrom ?? fromDbDate(t.effectiveFrom)
    const until = input.effectiveUntil !== undefined ? input.effectiveUntil : t.effectiveUntil ? fromDbDate(t.effectiveUntil) : null
    checkRange(from, until)
    await checkNoOverlap(tx, schoolId, from, until, id)
    await tx.dutyTemplate.update({ where: { id }, data: { name: input.name ?? t.name, effectiveFrom: toDbDate(from), effectiveUntil: until ? toDbDate(until) : null } })
    await audit(tx, schoolId, userId, 'template_update', 'template', id, { ...input })
  })
}

export async function deleteTemplate(schoolId: string, userId: string, id: string) {
  return change(schoolId, async tx => {
    const t = await tx.dutyTemplate.findFirst({ where: { id, schoolId } })
    if (!t) throw new DutyError(404, 'התבנית לא נמצאה')
    await tx.dutyTemplate.delete({ where: { id } })
    await audit(tx, schoolId, userId, 'template_delete', 'template', id, { name: t.name })
  })
}

type EntryInput = { weekday: number; periodId: string; locationId: string; staffId: string }

/** Adds or replaces a recurring entry of a template version, validated on its weekday. */
export async function saveTemplateEntry(schoolId: string, userId: string, templateId: string, input: EntryInput, replaceEntryId?: string, overrideReason?: string | null) {
  return change(schoolId, async tx => {
    const t = (await templatesOf(tx, schoolId)).find(x => x.id === templateId)
    if (!t) throw new DutyError(404, 'התבנית לא נמצאה')
    if (replaceEntryId && !t.entries.some(e => e.id === replaceEntryId)) throw new DutyError(404, 'השיבוץ הקבוע לא נמצא')
    const setup = await loadSetup(schoolId, tx)
    const issues = validateTemplateEntry(setup, t.entries, input, replaceEntryId)
    reject(issues.filter(i => i.code !== 'NOT_SCHOOL_DAY'), overrideReason?.trim() || null, setup.settings.allowOverride)
    const e = replaceEntryId
      ? await tx.dutyTemplateEntry.update({ where: { id: replaceEntryId }, data: input })
      : await tx.dutyTemplateEntry.create({ data: { schoolId, templateId, ...input } })
    await audit(tx, schoolId, userId, replaceEntryId ? 'template_entry_update' : 'template_entry_add', 'template_entry', e.id, { templateId, ...input })
    return { id: e.id, warnings: issues.filter(i => i.severity === 'warning') }
  })
}

export async function deleteTemplateEntry(schoolId: string, userId: string, id: string) {
  return change(schoolId, async tx => {
    const e = await tx.dutyTemplateEntry.findFirst({ where: { id, schoolId } })
    if (!e) throw new DutyError(404, 'השיבוץ הקבוע לא נמצא')
    await tx.dutyTemplateEntry.delete({ where: { id } })
    await audit(tx, schoolId, userId, 'template_entry_delete', 'template_entry', id, { templateId: e.templateId })
  })
}

/**
 * Changes a recurring duty "from this date on" (staffId = another person, null = stop it). If the
 * template version started earlier, it ends the day before and a new version starts on that date (a
 * copy with the change), so earlier weeks keep the template they had; one-time changes on later dates
 * move to the new version.
 */
export async function changeFromDate(schoolId: string, userId: string, entryId: string, fromDate: string, staffId: string | null, overrideReason?: string | null) {
  return change(schoolId, async tx => {
    const entry = await tx.dutyTemplateEntry.findFirst({ where: { id: entryId, schoolId }, include: { template: { include: { entries: true } } } })
    if (!entry) throw new DutyError(404, 'השיבוץ הקבוע לא נמצא')
    const t = entry.template
    const tFrom = fromDbDate(t.effectiveFrom), tUntil = t.effectiveUntil ? fromDbDate(t.effectiveUntil) : null
    if (fromDate < tFrom || (tUntil && fromDate > tUntil)) throw new DutyError(400, 'התאריך מחוץ לתקופת התבנית')
    let target = t, map = new Map(t.entries.map(e => [e.id, e.id]))
    if (fromDate > tFrom) {
      await tx.dutyTemplate.update({ where: { id: t.id }, data: { effectiveUntil: toDbDate(addDays(fromDate, -1)) } })
      const copy = await tx.dutyTemplate.create({ data: { schoolId, name: t.name, effectiveFrom: toDbDate(fromDate), effectiveUntil: t.effectiveUntil } })
      map = new Map()
      for (const e of t.entries) {
        const n = await tx.dutyTemplateEntry.create({ data: { schoolId, templateId: copy.id, weekday: e.weekday, periodId: e.periodId, locationId: e.locationId, staffId: e.staffId } })
        map.set(e.id, n.id)
      }
      // One-time changes on later dates now belong to the new version's entries.
      for (const [oldId, newId] of map) {
        await tx.dutyTemplateSkip.updateMany({ where: { schoolId, entryId: oldId, date: { gte: toDbDate(fromDate) } }, data: { entryId: newId } })
        await tx.dutyAssignment.updateMany({ where: { schoolId, overrideOfEntryId: oldId, date: { gte: toDbDate(fromDate) } }, data: { overrideOfEntryId: newId } })
      }
      target = { ...copy, entries: await tx.dutyTemplateEntry.findMany({ where: { templateId: copy.id } }) }
    }
    const targetEntryId = map.get(entryId)!
    if (staffId === null) await tx.dutyTemplateEntry.delete({ where: { id: targetEntryId } })
    else {
      const setup = await loadSetup(schoolId, tx)
      const entries = target.entries.map(e => ({ id: e.id, weekday: e.weekday, periodId: e.periodId, locationId: e.locationId, staffId: e.staffId }))
      const me = entries.find(e => e.id === targetEntryId)!
      reject(validateTemplateEntry(setup, entries, { ...me, staffId }, targetEntryId).filter(i => i.code !== 'NOT_SCHOOL_DAY'), overrideReason?.trim() || null, setup.settings.allowOverride)
      await tx.dutyTemplateEntry.update({ where: { id: targetEntryId }, data: { staffId } })
    }
    await audit(tx, schoolId, userId, 'template_change_from_date', 'template_entry', entryId, { fromDate, staffId, templateId: target.id, split: target.id !== t.id })
    return { templateId: target.id, split: target.id !== t.id }
  })
}

// ── Calendar ───────────────────────────────────────────────────────────────────

export async function saveCalendarDay(schoolId: string, userId: string, input: { date: string; kind: 'HOLIDAY' | 'NO_SCHOOL' | 'SPECIAL'; name: string }) {
  return change(schoolId, async tx => {
    const r = await tx.dutyCalendarDay.upsert({ where: { schoolId_date: { schoolId, date: toDbDate(input.date) } }, update: { kind: input.kind, name: input.name }, create: { schoolId, date: toDbDate(input.date), kind: input.kind, name: input.name } })
    await audit(tx, schoolId, userId, 'calendar_save', 'calendar', r.id, input)
    return { id: r.id }
  })
}
export async function deleteCalendarDay(schoolId: string, userId: string, id: string) {
  return change(schoolId, async tx => {
    const r = await tx.dutyCalendarDay.findFirst({ where: { id, schoolId } })
    if (!r) throw new DutyError(404, 'התאריך לא נמצא')
    await tx.dutyCalendarDay.delete({ where: { id } })
    await audit(tx, schoolId, userId, 'calendar_delete', 'calendar', id, { date: fromDbDate(r.date) })
  })
}

// ── Absences and substitutions ─────────────────────────────────────────────────

export async function addAbsence(schoolId: string, userId: string, input: { staffId: string; date: string; periodId: string | null; reason: string | null }) {
  return change(schoolId, async tx => {
    const staff = await tx.dutyStaff.findFirst({ where: { id: input.staffId, schoolId } })
    if (!staff) throw new DutyError(404, 'איש הצוות לא נמצא')
    if (input.periodId && !(await tx.dutyPeriod.findFirst({ where: { id: input.periodId, schoolId } }))) throw new DutyError(404, 'ההפסקה לא נמצאה')
    const a = await tx.dutyAbsence.create({ data: { schoolId, staffId: input.staffId, date: toDbDate(input.date), periodId: input.periodId, reason: input.reason, createdById: userId } })
    await audit(tx, schoolId, userId, 'absence_add', 'absence', a.id, { staffId: input.staffId, date: input.date, periodId: input.periodId })
    return { id: a.id }
  })
}

export async function removeAbsence(schoolId: string, userId: string, id: string) {
  return change(schoolId, async tx => {
    const a = await tx.dutyAbsence.findFirst({ where: { id, schoolId } })
    if (!a) throw new DutyError(404, 'ההיעדרות לא נמצאה')
    await tx.dutyAbsence.delete({ where: { id } })
    await audit(tx, schoolId, userId, 'absence_remove', 'absence', id, { staffId: a.staffId, date: fromDbDate(a.date) })
  })
}

/**
 * Approves a substitute for one occurrence (a week row or a template occurrence) whose person is
 * absent. The substitute must be free at that time under the same rules. The occurrence itself is
 * not changed; an earlier substitution for it is cancelled (kept for history).
 */
export async function approveSubstitution(schoolId: string, userId: string, key: string, substituteStaffId: string) {
  return change(schoolId, async tx => {
    const weekStart = await weekOfKey(tx, schoolId, key)
    const { ctx } = await contextFor(tx, schoolId, weekStart)
    const occ = ctx.assignments.find(a => a.id === key)
    if (!occ) throw new DutyError(404, 'השיבוץ לא נמצא')
    if (substituteStaffId === occ.staffId) throw new DutyError(400, 'המחליף/ה חייב/ת להיות אדם אחר')
    // Active substitutions count as duties of the substitute (time conflicts and limits).
    const active = await substitutionsFor(tx, schoolId, ctx.assignments.map(a => a.id))
    for (const s of active.filter(s => !s.cancelled && s.assignmentId !== key)) {
      const o = ctx.assignments.find(a => a.id === s.assignmentId)
      if (o) ctx.assignments.push({ ...o, id: 'sub-' + s.id, staffId: s.substituteStaffId })
    }
    const errors = blocking(validateAssignment(ctx, weekStart, { date: occ.date, periodId: occ.periodId, locationId: occ.locationId, staffId: substituteStaffId }, key))
    if (errors.length) throw new DutyError(409, errors[0].message, errors)
    await tx.dutySubstitution.updateMany({ where: { schoolId, occurrenceKey: key, cancelledAt: null }, data: { cancelledAt: new Date(), cancelledById: userId } })
    const s = await tx.dutySubstitution.create({ data: { schoolId, assignmentId: parseOccurrence(key) ? null : key, occurrenceKey: key, substituteStaffId, approvedById: userId } })
    await audit(tx, schoolId, userId, 'substitute_approve', 'substitution', s.id, { occurrence: key, substituteStaffId, originalStaffId: occ.staffId })
    return { id: s.id }
  })
}

export async function cancelSubstitution(schoolId: string, userId: string, id: string) {
  return change(schoolId, async tx => {
    const s = await tx.dutySubstitution.findFirst({ where: { id, schoolId, cancelledAt: null } })
    if (!s) throw new DutyError(404, 'ההחלפה לא נמצאה')
    await tx.dutySubstitution.update({ where: { id }, data: { cancelledAt: new Date(), cancelledById: userId } })
    await audit(tx, schoolId, userId, 'substitute_cancel', 'substitution', id, { occurrence: s.occurrenceKey })
  })
}

// ── Public display ─────────────────────────────────────────────────────────────

/**
 * The published entries of one date (never the draft), with that date's absences and approved
 * substitutions of the school. Null when the week was never published.
 */
export async function publishedDay(schoolId: string, date: string) {
  const week = await db.dutyWeek.findUnique({ where: { schoolId_weekStart: { schoolId, weekStart: toDbDate(weekStartOf(date)) } }, select: { published: true, publishedAt: true } })
  if (!week?.published || !Array.isArray(week.published)) return null
  const entries = (week.published as unknown as DutyPublishedEntry[]).filter(e => e.date === date)
  const keys = entries.flatMap(e => e.assignmentId ? [e.assignmentId] : [])
  const [absences, subs] = await Promise.all([
    db.dutyAbsence.findMany({ where: { schoolId, date: toDbDate(date) }, select: { staffId: true, periodId: true } }),
    keys.length ? db.dutySubstitution.findMany({ where: { schoolId, cancelledAt: null, occurrenceKey: { in: keys } }, include: { substitute: { select: { firstName: true, lastName: true } } }, orderBy: { approvedAt: 'desc' } }) : Promise.resolve([]),
  ])
  return { publishedAt: week.publishedAt, entries, absences, substitutions: subs.map(s => ({ assignmentId: s.occurrenceKey!, substituteName: staffName(s.substitute) })) }
}

export { occurrenceKey, templateOn }
