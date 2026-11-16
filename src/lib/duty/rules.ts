// Duty roster rules: pure functions (no database), shared by the API, the admin page and the tests.
// Dates are school-calendar dates as "YYYY-MM-DD"; times are "HH:mm" in the school's time zone.
// Nothing here assumes a school policy: limits apply only when configured (school or personal).

import { clockMinutes } from '@/lib/zonedTime'

export type DutyAccessLevel = 'NONE' | 'VIEW' | 'EDIT' | 'PUBLISH'

export type StaffKind = 'REGULAR' | 'MANUAL' | 'TEMPORARY'
export type StaffRule = {
  id: string; firstName: string; lastName: string; active: boolean
  /** Dates the person may be assigned (inclusive, "YYYY-MM-DD"; null = open). */
  validFrom?: string | null; validUntil?: string | null
  maxPerDay: number | null; maxPerWeek: number | null
  /** Unavailable times: whole weekday (periodId null) or one period on a weekday. */
  unavailable: { weekday: number; periodId: string | null }[]
}
export type PeriodRule = { id: string; name: string; startTime: string; endTime: string; weekdays: number[]; active: boolean; sortOrder: number }
export type LocationRule = { id: string; name: string; required: boolean; staffNeeded: number; active: boolean; sortOrder: number }
export type ScheduleMode = 'WEEKLY' | 'RECURRING' | 'HYBRID'
export type SettingsRule = { schoolDays: number[]; maxPerDay: number | null; maxPerWeek: number | null; allowOverride: boolean; scheduleMode?: ScheduleMode }
/**
 * One duty occurrence. origin: 'template' = from the recurring template (id "t:<entryId>:<date>",
 * not stored per date); 'override' = a week row replacing a template occurrence on its date;
 * 'week' = a week row (independent planning or a one-time addition).
 */
export type AssignmentRule = { id: string; date: string; periodId: string; locationId: string; staffId: string; origin?: 'template' | 'override' | 'week'; entryId?: string | null }
export type CalendarRule = { date: string; kind: 'HOLIDAY' | 'NO_SCHOOL' | 'SPECIAL'; name: string }
export type AbsenceRule = { id: string; staffId: string; date: string; periodId: string | null }
export type SubstitutionRule = { id: string; assignmentId: string; substituteStaffId: string; cancelled: boolean }

export type WeekContext = {
  staff: StaffRule[]; periods: PeriodRule[]; locations: LocationRule[]; settings: SettingsRule
  assignments: AssignmentRule[]; absences: AbsenceRule[]
  /** Calendar exceptions in (at least) the dates checked. */
  calendar?: CalendarRule[]
}

export type IssueCode = 'DUPLICATE' | 'OVERLAP' | 'UNAVAILABLE' | 'ABSENT' | 'DAILY_LIMIT' | 'WEEKLY_LIMIT'
  | 'INACTIVE_STAFF' | 'OUTSIDE_VALIDITY' | 'INACTIVE_PERIOD' | 'INACTIVE_LOCATION' | 'NOT_SCHOOL_DAY' | 'PERIOD_NOT_ON_DAY' | 'OUTSIDE_WEEK' | 'LOCATION_FULL'
export type Issue = { code: IssueCode; severity: 'error' | 'warning'; message: string }

export const DEFAULT_SETTINGS: SettingsRule = { schoolDays: [0, 1, 2, 3, 4, 5], maxPerDay: null, maxPerWeek: null, allowOverride: true, scheduleMode: 'WEEKLY' }

// ── Dates ──────────────────────────────────────────────────────────────────────

const DAY_MS = 864e5
export const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'))
export const weekdayOf = (date: string) => new Date(date + 'T00:00:00Z').getUTCDay()
export const addDays = (date: string, n: number) => new Date(Date.parse(date + 'T00:00:00Z') + n * DAY_MS).toISOString().slice(0, 10)
/** The Sunday that starts the week of `date`. */
export const weekStartOf = (date: string) => addDays(date, -weekdayOf(date))
export const weekDates = (weekStart: string) => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
export const toDbDate = (date: string) => new Date(date + 'T00:00:00Z')
export const fromDbDate = (d: Date) => d.toISOString().slice(0, 10)

