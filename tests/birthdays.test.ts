import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseDateOnly, formatDateOnly, birthMonthDay, schoolToday, celebrationDay, periodDays, birthdaysInPeriod, toPublicBirthday, type BirthdayPersonInput } from '@/lib/people/birthdays'
import { normalizePersonRecord, normalizeGender } from '@/lib/people/normalize'
import { planSourceUpdate } from '@/lib/people/sourcePrecedence'

const TZ = 'Asia/Jerusalem'
const student = (id: string, birthDate: string, extra: Partial<BirthdayPersonInput> = {}, grade = 'ט׳', className = 'ט׳ 2'): BirthdayPersonInput =>
  ({ id, firstName: id, lastName: 'כהן', birthDate, active: true, roles: [{ role: 'STUDENT', grade, className, active: true }], ...extra })
const teacher = (id: string, birthDate: string): BirthdayPersonInput =>
  ({ id, firstName: id, lastName: 'לוי', birthDate, active: true, roles: [{ role: 'TEACHER', grade: null, className: null, active: true }] })
const ids = (people: BirthdayPersonInput[], period: 'today' | 'week' | 'next7' | 'month', now: string, extra = {}) =>
  birthdaysInPeriod(people, { period, now: new Date(now), timeZone: TZ, ...extra }).map(m => m.id)

test('date-only values: real calendar dates only, no time-zone shift', () => {
  assert.equal(parseDateOnly('2023-02-29'), null)
  assert.equal(formatDateOnly(parseDateOnly('2024-02-29')!), '2024-02-29')
  for (const v of ['2024-13-01', '2024-00-10', '2024-04-31', '24-01-01', '2024/01/01', '', null, 20240101]) assert.equal(parseDateOnly(v), null, String(v))
  // A @db.Date value is UTC midnight; reading it never moves it to the previous day.
  assert.deepEqual(birthMonthDay(new Date('2010-03-01T00:00:00.000Z')), { month: 3, day: 1 })
})

test('today is the school calendar day (Asia/Jerusalem), around midnight', () => {
  // 21:59 UTC on 31.12 is 23:59 in Israel (winter, UTC+2): still 31.12; 22:01 UTC is already 1.1.
  assert.deepEqual({ ...schoolToday(new Date('2026-12-31T21:59:00Z'), TZ), weekday: 0 }, { year: 2026, month: 12, day: 31, weekday: 0 })
  assert.equal(schoolToday(new Date('2026-12-31T22:01:00Z'), TZ).day, 1)
  // Summer (UTC+3): 21:30 UTC on 30.6 is already 1.7 in Israel.
  assert.deepEqual([schoolToday(new Date('2026-06-30T21:30:00Z'), TZ).month, schoolToday(new Date('2026-06-30T21:30:00Z'), TZ).day], [7, 1])
  const people = [student('dec31', '2012-12-31'), student('jan1', '2013-01-01')]
  assert.deepEqual(ids(people, 'today', '2026-12-31T21:59:00Z'), ['dec31'])
  assert.deepEqual(ids(people, 'today', '2026-12-31T22:01:00Z'), ['jan1'])
})

test('periods: today, week (Sunday–Saturday), next 7 days, current month', () => {
  const now = '2026-11-05T10:00:00Z' // Thursday 5.11.2026
  const days = (p: 'week' | 'next7' | 'month') => periodDays(p, schoolToday(new Date(now), TZ)).map(d => `${d.day}.${d.month}`)
  assert.deepEqual(days('week'), ['1.11', '2.11', '3.11', '4.11', '5.11', '6.11', '7.11'])
  assert.deepEqual(days('next7'), ['5.11', '6.11', '7.11', '8.11', '9.11', '10.11', '11.11'])
  assert.equal(days('month').length, 30)
  const people = [student('sun', '2011-11-01'), student('thu', '2011-11-05'), student('sat', '2011-11-07'), student('nextSun', '2011-11-08'), student('end', '2011-11-30'), student('dec', '2011-12-01')]
  assert.deepEqual(ids(people, 'today', now), ['thu'])
  assert.deepEqual(ids(people, 'week', now), ['sun', 'thu', 'sat'])
  assert.deepEqual(ids(people, 'next7', now), ['thu', 'sat', 'nextSun'])
  assert.deepEqual(ids(people, 'month', now), ['sun', 'thu', 'sat', 'nextSun', 'end'])
})

