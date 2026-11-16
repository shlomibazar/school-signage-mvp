import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateAssignment, blocking, coverageGaps, suggestStaff, impactedAssignments, buildSnapshot, displayDay,
  weekStartOf, weekDates, dutyAccessOf, hasDutyAccess, DEFAULT_SETTINGS, NO_SUBSTITUTE_LABEL, type WeekContext,
} from '@/lib/duty/rules'

const WEEK = '2026-11-15' // a Sunday
const staff = (id: string, first: string, extra: Partial<WeekContext['staff'][number]> = {}) =>
  ({ id, firstName: first, lastName: 'כהן', active: true, maxPerDay: null, maxPerWeek: null, unavailable: [], ...extra })
const base = (): WeekContext => ({
  staff: [staff('s1', 'דנה'), staff('s2', 'יוסי'), staff('s3', 'מיכל')],
  periods: [
    { id: 'p1', name: 'הפסקה ראשונה', startTime: '10:00', endTime: '10:20', weekdays: [0, 1, 2, 3, 4], active: true, sortOrder: 0 },
    { id: 'p2', name: 'הפסקה שנייה', startTime: '12:00', endTime: '12:15', weekdays: [0, 1, 2, 3, 4], active: true, sortOrder: 1 },
    { id: 'pX', name: 'חפיפה', startTime: '10:10', endTime: '10:30', weekdays: [0], active: true, sortOrder: 2 },
  ],
  locations: [
    { id: 'l1', name: 'חצר', required: true, staffNeeded: 1, active: true, sortOrder: 0 },
    { id: 'l2', name: 'מסדרון', required: true, staffNeeded: 1, active: true, sortOrder: 1 },
    { id: 'l3', name: 'ספרייה', required: false, staffNeeded: 1, active: true, sortOrder: 2 },
  ],
  settings: { ...DEFAULT_SETTINGS, schoolDays: [0, 1, 2, 3, 4] },
  assignments: [], absences: [],
})
const codes = (issues: { code: string }[]) => issues.map(i => i.code).sort()

test('duty: week dates start on Sunday', () => {
  assert.equal(weekStartOf('2026-11-19'), WEEK)
  assert.equal(weekStartOf(WEEK), WEEK)
  assert.deepEqual(weekDates(WEEK).slice(0, 2), ['2026-11-15', '2026-11-16'])
})

test('duty: a valid assignment has no issues', () => {
  assert.deepEqual(validateAssignment(base(), WEEK, { date: WEEK, periodId: 'p1', locationId: 'l1', staffId: 's1' }), [])
})

test('duty: duplicate, overlapping and same-time assignments are rejected', () => {
  const ctx = base()
  ctx.assignments = [{ id: 'a1', date: WEEK, periodId: 'p1', locationId: 'l1', staffId: 's1' }]
  assert.deepEqual(codes(validateAssignment(ctx, WEEK, { date: WEEK, periodId: 'p1', locationId: 'l1', staffId: 's1' })), ['DUPLICATE', 'LOCATION_FULL'])
  assert.deepEqual(codes(blocking(validateAssignment(ctx, WEEK, { date: WEEK, periodId: 'p1', locationId: 'l2', staffId: 's1' }))), ['OVERLAP'])
  assert.deepEqual(codes(blocking(validateAssignment(ctx, WEEK, { date: WEEK, periodId: 'pX', locationId: 'l2', staffId: 's1' }))), ['OVERLAP'], 'overlapping times')
  assert.deepEqual(validateAssignment(ctx, WEEK, { date: WEEK, periodId: 'p2', locationId: 'l2', staffId: 's1' }), [], 'a later period is fine')
  assert.deepEqual(validateAssignment(ctx, WEEK, { date: WEEK, periodId: 'p1', locationId: 'l1', staffId: 's1' }, 'a1'), [], 'replacing itself')
})