export const staffName = (s: Pick<StaffRule, 'firstName' | 'lastName'>) => `${s.firstName} ${s.lastName}`.trim()

/** A calendar exception of the date, if any. */
export const calendarDay = (ctx: Pick<WeekContext, 'calendar'>, date: string) => ctx.calendar?.find(c => c.date === date) ?? null
/** Duties happen on school days: a SPECIAL day always, a HOLIDAY / NO_SCHOOL day never, otherwise by weekday. */
export function isSchoolDay(ctx: Pick<WeekContext, 'calendar' | 'settings'>, date: string): boolean {
  const c = calendarDay(ctx, date)
  if (c) return c.kind === 'SPECIAL'
  return ctx.settings.schoolDays.includes(weekdayOf(date))
}
/** Whether a period runs on the date: its weekdays, or any active period on a special school day. */
const periodOnDate = (ctx: Pick<WeekContext, 'calendar'>, p: PeriodRule, date: string) => p.weekdays.includes(weekdayOf(date)) || calendarDay(ctx, date)?.kind === 'SPECIAL'

function overlaps(a: PeriodRule, b: PeriodRule): boolean {
  const as = clockMinutes(a.startTime), ae = clockMinutes(a.endTime), bs = clockMinutes(b.startTime), be = clockMinutes(b.endTime)
  if (as === null || ae === null || bs === null || be === null) return a.id === b.id
  return as < be && bs < ae
}

// ── Validation ─────────────────────────────────────────────────────────────────

const limitOf = (personal: number | null, school: number | null) => personal ?? school

/** Whether a staff member is absent for (date, period). */
export function isAbsent(ctx: Pick<WeekContext, 'absences'>, staffId: string, date: string, periodId: string): boolean {
  return ctx.absences.some(a => a.staffId === staffId && a.date === date && (a.periodId === null || a.periodId === periodId))
}

/**
 * Problems with assigning `staffId` to (date, period, location) in the week starting `weekStart`,
 * given the other assignments (`ignoreId` = an assignment being replaced). Errors block saving unless
 * overridden with a reason; warnings are informational.
 */