test('December/January: periods that cross the new year', () => {
  const now = '2026-12-29T10:00:00Z' // Tuesday 29.12.2026
  const people = [student('dec29', '2010-12-29'), student('dec31', '2010-12-31'), student('jan2', '2011-01-02'), student('jan4', '2011-01-04'), student('jan5', '2011-01-05')]
  assert.deepEqual(ids(people, 'next7', now), ['dec29', 'dec31', 'jan2', 'jan4'])
  assert.deepEqual(ids(people, 'week', now), ['dec29', 'dec31', 'jan2']) // week of Sun 27.12 – Sat 2.1
  assert.deepEqual(ids(people, 'month', now), ['dec29', 'dec31'])
  const m = birthdaysInPeriod(people, { period: 'next7', now: new Date(now), timeZone: TZ })
  assert.deepEqual(m.find(x => x.id === 'jan2')!.on, { year: 2027, month: 1, day: 2 })
})

test('February 29 policy: celebrated on 28.2 in non-leap years, on 29.2 in leap years', () => {
  const leapling = [student('feb29', '2012-02-29'), student('feb28', '2012-02-28')]
  assert.deepEqual(celebrationDay({ month: 2, day: 29 }, 2027), { year: 2027, month: 2, day: 28 })
  assert.deepEqual(celebrationDay({ month: 2, day: 29 }, 2028), { year: 2028, month: 2, day: 29 })
  assert.deepEqual(ids(leapling, 'today', '2027-02-28T10:00:00Z'), ['feb28', 'feb29']) // non-leap: both on the 28th
  assert.deepEqual(ids(leapling, 'today', '2028-02-28T10:00:00Z'), ['feb28'])
  assert.deepEqual(ids(leapling, 'today', '2028-02-29T10:00:00Z'), ['feb29'])
  assert.deepEqual(ids(leapling, 'today', '2027-03-01T10:00:00Z'), [])
  assert.deepEqual(ids(leapling, 'month', '2027-02-10T10:00:00Z'), ['feb28', 'feb29'])
  assert.deepEqual(ids([student('feb29', '2012-02-29')], 'month', '2027-03-10T10:00:00Z'), [])
})

test('inactive people and inactive roles never match; roles and grade/class filters', () => {
  const now = '2026-11-05T10:00:00Z'
  const people = [
    student('a', '2011-11-05'), student('off', '2011-11-05', { active: false }),
    { ...student('roleOff', '2011-11-05'), roles: [{ role: 'STUDENT' as const, grade: 'ט׳', className: 'ט׳ 2', active: false }] },
    student('g10', '2010-11-05', {}, 'י׳', 'י׳ 1'), teacher('t', '1980-11-05'),
  ]
  assert.deepEqual(ids(people, 'today', now), ['a', 'g10', 't'])
  assert.deepEqual(ids(people, 'today', now, { roles: ['TEACHER'] }), ['t'])
  assert.deepEqual(ids(people, 'today', now, { roles: ['STUDENT'], grades: ['ט׳'] }), ['a'])
  assert.deepEqual(ids(people, 'today', now, { roles: ['STUDENT'], classes: ['י׳ 1'] }), ['g10'])
  assert.deepEqual(ids(people, 'today', now, { grades: ['ט׳'] }), ['a', 't'], 'grade filters apply to students only')
  assert.deepEqual(ids(people, 'today', now, { activeOnly: false }), ['a', 'g10', 'off', 'roleOff', 't'])
})

test('several people on one day: sorted (students first, then name); a person with two roles is listed once', () => {
  const both: BirthdayPersonInput = { id: 'both', firstName: 'דנה', lastName: 'אבן', birthDate: '1990-11-05', active: true,
    roles: [{ role: 'TEACHER', grade: null, className: null, active: true }, { role: 'STUDENT', grade: 'י״ב', className: 'י״ב 1', active: true }] }
  const people = [teacher('t', '1980-11-05'), student('z', '2011-11-05', { lastName: 'זהבי' }), student('b', '2011-11-05', { lastName: 'ברק' }), both]
  const m = birthdaysInPeriod(people, { period: 'today', now: new Date('2026-11-05T10:00:00Z'), timeZone: TZ })
  assert.deepEqual(m.map(x => x.id), ['b', 'z', 'both', 't'])
  assert.equal(m.filter(x => x.id === 'both').length, 1)
})