test('duty: availability, absence, days and limits (only when configured)', () => {
  const ctx = base()
  ctx.staff[0].unavailable = [{ weekday: 1, periodId: null }]
  ctx.absences = [{ id: 'x', staffId: 's2', date: WEEK, periodId: 'p1' }]
  assert.deepEqual(codes(validateAssignment(ctx, WEEK, { date: '2026-11-16', periodId: 'p1', locationId: 'l1', staffId: 's1' })), ['UNAVAILABLE'])
  assert.deepEqual(codes(validateAssignment(ctx, WEEK, { date: WEEK, periodId: 'p1', locationId: 'l1', staffId: 's2' })), ['ABSENT'])
  assert.deepEqual(validateAssignment(ctx, WEEK, { date: WEEK, periodId: 'p2', locationId: 'l1', staffId: 's2' }), [], 'absent in another period only')
  assert.deepEqual(codes(validateAssignment(ctx, WEEK, { date: '2026-11-20', periodId: 'p1', locationId: 'l1', staffId: 's3' })), ['NOT_SCHOOL_DAY'])
  assert.deepEqual(codes(validateAssignment(ctx, WEEK, { date: '2026-11-22', periodId: 'p1', locationId: 'l1', staffId: 's3' })), ['OUTSIDE_WEEK'])
  ctx.assignments = [{ id: 'a1', date: WEEK, periodId: 'p1', locationId: 'l1', staffId: 's3' }]
  assert.deepEqual(validateAssignment(ctx, WEEK, { date: WEEK, periodId: 'p2', locationId: 'l1', staffId: 's3' }), [], 'no limit by default')
  ctx.settings.maxPerDay = 1
  assert.deepEqual(codes(validateAssignment(ctx, WEEK, { date: WEEK, periodId: 'p2', locationId: 'l1', staffId: 's3' })), ['DAILY_LIMIT'])
  ctx.settings.maxPerDay = null; ctx.staff[2].maxPerWeek = 1
  assert.deepEqual(codes(validateAssignment(ctx, WEEK, { date: '2026-11-16', periodId: 'p2', locationId: 'l1', staffId: 's3' })), ['WEEKLY_LIMIT'], 'personal limit')
})

test('duty: uncovered required locations are reported; optional ones are not', () => {
  const ctx = base()
  const gaps = coverageGaps(ctx, WEEK)
  assert.equal(gaps.length, 5 * 2 * 2 + 1 * 1 * 2, 'school days × periods on that day × required locations')
  assert.ok(gaps.every(g => g.locationId !== 'l3'))
  ctx.assignments = [{ id: 'a1', date: WEEK, periodId: 'p1', locationId: 'l1', staffId: 's1' }]
  assert.equal(coverageGaps(ctx, WEEK).length, gaps.length - 1)
  ctx.absences = [{ id: 'x', staffId: 's1', date: WEEK, periodId: null }]
  assert.equal(coverageGaps(ctx, WEEK).length, gaps.length, 'an absent person does not cover the slot')
})

test('duty: suggestions avoid conflicts and prefer the least loaded, with reasons', () => {
  const ctx = base()
  ctx.assignments = [
    { id: 'a1', date: WEEK, periodId: 'p1', locationId: 'l1', staffId: 's1' },
    { id: 'a2', date: '2026-11-16', periodId: 'p1', locationId: 'l1', staffId: 's2' },
    { id: 'a3', date: '2026-11-17', periodId: 'p1', locationId: 'l1', staffId: 's2' },
  ]
  const s = suggestStaff(ctx, WEEK, { date: WEEK, periodId: 'p1', locationId: 'l2' })
  assert.deepEqual(s.map(x => x.staffId), ['s3', 's2'], 's1 is busy at that time; s3 has the fewest duties')
  assert.ok(s[0].reasons.some(r => r.includes('פחות מהממוצע')))
  assert.deepEqual(suggestStaff(ctx, WEEK, { date: WEEK, periodId: 'p1', locationId: 'l2' }, 5, ['s3']).map(x => x.staffId), ['s2'])
})