export function validateAssignment(ctx: WeekContext, weekStart: string, a: Omit<AssignmentRule, 'id'>, ignoreId?: string): Issue[] {
  const issues: Issue[] = []
  const err = (code: IssueCode, message: string) => issues.push({ code, severity: 'error', message })
  const staff = ctx.staff.find(s => s.id === a.staffId)
  const period = ctx.periods.find(p => p.id === a.periodId)
  const location = ctx.locations.find(l => l.id === a.locationId)
  if (!staff || !period || !location) { err('INACTIVE_STAFF', 'איש הצוות, ההפסקה או המקום לא נמצאו'); return issues }
  const day = weekdayOf(a.date)
  if (a.date < weekStart || a.date > addDays(weekStart, 6)) err('OUTSIDE_WEEK', 'התאריך אינו בשבוע הזה')
  if (!staff.active) err('INACTIVE_STAFF', `${staffName(staff)} אינו/ה פעיל/ה ברשימת הצוות`)
  else if ((staff.validFrom && a.date < staff.validFrom) || (staff.validUntil && a.date > staff.validUntil))
    err('OUTSIDE_VALIDITY', `${staffName(staff)} זמין/ה לשיבוץ רק ${staff.validFrom ? 'מ-' + staff.validFrom.split('-').reverse().join('.') : ''}${staff.validUntil ? ' עד ' + staff.validUntil.split('-').reverse().join('.') : ''}`)
  if (!period.active) err('INACTIVE_PERIOD', `ההפסקה "${period.name}" אינה פעילה`)
  if (!location.active) err('INACTIVE_LOCATION', `המקום "${location.name}" אינו פעיל`)
  if (!isSchoolDay(ctx, a.date)) { const c = calendarDay(ctx, a.date); err('NOT_SCHOOL_DAY', c ? `${c.name}: אין לימודים` : 'היום אינו יום לימודים') }
  else if (!periodOnDate(ctx, period, a.date)) err('PERIOD_NOT_ON_DAY', `ההפסקה "${period.name}" אינה מתקיימת ביום הזה`)

  const others = ctx.assignments.filter(x => x.id !== ignoreId)
  const mine = others.filter(x => x.staffId === a.staffId)
  if (mine.some(x => x.date === a.date && x.periodId === a.periodId && x.locationId === a.locationId)) err('DUPLICATE', `${staffName(staff)} כבר משובץ/ת כאן`)
  else {
    const clash = mine.find(x => x.date === a.date && (() => { const p = ctx.periods.find(pp => pp.id === x.periodId); return !!p && overlaps(p, period) })())
    if (clash) err('OVERLAP', `${staffName(staff)} כבר בתורנות ב${ctx.locations.find(l => l.id === clash.locationId)?.name ?? 'מקום אחר'} באותה שעה`)
  }
  if (staff.unavailable.some(u => u.weekday === day && (u.periodId === null || u.periodId === a.periodId))) err('UNAVAILABLE', `${staffName(staff)} אינו/ה זמין/ה בזמן הזה`)
  if (isAbsent(ctx, a.staffId, a.date, a.periodId)) err('ABSENT', `${staffName(staff)} נעדר/ת בתאריך הזה`)

  const perDay = limitOf(staff.maxPerDay, ctx.settings.maxPerDay)
  const perWeek = limitOf(staff.maxPerWeek, ctx.settings.maxPerWeek)
  const dayCount = mine.filter(x => x.date === a.date).length
  if (perDay !== null && dayCount + 1 > perDay) err('DAILY_LIMIT', `${staffName(staff)} יגיע/תגיע ל-${dayCount + 1} תורנויות ביום (המגבלה ${perDay})`)
  if (perWeek !== null && mine.length + 1 > perWeek) err('WEEKLY_LIMIT', `${staffName(staff)} יגיע/תגיע ל-${mine.length + 1} תורנויות בשבוע (המגבלה ${perWeek})`)

  const here = others.filter(x => x.date === a.date && x.periodId === a.periodId && x.locationId === a.locationId).length
  if (here >= location.staffNeeded) issues.push({ code: 'LOCATION_FULL', severity: 'warning', message: `ב${location.name} כבר יש ${here} מתוך ${location.staffNeeded} נדרשים` })
  return issues
}

export const blocking = (issues: Issue[]) => issues.filter(i => i.severity === 'error')
/** Errors that no override can bypass (the record itself is wrong, not a policy). */
export const FIXED_ISSUES: IssueCode[] = ['DUPLICATE', 'INACTIVE_STAFF', 'OUTSIDE_VALIDITY', 'OUTSIDE_WEEK', 'INACTIVE_PERIOD', 'INACTIVE_LOCATION']

/** Normalized full name for duplicate warnings (never used as an identity). */
export const nameKey = (s: Pick<StaffRule, 'firstName' | 'lastName'>) =>
  staffName(s).normalize('NFKC').replace(/[\u0591-\u05C7'"׳״.\-]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()

// ── Coverage ───────────────────────────────────────────────────────────────────

export type Slot = { date: string; periodId: string; locationId: string }
export type CoverageGap = Slot & { assigned: number; needed: number }

/** The slots of the week: school day × active period on that weekday × active location. */
export function weekSlots(ctx: WeekContext, weekStart: string): Slot[] {
  const periods = ctx.periods.filter(p => p.active).sort((a, b) => a.sortOrder - b.sortOrder || a.startTime.localeCompare(b.startTime))
  const locations = ctx.locations.filter(l => l.active).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'he'))
  return weekDates(weekStart).filter(d => isSchoolDay(ctx, d)).flatMap(date =>
    periods.filter(p => periodOnDate(ctx, p, date)).flatMap(p => locations.map(l => ({ date, periodId: p.id, locationId: l.id }))))
}