test('public birthday data: name, class, day and month only — no year, date, age or ids', () => {
  const [m] = birthdaysInPeriod([student('נועה', '2011-11-05')], { period: 'today', now: new Date('2026-11-05T10:00:00Z'), timeZone: TZ })
  const pub = toPublicBirthday(m)
  assert.deepEqual(Object.keys(pub).sort(), ['className', 'day', 'month', 'name', 'role'])
  assert.equal(pub.name, 'נועה')
  assert.equal(toPublicBirthday(m, { lastName: true }).name, 'נועה כהן')
  assert.equal(toPublicBirthday(m, { showClass: false }).className, null)
  assert.ok(!JSON.stringify(pub).includes('2011'))
})

test('normalization: names, dates, gender and role-specific fields', () => {
  const now = new Date('2026-11-05T10:00:00Z')
  const ok = normalizePersonRecord({ firstName: '  נועה ', lastName: 'בן-דוד', birthDate: '2011-03-01', gender: 'נקבה', role: 'STUDENT', grade: "ט'", parallel: '2', externalId: '012345678' }, now)
  assert.ok(ok.ok)
  if (ok.ok) assert.deepEqual(ok.record, { externalId: '012345678', firstName: 'נועה', lastName: 'בן-דוד', birthDate: '2011-03-01', gender: 'FEMALE', role: 'STUDENT', grade: 'ט׳', parallel: 2, className: 'ט׳ 2' })
  const t = normalizePersonRecord({ firstName: 'Dan', lastName: "O'Neil", birthDate: '1980-01-01', role: 'TEACHER', grade: 'ט', parallel: 2 }, now)
  assert.ok(t.ok && t.record.grade === null && t.record.className === null && t.record.gender === null, 'teachers have no class; missing gender stays empty')
  const bad = normalizePersonRecord({ firstName: '<b>x</b>', lastName: '', birthDate: '2030-01-01', role: 'PRINCIPAL', gender: 'x', externalId: 12345 as unknown as string }, now)
  assert.ok(!bad.ok)
  if (!bad.ok) assert.deepEqual(Object.keys(bad.errors).sort(), ['birthDate', 'externalId', 'firstName', 'gender', 'lastName', 'role'])
  assert.equal(normalizeGender('ז'), 'MALE')
  assert.equal(normalizeGender(''), null)
})

test('source precedence: SmartSchool > Excel > manual, never by timestamps; values are never cleared', () => {
  const current = { dataSource: 'SMARTSCHOOL' as const, firstName: 'נועה', lastName: 'כהן', birthDate: '2011-03-01', gender: 'FEMALE' as const }
  const fromExcel = planSourceUpdate(current, 'EXCEL', { firstName: 'נועה', lastName: 'כהן-לוי', birthDate: '2011-03-02' })
  assert.deepEqual(fromExcel, { changes: {}, kept: ['lastName', 'birthDate'], dataSource: 'SMARTSCHOOL' })
  const fromSmart = planSourceUpdate({ ...current, dataSource: 'EXCEL' }, 'SMARTSCHOOL', { lastName: 'כהן-לוי' })
  assert.deepEqual(fromSmart, { changes: { lastName: 'כהן-לוי' }, kept: [], dataSource: 'SMARTSCHOOL' })
  const fill = planSourceUpdate({ ...current, gender: null }, 'EXCEL', { gender: 'FEMALE' })
  assert.deepEqual(fill.changes, { gender: 'FEMALE' }, 'a lower source may fill an empty field')
  const noClear = planSourceUpdate({ ...current, dataSource: 'MANUAL' }, 'EXCEL', { lastName: '', gender: null })
  assert.deepEqual(noClear.changes, {})
  assert.equal(planSourceUpdate({ ...current, dataSource: 'MANUAL' }, 'EXCEL', {}).dataSource, 'EXCEL')
})