test('duty: absence impact, snapshot and display with substitutes', () => {
  const ctx = base()
  ctx.assignments = [
    { id: 'a1', date: WEEK, periodId: 'p1', locationId: 'l1', staffId: 's1' },
    { id: 'a2', date: WEEK, periodId: 'p1', locationId: 'l2', staffId: 's2' },
  ]
  ctx.absences = [{ id: 'x', staffId: 's1', date: WEEK, periodId: null }, { id: 'y', staffId: 's2', date: WEEK, periodId: 'p1' }]
  const impacted = impactedAssignments(ctx, [{ id: 'sub', assignmentId: 'a2', substituteStaffId: 's3', cancelled: false }])
  assert.deepEqual(impacted.map(i => [i.assignment.id, i.substitution?.id ?? null]), [['a1', null], ['a2', 'sub']])

  const snap = buildSnapshot(ctx, WEEK)
  assert.equal(snap.filter(e => e.date === WEEK && e.periodId === 'p1').length, 2)
  assert.equal(snap.filter(e => e.date === WEEK && e.periodId === 'p2' && e.staffId === null).length, 2, 'empty required slots are kept')
  assert.equal(snap.filter(e => e.locationId === 'l3').length, 0, 'empty optional slots are not')

  const view = displayDay(snap, WEEK, 10 * 60 + 5, [{ staffId: 's1', periodId: null }, { staffId: 's2', periodId: 'p1' }], [{ assignmentId: 'a2', substituteName: 'מיכל כהן' }])
  assert.deepEqual(view.map(p => [p.periodId, p.state]), [['p1', 'current'], ['pX', 'next'], ['p2', 'later']])
  const yard = view[0].entries.find(e => e.locationId === 'l1')!, hall = view[0].entries.find(e => e.locationId === 'l2')!
  assert.equal(yard.status, 'needs_substitute')
  assert.equal(hall.status, 'substitute'); assert.equal(hall.substituteName, 'מיכל כהן')
  assert.ok(view[1].entries.every(e => e.status === 'unassigned'))
  assert.equal(NO_SUBSTITUTE_LABEL, 'טרם שובץ מחליף')
  assert.deepEqual(displayDay(snap, WEEK, 13 * 60, [], []).map(p => p.state), ['past', 'past', 'past'])
})

test('duty: access levels are separate from the screen role', () => {
  assert.equal(dutyAccessOf({ role: 'EDITOR' }), 'NONE', 'announcement editors get no roster access by default')
  assert.equal(dutyAccessOf({ role: 'EDITOR', dutyAccess: 'EDIT' }), 'EDIT')
  assert.equal(dutyAccessOf({ role: 'SCHOOL_ADMIN', dutyAccess: 'NONE' }), 'PUBLISH')
  assert.ok(hasDutyAccess('PUBLISH', 'EDIT') && !hasDutyAccess('EDIT', 'PUBLISH') && !hasDutyAccess('VIEW', 'EDIT'))
})

test('duty: temporary staff only within their dates; history is not affected', async () => {
  const { FIXED_ISSUES } = await import('@/lib/duty/rules')
  const ctx = base()
  ctx.staff.push({ ...staff('t1', 'אורח'), validFrom: '2026-11-16', validUntil: '2026-11-17' })
  assert.deepEqual(codes(validateAssignment(ctx, WEEK, { date: WEEK, periodId: 'p1', locationId: 'l1', staffId: 't1' })), ['OUTSIDE_VALIDITY'])
  assert.deepEqual(validateAssignment(ctx, WEEK, { date: '2026-11-16', periodId: 'p1', locationId: 'l1', staffId: 't1' }), [])
  assert.deepEqual(codes(validateAssignment(ctx, WEEK, { date: '2026-11-18', periodId: 'p1', locationId: 'l1', staffId: 't1' })), ['OUTSIDE_VALIDITY'])
  assert.ok(FIXED_ISSUES.includes('OUTSIDE_VALIDITY') && !FIXED_ISSUES.includes('OVERLAP'), 'dates cannot be overridden; policies can')
  // An existing assignment outside the dates stays (it is only new assignments that are refused).
  ctx.assignments = [{ id: 'old', date: WEEK, periodId: 'p1', locationId: 'l1', staffId: 't1' }]
  assert.equal(buildSnapshot(ctx, WEEK).filter(e => e.staffId === 't1').length, 1)
  // Manual staff count in workload and conflicts like anyone else.
  assert.deepEqual(codes(blocking(validateAssignment(ctx, WEEK, { date: WEEK, periodId: 'p1', locationId: 'l2', staffId: 't1' }))), ['OUTSIDE_VALIDITY', 'OVERLAP'])
})

test('duty: duplicate-name key ignores spacing, niqqud and punctuation (warning only, not identity)', async () => {
  const { nameKey } = await import('@/lib/duty/rules')
  assert.equal(nameKey({ firstName: 'דָּנָה ', lastName: 'כהן' }), nameKey({ firstName: 'דנה', lastName: ' כהן' }))
  assert.equal(nameKey({ firstName: 'D.', lastName: "O'Brien" }), nameKey({ firstName: 'D', lastName: 'OBrien' }))
  assert.notEqual(nameKey({ firstName: 'דנה', lastName: 'כהן' }), nameKey({ firstName: 'דנה', lastName: 'לוי' }))
  assert.equal(nameKey({ firstName: 'דנה כהן', lastName: '' }), nameKey({ firstName: 'דנה', lastName: 'כהן' }), 'a full name in one field matches')
})

