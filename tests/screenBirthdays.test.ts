import { test } from 'node:test'
import assert from 'node:assert/strict'
import { publicBirthdayList, monthsFor } from '@/lib/people/screenBirthdays'
import type { BirthdayPersonInput } from '@/lib/people/birthdays'
import {
  normalizeBirthdayConfig, normalizeBirthdayRegion, isLegacyBirthdayCard, birthdayTickerText, birthdayHeading,
  footerBirthdayConfig, MAX_PUBLIC_BIRTHDAYS, DEFAULT_BIRTHDAY_CONFIG, type BirthdayDisplayConfig,
} from '@/lib/birthdayDisplay'
import { publicContentSettings } from '@/lib/publicContent'
import { gridFor } from '@/components/display/BirthdayBoard'

// Synthetic people only. "Now" is Tuesday 10.11.2026, 11:00 in Israel: the school week is
// Sunday 8.11 – Saturday 14.11, the next 7 days are 10.11 – 16.11, the month is November.
const NOW = new Date('2026-11-10T09:00:00Z')
const TZ = 'Asia/Jerusalem'
let seq = 0
const student = (first: string, birth: string, grade = 'ט׳', className = `${grade} 1`, extra: Partial<BirthdayPersonInput> = {}): BirthdayPersonInput =>
  ({ id: `s${++seq}`, firstName: first, lastName: 'בדיקה', birthDate: birth, active: true, roles: [{ role: 'STUDENT', grade, className, active: true }], ...extra })
const teacher = (first: string, birth: string): BirthdayPersonInput =>
  ({ id: `t${++seq}`, firstName: first, lastName: 'מורה', birthDate: birth, active: true, roles: [{ role: 'TEACHER', grade: null, className: null, active: true }] })
const cfg = (o: Partial<BirthdayDisplayConfig> = {}): BirthdayDisplayConfig => ({ ...DEFAULT_BIRTHDAY_CONFIG, ...o })
const names = (people: BirthdayPersonInput[], o: Partial<BirthdayDisplayConfig>, now = NOW) => publicBirthdayList(people, cfg(o), now, TZ).items.map(b => b.name)

const PEOPLE = [
  student('נועה', '2012-11-10', 'ט׳', 'ט׳ 2'),      // today
  student('איתי', '2013-11-08', 'ח׳', 'ח׳ 1'),      // Sunday of this week (already passed)
  student('מאיה', '2011-11-15', 'י׳', 'י׳ 3'),      // in 7 days, outside the school week
  student('יונתן', '2012-11-25', 'ט׳', 'ט׳ 1'),     // later this month
  student('תמר', '2012-12-01', 'ט׳', 'ט׳ 1'),       // next month
  teacher('דנה', '1980-11-10'),                      // today
  teacher('אבי', '1975-11-13'),                      // this week
]

test('audience: students, teachers, or both', () => {
  assert.deepEqual(names(PEOPLE, { audience: 'STUDENT' }), ['נועה'])
  assert.deepEqual(names(PEOPLE, { audience: 'TEACHER' }), ['דנה'])
  assert.deepEqual(names(PEOPLE, { audience: 'ALL' }), ['נועה', 'דנה'], 'students first on the same day')
})

test('date ranges: today, next 7 days, school week (Sunday–Saturday), month', () => {
  assert.deepEqual(names(PEOPLE, { period: 'today' }), ['נועה', 'דנה'])
  assert.deepEqual(names(PEOPLE, { period: 'next7' }), ['נועה', 'דנה', 'אבי', 'מאיה'], 'today … +6 days, in date order')
  assert.deepEqual(names(PEOPLE, { period: 'week' }), ['איתי', 'נועה', 'דנה', 'אבי'], 'Sunday 8.11 to Saturday 14.11, past days included')
  assert.deepEqual(names(PEOPLE, { period: 'month' }), ['איתי', 'נועה', 'דנה', 'אבי', 'מאיה', 'יונתן'])
  // A range that crosses the month: Sunday 29.11 → next 7 days reach 1.12.
  assert.deepEqual(names(PEOPLE, { period: 'next7' }, new Date('2026-11-29T08:00:00Z')), ['תמר'])
  assert.deepEqual(monthsFor([cfg({ period: 'next7' })], new Date('2026-11-29T08:00:00Z'), TZ), [11, 12])
  assert.deepEqual(monthsFor([cfg({ period: 'today' }), cfg({ period: 'month' })], NOW, TZ), [11])
})