/** Required slots with fewer staff than needed (absent staff do not count as coverage). */
export function coverageGaps(ctx: WeekContext, weekStart: string): CoverageGap[] {
  return weekSlots(ctx, weekStart).flatMap(slot => {
    const location = ctx.locations.find(l => l.id === slot.locationId)!
    if (!location.required) return []
    const assigned = ctx.assignments.filter(a => a.date === slot.date && a.periodId === slot.periodId && a.locationId === slot.locationId && !isAbsent(ctx, a.staffId, a.date, a.periodId)).length
    return assigned < location.staffNeeded ? [{ ...slot, assigned, needed: location.staffNeeded }] : []
  })
}

// ── Suggestions ────────────────────────────────────────────────────────────────

export type Suggestion = { staffId: string; name: string; weekCount: number; dayCount: number; reasons: string[] }

/**
 * Eligible staff for a slot (no blocking issue), least loaded first (week, then day, then name),
 * each with the reasons it is suggested. `excludeStaffIds`: e.g. the absent person being replaced.
 */
export function suggestStaff(ctx: WeekContext, weekStart: string, slot: Slot, limit = 5, excludeStaffIds: string[] = []): Suggestion[] {
  const active = ctx.staff.filter(s => s.active && !excludeStaffIds.includes(s.id))
  const counts = new Map(active.map(s => [s.id, ctx.assignments.filter(a => a.staffId === s.id).length]))
  const avg = active.length ? [...counts.values()].reduce((x, y) => x + y, 0) / active.length : 0
  return active
    .filter(s => blocking(validateAssignment(ctx, weekStart, { ...slot, staffId: s.id })).length === 0)
    .map(s => {
      const weekCount = counts.get(s.id) ?? 0
      const dayCount = ctx.assignments.filter(a => a.staffId === s.id && a.date === slot.date).length
      const reasons = ['פנוי/ה בזמן הזה, בלי התנגשות']
      reasons.push(weekCount < avg ? `${weekCount} תורנויות השבוע, פחות מהממוצע (${avg.toFixed(1)})` : `${weekCount} תורנויות השבוע (ממוצע ${avg.toFixed(1)})`)
      if (dayCount === 0) reasons.push('אין תורנות אחרת באותו יום')
      const perWeek = limitOf(s.maxPerWeek, ctx.settings.maxPerWeek)
      if (perWeek !== null) reasons.push(`נשארו ${perWeek - weekCount - 1} עד המגבלה השבועית`)
      return { staffId: s.id, name: staffName(s), weekCount, dayCount, reasons }
    })
    .sort((a, b) => a.weekCount - b.weekCount || a.dayCount - b.dayCount || a.name.localeCompare(b.name, 'he'))
    .slice(0, limit)
}

/** Assignments whose staff member is absent at that time (they need a substitute). */
export function impactedAssignments(ctx: WeekContext, substitutions: SubstitutionRule[]): { assignment: AssignmentRule; substitution: SubstitutionRule | null }[] {
  return ctx.assignments.filter(a => isAbsent(ctx, a.staffId, a.date, a.periodId))
    .map(assignment => ({ assignment, substitution: substitutions.find(s => s.assignmentId === assignment.id && !s.cancelled) ?? null }))
}

// ── Publication and display ────────────────────────────────────────────────────

/** One published duty, as stored on DutyWeek.published (names copied: the snapshot stays readable). */
export type DutyPublishedEntry = {
  assignmentId: string | null; date: string
  periodId: string; periodName: string; startTime: string; endTime: string
  locationId: string; locationName: string
  staffId: string | null; staffName: string | null
}