test('duty: recurring template expands per date, without stored rows; skips and overrides apply', async () => {
  const { expandWeek, occurrenceKey, parseOccurrence, weekUsesTemplate } = await import('@/lib/duty/rules')
  const ctx = base()
  const tpl = { id: 'T1', name: 'קבוע', effectiveFrom: '2026-09-01', effectiveUntil: null, entries: [
    { id: 'e1', weekday: 0, periodId: 'p1', locationId: 'l1', staffId: 's1' },
    { id: 'e2', weekday: 1, periodId: 'p1', locationId: 'l1', staffId: 's2' },
  ] }
  const all = expandWeek(ctx, WEEK, true, [tpl], [], [])
  assert.deepEqual(all.map(a => [a.id, a.origin]), [[occurrenceKey('e1', WEEK), 'template'], [occurrenceKey('e2', '2026-11-16'), 'template']])
  assert.deepEqual(parseOccurrence(all[0].id), { entryId: 'e1', date: WEEK })
  // One-time change on Monday: skip + replacement row; Sunday unchanged.
  const changed = expandWeek(ctx, WEEK, true, [tpl], [{ entryId: 'e2', date: '2026-11-16' }], [{ id: 'r1', date: '2026-11-16', periodId: 'p1', locationId: 'l1', staffId: 's3', overrideOfEntryId: 'e2' }])
  assert.deepEqual(changed.map(a => [a.id, a.staffId, a.origin]).sort(), [['r1', 's3', 'override'], [occurrenceKey('e1', WEEK), 's1', 'template']].sort())
  // An independent week ignores the template; the school mode decides when the week has no choice.
  assert.equal(expandWeek(ctx, WEEK, false, [tpl], [], []).length, 0)
  assert.equal(weekUsesTemplate(null, 'WEEKLY'), false)
  assert.equal(weekUsesTemplate(null, 'RECURRING'), true)
  assert.equal(weekUsesTemplate(false, 'HYBRID'), false)
})

test('duty: template versions apply by date (a change from a date keeps earlier dates)', async () => {
  const { expandWeek } = await import('@/lib/duty/rules')
  const ctx = base()
  const v1 = { id: 'v1', name: 'א', effectiveFrom: '2026-09-01', effectiveUntil: '2026-11-16', entries: [{ id: 'a', weekday: 0, periodId: 'p1', locationId: 'l1', staffId: 's1' }, { id: 'b', weekday: 2, periodId: 'p1', locationId: 'l1', staffId: 's1' }] }
  const v2 = { id: 'v2', name: 'א', effectiveFrom: '2026-11-17', effectiveUntil: null, entries: [{ id: 'a2', weekday: 0, periodId: 'p1', locationId: 'l1', staffId: 's1' }, { id: 'b2', weekday: 2, periodId: 'p1', locationId: 'l1', staffId: 's2' }] }
  const week = expandWeek(ctx, WEEK, true, [v1, v2], [], [])
  assert.deepEqual(week.map(a => [a.date, a.staffId]), [['2026-11-15', 's1'], ['2026-11-17', 's2']], 'Sunday from v1, Tuesday from v2')
})

test('duty: calendar – holidays and no-school days have no duties; special days do', async () => {
  const { expandWeek, isSchoolDay } = await import('@/lib/duty/rules')
  const ctx = base()
  ctx.calendar = [{ date: '2026-11-16', kind: 'HOLIDAY', name: 'חנוכה' }, { date: '2026-11-20', kind: 'SPECIAL', name: 'יום שישי מיוחד' }]
  assert.equal(isSchoolDay(ctx, '2026-11-16'), false)
  assert.equal(isSchoolDay(ctx, '2026-11-20'), true, 'Friday is not a school day here, but it is special')
  assert.deepEqual(codes(validateAssignment(ctx, WEEK, { date: '2026-11-16', periodId: 'p1', locationId: 'l1', staffId: 's1' })), ['NOT_SCHOOL_DAY'])
  assert.match(validateAssignment(ctx, WEEK, { date: '2026-11-16', periodId: 'p1', locationId: 'l1', staffId: 's1' })[0].message, /חנוכה/)
  assert.deepEqual(validateAssignment(ctx, WEEK, { date: '2026-11-20', periodId: 'p1', locationId: 'l1', staffId: 's1' }), [], 'any period on a special day')
  const tpl = { id: 'T', name: 'x', effectiveFrom: '2026-01-01', effectiveUntil: null, entries: [{ id: 'm', weekday: 1, periodId: 'p1', locationId: 'l1', staffId: 's1' }] }
  assert.equal(expandWeek(ctx, WEEK, true, [tpl], [], []).length, 0, 'no template duty on a holiday')
  assert.ok(!coverageGaps(ctx, WEEK).some(g => g.date === '2026-11-16'), 'no gaps on a holiday')
  assert.ok(coverageGaps(ctx, WEEK).some(g => g.date === '2026-11-20'), 'gaps on a special day')
})