test('grade filter applies to students only; teachers are never hidden by it', () => {
  assert.deepEqual(names(PEOPLE, { period: 'month', grades: ['ט׳'] }), ['נועה', 'דנה', 'אבי', 'יונתן'])
  assert.deepEqual(names(PEOPLE, { period: 'month', grades: ['ח׳', 'י׳'], audience: 'STUDENT' }), ['איתי', 'מאיה'])
  assert.deepEqual(names(PEOPLE, { period: 'month', grades: ['ט׳'], audience: 'TEACHER' }), ['דנה', 'אבי'])
  assert.deepEqual(names(PEOPLE, { period: 'month', grades: ['א׳'], audience: 'STUDENT' }), [], 'a grade nobody has: none')
})

test('February 29: on 28.2 in a non-leap year, on 29.2 in a leap year (never twice)', () => {
  const leapling = [student('הילה', '2008-02-29')]
  assert.deepEqual(names(leapling, { period: 'today' }, new Date('2027-02-28T08:00:00Z')), ['הילה'])
  assert.deepEqual(names(leapling, { period: 'today' }, new Date('2028-02-28T08:00:00Z')), [])
  assert.deepEqual(names(leapling, { period: 'today' }, new Date('2028-02-29T08:00:00Z')), ['הילה'])
  const list = publicBirthdayList(leapling, cfg({ period: 'month' }), new Date('2027-02-10T08:00:00Z'), TZ)
  assert.deepEqual(list.items.map(b => [b.day, b.month]), [[28, 2]])
})

test('no birthdays; several on one day; inactive people and roles excluded', () => {
  assert.deepEqual(publicBirthdayList([], cfg(), NOW, TZ), { items: [], today: { day: 10, month: 11 }, more: 0 })
  const same = [student('גל', '2012-11-10'), student('אלה', '2012-11-10'), student('בן', '2013-11-10', 'ח׳')]
  assert.deepEqual(names(same, {}), ['אלה', 'בן', 'גל'], 'Hebrew name order within the day (same last name)')
  const inactive = [student('רון', '2012-11-10', 'ט׳', 'ט׳ 1', { active: false }),
    { ...student('שי', '2012-11-10'), roles: [{ role: 'STUDENT' as const, grade: 'ט׳', className: 'ט׳ 1', active: false }] }]
  assert.deepEqual(names(inactive, {}), [])
})

test('a person who is both student and teacher is listed once', () => {
  const both: BirthdayPersonInput = { ...student('עדי', '2000-11-10'), roles: [
    { role: 'STUDENT', grade: 'י״ב', className: 'י״ב 1', active: true }, { role: 'TEACHER', grade: null, className: null, active: true }] }
  assert.equal(publicBirthdayList([both], cfg({ audience: 'ALL' }), NOW, TZ).items.length, 1)
  assert.equal(publicBirthdayList([both], cfg({ audience: 'TEACHER' }), NOW, TZ).items[0].role, 'TEACHER')
})

test('public list: display name, class (students), role, day/month — nothing else; capped with a count', () => {
  const list = publicBirthdayList(PEOPLE, cfg({ period: 'month' }), NOW, TZ)
  for (const b of list.items) assert.deepEqual(Object.keys(b).sort(), ['className', 'day', 'month', 'name', 'role'])
  const text = JSON.stringify(list)
  for (const forbidden of ['2012', '1980', 'בדיקה', 'birthDate', '"id"', 's1', 'identity']) assert.ok(!text.includes(forbidden), forbidden)
  assert.equal(list.items.find(b => b.name === 'דנה')!.className, null, 'teachers: no class')
  assert.deepEqual(names(PEOPLE, { nameFormat: 'full' }), ['נועה בדיקה', 'דנה מורה'])
  const many = Array.from({ length: MAX_PUBLIC_BIRTHDAYS + 5 }, (_, i) => student(`ילד${'א'.repeat(i % 5)}`, '2012-11-10'))
  const capped = publicBirthdayList(many, cfg(), NOW, TZ)
  assert.equal(capped.items.length, MAX_PUBLIC_BIRTHDAYS)
  assert.equal(capped.more, 5)
})