/** The snapshot to publish: every slot, with its assignments (an empty required slot is kept, staff null). */
export function buildSnapshot(ctx: WeekContext, weekStart: string): DutyPublishedEntry[] {
  const out: DutyPublishedEntry[] = []
  for (const slot of weekSlots(ctx, weekStart)) {
    const period = ctx.periods.find(p => p.id === slot.periodId)!, location = ctx.locations.find(l => l.id === slot.locationId)!
    const base = { date: slot.date, periodId: period.id, periodName: period.name, startTime: period.startTime, endTime: period.endTime, locationId: location.id, locationName: location.name }
    const here = ctx.assignments.filter(a => a.date === slot.date && a.periodId === slot.periodId && a.locationId === slot.locationId)
    for (const a of here) { const s = ctx.staff.find(x => x.id === a.staffId); out.push({ ...base, assignmentId: a.id, staffId: a.staffId, staffName: s ? staffName(s) : null }) }
    for (let i = here.length; i < (location.required ? location.staffNeeded : 0); i++) out.push({ ...base, assignmentId: null, staffId: null, staffName: null })
  }
  return out
}

export type DisplayStatus = 'assigned' | 'substitute' | 'needs_substitute' | 'unassigned'
export type DisplayEntry = Omit<DutyPublishedEntry, 'staffId' | 'assignmentId'> & { status: DisplayStatus; substituteName: string | null }
export type DisplayPeriod = { periodId: string; name: string; startTime: string; endTime: string; state: 'past' | 'current' | 'next' | 'later'; entries: DisplayEntry[] }

export const NO_SUBSTITUTE_LABEL = 'טרם שובץ מחליף'

/**
 * What a screen shows for one day: the published entries of that date, with absences and approved
 * substitutions applied, grouped by period in time order, each marked past/current/next/later for
 * the given school-local minute of the day.
 */
export function displayDay(entries: DutyPublishedEntry[], date: string, minutes: number,
  absences: { staffId: string; periodId: string | null }[], substitutions: { assignmentId: string; substituteName: string }[]): DisplayPeriod[] {
  const today = entries.filter(e => e.date === date)
  const periods = [...new Map(today.map(e => [e.periodId, e])).values()]
    .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.periodName.localeCompare(b.periodName, 'he'))
  let nextMarked = false
  return periods.map(p => {
    const start = clockMinutes(p.startTime) ?? 0, end = clockMinutes(p.endTime) ?? start
    let state: DisplayPeriod['state'] = minutes >= end ? 'past' : minutes >= start ? 'current' : 'later'
    if (state === 'later' && !nextMarked) { state = 'next'; nextMarked = true }
    const rows = today.filter(e => e.periodId === p.periodId).map(({ assignmentId, staffId, ...e }): DisplayEntry => {
      if (!staffId) return { ...e, status: 'unassigned', substituteName: null }
      const absent = absences.some(a => a.staffId === staffId && (a.periodId === null || a.periodId === e.periodId))
      if (!absent) return { ...e, status: 'assigned', substituteName: null }
      const sub = assignmentId ? substitutions.find(s => s.assignmentId === assignmentId) : undefined
      return sub ? { ...e, status: 'substitute', substituteName: sub.substituteName } : { ...e, status: 'needs_substitute', substituteName: null }
    }).sort((a, b) => a.locationName.localeCompare(b.locationName, 'he'))
    return { periodId: p.periodId, name: p.periodName, startTime: p.startTime, endTime: p.endTime, state, entries: rows }
  })
}

// ── Permissions ────────────────────────────────────────────────────────────────

const LEVEL: Record<DutyAccessLevel, number> = { NONE: 0, VIEW: 1, EDIT: 2, PUBLISH: 3 }
/** School admins always publish; anyone else has only the roster access granted to them. */
export function dutyAccessOf(user: { role: string; dutyAccess?: DutyAccessLevel | null }): DutyAccessLevel {
  if (user.role === 'SCHOOL_ADMIN' || user.role === 'SUPER_ADMIN') return 'PUBLISH'
  return user.dutyAccess ?? 'NONE'
}
export const hasDutyAccess = (level: DutyAccessLevel, need: DutyAccessLevel) => LEVEL[level] >= LEVEL[need]

// ── Recurring templates ────────────────────────────────────────────────────────

export type TemplateEntryRule = { id: string; weekday: number; periodId: string; locationId: string; staffId: string }
export type TemplateRule = { id: string; name: string; effectiveFrom: string; effectiveUntil: string | null; entries: TemplateEntryRule[] }
export type WeekRow = { id: string; date: string; periodId: string; locationId: string; staffId: string; overrideOfEntryId: string | null }