test('duty: a week crossing the new year', async () => {
  const { expandWeek } = await import('@/lib/duty/rules')
  assert.equal(weekStartOf('2027-01-01'), '2026-12-27')
  assert.deepEqual(weekDates('2026-12-27').slice(4, 7), ['2026-12-31', '2027-01-01', '2027-01-02'])
  const ctx = base()
  const tpl = { id: 'T', name: 'x', effectiveFrom: '2026-12-31', effectiveUntil: null, entries: [{ id: 'w', weekday: 3, periodId: 'p1', locationId: 'l1', staffId: 's1' }, { id: 'th', weekday: 4, periodId: 'p1', locationId: 'l1', staffId: 's1' }] }
  assert.deepEqual(expandWeek(ctx, '2026-12-27', true, [tpl], [], []).map(a => a.date), ['2026-12-31'], 'Wednesday 30.12 is before the template; Thursday 31.12 is in it')
})

test('duty: recurring entries are validated on their weekday', async () => {
  const { validateTemplateEntry } = await import('@/lib/duty/rules')
  const ctx = base()
  const entries = [{ id: 'e1', weekday: 0, periodId: 'p1', locationId: 'l1', staffId: 's1' }]
  assert.deepEqual(codes(blocking(validateTemplateEntry(ctx, entries, { weekday: 0, periodId: 'p1', locationId: 'l2', staffId: 's1' }))), ['OVERLAP'])
  assert.deepEqual(blocking(validateTemplateEntry(ctx, entries, { weekday: 1, periodId: 'p1', locationId: 'l2', staffId: 's1' })), [])
  ctx.staff[0].validUntil = '2000-01-01'
  assert.deepEqual(blocking(validateTemplateEntry(ctx, entries, { weekday: 1, periodId: 'p2', locationId: 'l2', staffId: 's1' })), [], 'temporary dates are checked per date, not in the template')
})

test('duty: school-local time across daylight-saving changes (Asia/Jerusalem)', async () => {
  const { zonedParts } = await import('@/lib/zonedTime')
  // Summer time starts Friday 27.3.2026 02:00 (UTC+2 → UTC+3) and ends Sunday 25.10.2026 02:00.
  assert.deepEqual([zonedParts(new Date('2026-03-26T07:30:00Z'), 'Asia/Jerusalem').minutes, zonedParts(new Date('2026-03-29T07:30:00Z'), 'Asia/Jerusalem').minutes], [9 * 60 + 30, 10 * 60 + 30])
  assert.deepEqual([zonedParts(new Date('2026-10-23T07:30:00Z'), 'Asia/Jerusalem').minutes, zonedParts(new Date('2026-10-26T07:30:00Z'), 'Asia/Jerusalem').minutes], [10 * 60 + 30, 9 * 60 + 30])
  assert.equal(zonedParts(new Date('2026-11-15T22:30:00Z'), 'Asia/Jerusalem').date, '2026-11-16', 'after local midnight it is already the next school day')
})

test('duty: recurring duties stop for archived and expired temporary staff (the slot becomes uncovered)', async () => {
  const { expandWeek } = await import('@/lib/duty/rules')
  const ctx = base()
  ctx.staff[0].validUntil = '2026-11-15'
  ctx.staff[1].active = false
  const tpl = { id: 'T', name: 'x', effectiveFrom: '2026-01-01', effectiveUntil: null, entries: [
    { id: 'a', weekday: 0, periodId: 'p1', locationId: 'l1', staffId: 's1' }, { id: 'b', weekday: 1, periodId: 'p1', locationId: 'l1', staffId: 's1' },
    { id: 'c', weekday: 2, periodId: 'p1', locationId: 'l1', staffId: 's2' }, { id: 'd', weekday: 3, periodId: 'p1', locationId: 'l1', staffId: 's3' } ] }
  assert.deepEqual(expandWeek(ctx, WEEK, true, [tpl], [], []).map(a => a.entryId), ['a', 'd'], 's1 until Sunday only; s2 archived')
})