test('settings: defaults, invalid values, legacy cards, what is stored and what is public', () => {
  assert.deepEqual(normalizeBirthdayConfig(null), DEFAULT_BIRTHDAY_CONFIG)
  assert.deepEqual(normalizeBirthdayConfig({ audience: 'PARENTS', period: 'year', grades: ['ט׳', 7, '', 'ט׳'], nameFormat: 'x' }), { audience: 'ALL', period: 'today', grades: ['ט׳'], nameFormat: 'first' })
  assert.equal(isLegacyBirthdayCard({ personName: 'דני', birthDate: '2015-04-12' }), true)
  assert.equal(isLegacyBirthdayCard({ mode: 'registry' }), false)
  // Saving a region keeps only display settings: legacy fields and an attached list are dropped.
  const stored = normalizeBirthdayRegion({ mode: 'registry', audience: 'STUDENT', period: 'week', grades: ['ח׳'], personName: 'דני', birthDate: '2015-04-12', list: { items: [{ name: 'x' }] }, title: '  כותרת  ' })
  assert.deepEqual(stored, { mode: 'registry', audience: 'STUDENT', period: 'week', grades: ['ח׳'], nameFormat: 'first', title: 'כותרת', greetingText: 'מזל טוב! 🎉' })
  assert.equal(normalizeBirthdayRegion({ greetingText: '' }).greetingText, '', 'an emptied greeting stays empty')
  // Public settings of a registry region: the same display settings, nothing typed about a person.
  const pub = publicContentSettings('BIRTHDAYS', { ...stored, personName: 'דני', birthDate: '2015-04-12' })!
  assert.deepEqual(pub, stored)
  // Footer columns → configuration.
  assert.deepEqual(footerBirthdayConfig({ footerBirthdayAudience: 'TEACHER', footerBirthdayPeriod: 'month', footerBirthdayGrades: [], footerBirthdayNameFormat: 'full' }), { audience: 'TEACHER', period: 'month', grades: [], nameFormat: 'full' })
})

test('footer ticker text: names with class or teacher label, dates for longer ranges, nothing when empty', () => {
  const today = publicBirthdayList(PEOPLE, cfg(), NOW, TZ)
  assert.equal(birthdayTickerText(today, 'today'), '🎂 יום הולדת שמח: נועה (ט׳ 2) · המורה דנה')
  const week = publicBirthdayList(PEOPLE, cfg({ period: 'week', audience: 'TEACHER' }), NOW, TZ)
  assert.equal(birthdayTickerText(week, 'week'), '🎂 ימי הולדת השבוע: המורה דנה – היום · המורה אבי – 13.11')
  assert.equal(birthdayTickerText({ items: [], today: { day: 10, month: 11 }, more: 0 }, 'today'), '', 'no empty segment')
  assert.equal(birthdayTickerText(null, 'today'), '')
  assert.match(birthdayTickerText({ items: today.items, today: today.today, more: 3 }, 'today'), / ועוד 3$/)
  assert.equal(birthdayHeading('month', { month: 11 }), 'ימי הולדת בנובמבר')
})

test('region layout: fits on one page when it can, pages when it cannot', () => {
  // A full-width region of a 1920×1080 screen (about 1800×760 for the cards).
  assert.equal(gridFor(1, 1800, 760).pageSize >= 1, true)
  const few = gridFor(6, 1800, 760)
  assert.ok(few.pageSize >= 6, 'six names on one page')
  const third = gridFor(12, 560, 760)
  assert.equal(third.cols, 1, 'a third-width region: one column')
  assert.ok(third.pageSize < 12 && third.cardHeight >= 86, 'pages instead of unreadable cards')
  const many = gridFor(60, 1800, 760)
  assert.ok(many.cardHeight >= 86 && many.pageSize < 60)
})