export const occurrenceKey = (entryId: string, date: string) => `t:${entryId}:${date}`
export function parseOccurrence(key: string): { entryId: string; date: string } | null {
  const m = /^t:([^:]+):(\d{4}-\d{2}-\d{2})$/.exec(key)
  return m ? { entryId: m[1], date: m[2] } : null
}
/** The template version in effect on a date (versions of one school never overlap). */
export const templateOn = (templates: TemplateRule[], date: string) =>
  templates.find(t => t.effectiveFrom <= date && (!t.effectiveUntil || date <= t.effectiveUntil)) ?? null
/** Whether a week follows the template: its own choice, otherwise the school's schedule mode. */
export const weekUsesTemplate = (useTemplate: boolean | null | undefined, mode: ScheduleMode | undefined) => useTemplate ?? (mode === 'RECURRING' || mode === 'HYBRID')

/**
 * The effective duties of a week, computed (nothing is stored per future date): the week's own rows,
 * plus, when the week follows the template, each template occurrence on a school day of the template
 * version in effect that date, unless skipped (cancelled or replaced by an override row) on that date.
 */
/** A recurring duty applies only while its person is active and within their dates (else the slot is uncovered). */
function canServe(staff: StaffRule[] | undefined, id: string, date: string) {
  const s = staff?.find(x => x.id === id)
  if (!s) return !staff
  return s.active && (!s.validFrom || date >= s.validFrom) && (!s.validUntil || date <= s.validUntil)
}

export function expandWeek(ctx: Pick<WeekContext, 'calendar' | 'settings'> & { staff?: StaffRule[] }, weekStart: string, useTemplate: boolean,
  templates: TemplateRule[], skips: { entryId: string; date: string }[], rows: WeekRow[]): AssignmentRule[] {
  const out: AssignmentRule[] = rows.map(r => ({ id: r.id, date: r.date, periodId: r.periodId, locationId: r.locationId, staffId: r.staffId, origin: r.overrideOfEntryId ? 'override' : 'week', entryId: r.overrideOfEntryId }))
  if (!useTemplate) return out
  const skipped = new Set(skips.map(k => k.entryId + '|' + k.date))
  for (const date of weekDates(weekStart)) {
    if (!isSchoolDay(ctx, date)) continue
    const t = templateOn(templates, date)
    if (!t) continue
    const day = weekdayOf(date)
    for (const e of t.entries) if (e.weekday === day && !skipped.has(e.id + '|' + date) && canServe(ctx.staff, e.staffId, date))
      out.push({ id: occurrenceKey(e.id, date), date, periodId: e.periodId, locationId: e.locationId, staffId: e.staffId, origin: 'template', entryId: e.id })
  }
  return out
}

/**
 * Problems with a recurring entry (person at a location in a period on a weekday): checked on the
 * weekday itself (duplicates, same-time conflicts, weekly availability, limits per day), not on
 * dates (absences and temporary validity apply to each date when the template is used).
 */
export function validateTemplateEntry(base: Pick<WeekContext, 'staff' | 'periods' | 'locations' | 'settings'>, entries: TemplateEntryRule[], e: Omit<TemplateEntryRule, 'id'>, ignoreId?: string): Issue[] {
  // A reference week (any Sunday) turns the weekday into a date for the shared rules.
  const ref = '2000-01-02'
  const date = addDays(ref, e.weekday)
  const ctx: WeekContext = {
    ...base, staff: base.staff.map(s => ({ ...s, validFrom: null, validUntil: null })), absences: [], calendar: [],
    assignments: entries.filter(x => x.id !== ignoreId).map(x => ({ id: x.id, date: addDays(ref, x.weekday), periodId: x.periodId, locationId: x.locationId, staffId: x.staffId })),
  }
  return validateAssignment(ctx, ref, { date, periodId: e.periodId, locationId: e.locationId, staffId: e.staffId })
}
