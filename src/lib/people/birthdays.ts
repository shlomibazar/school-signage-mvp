import { zonedParts, DEFAULT_TIME_ZONE } from '@/lib/zonedTime'

// Birthday calculations. Pure functions, shared by management pages and (in Stage 5) the screens.
//
// - Birth dates are date-only values. A Date from the database (@db.Date) is UTC midnight and is
//   read with UTC getters only; strings are "YYYY-MM-DD". No time-zone conversion is ever applied
//   to a birth date.
// - "Today" is the calendar day in the school's time zone (default Asia/Jerusalem), not the server's.
// - Matching uses day and month only. The birth year is never needed (and never returned).
// - February 29 policy: in a non-leap year, a February 29 birthday is celebrated on February 28
//   (it then shows in "today" on Feb 28, and in any period that contains Feb 28).
// - Weeks run Sunday to Saturday (the Israeli school week).

export type CalendarDay = { year: number; month: number; day: number }
export type BirthdayPeriod = 'today' | 'week' | 'next7' | 'month'
export const BIRTHDAY_PERIODS: BirthdayPeriod[] = ['today', 'week', 'next7', 'month']

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()

/** "YYYY-MM-DD" → a date-only Date (UTC midnight), or null if it is not a real calendar date. */
export function parseDateOnly(value: unknown): Date | null {
  if (typeof value !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null
  return new Date(Date.UTC(y, mo - 1, d))
}

/** A date-only Date → "YYYY-MM-DD" (UTC fields). */
export function formatDateOnly(date: Date): string {
  const two = (n: number) => String(n).padStart(2, '0')
  return `${date.getUTCFullYear()}-${two(date.getUTCMonth() + 1)}-${two(date.getUTCDate())}`
}

/** Day and month of a birth date (Date from the database, or "YYYY-MM-DD"). */
export function birthMonthDay(birthDate: Date | string): { month: number; day: number } | null {
  const d = typeof birthDate === 'string' ? parseDateOnly(birthDate) : birthDate
  if (!d || Number.isNaN(d.getTime())) return null
  return { month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

/** The school's calendar day at a moment. */
export function schoolToday(now: Date, timeZone?: string | null): CalendarDay & { weekday: number } {
  const p = zonedParts(now, timeZone || DEFAULT_TIME_ZONE)
  const [year, month, day] = p.date.split('-').map(Number)
  return { year, month, day, weekday: p.weekday }
}

/** The day a birthday is celebrated in a given year (the February 29 policy is applied here). */
export function celebrationDay(birth: { month: number; day: number }, year: number): CalendarDay {
  if (birth.month === 2 && birth.day === 29 && !isLeap(year)) return { year, month: 2, day: 28 }
  return { year, month: birth.month, day: birth.day }
}

const addDays = (d: CalendarDay, n: number): CalendarDay => {
  const t = new Date(Date.UTC(d.year, d.month - 1, d.day + n))
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() }
}

/** The calendar days of a period, in order, starting from the school's today. */
export function periodDays(period: BirthdayPeriod, today: CalendarDay & { weekday: number }): CalendarDay[] {
  const from = period === 'week' ? addDays(today, -today.weekday) : period === 'month' ? { year: today.year, month: today.month, day: 1 } : today
  const length = period === 'today' ? 1 : period === 'month' ? daysInMonth(today.year, today.month) : 7
  return Array.from({ length }, (_, i) => addDays(from, i))
}

/** The day within the period on which the birthday falls, or null. */
export function birthdayInPeriod(birth: { month: number; day: number }, days: CalendarDay[]): CalendarDay | null {
  for (const d of days) {
    const c = celebrationDay(birth, d.year)
    if (c.month === d.month && c.day === d.day) return d
  }
  return null
}

export type BirthdayPersonInput = {
  id: string
  firstName: string
  lastName: string
  birthDate: Date | string
  active: boolean
  roles: { role: 'STUDENT' | 'TEACHER'; grade: string | null; className: string | null; active: boolean }[]
}

export type BirthdayFilter = {
  period: BirthdayPeriod
  now: Date
  timeZone?: string | null
  roles?: ('STUDENT' | 'TEACHER')[]
  /** Students only: canonical grades (empty = all). */
  grades?: string[]
  /** Students only: display classes (empty = all). */
  classes?: string[]
  /** Default true: inactive people and inactive roles never match. */
  activeOnly?: boolean
}

export type BirthdayMatch = { id: string; firstName: string; lastName: string; role: 'STUDENT' | 'TEACHER'; className: string | null; on: CalendarDay }

/** People with a birthday in the period, sorted by day, then role (students first), then name. */
export function birthdaysInPeriod(people: BirthdayPersonInput[], f: BirthdayFilter): BirthdayMatch[] {
  const days = periodDays(f.period, schoolToday(f.now, f.timeZone))
  const roles = f.roles?.length ? f.roles : ['STUDENT', 'TEACHER']
  const activeOnly = f.activeOnly !== false
  const out: BirthdayMatch[] = []
  for (const p of people) {
    if (activeOnly && !p.active) continue
    const birth = birthMonthDay(p.birthDate)
    if (!birth) continue
    const on = birthdayInPeriod(birth, days)
    if (!on) continue
    // One match per person: their first matching role (a person who is both is listed once).
    const role = p.roles.find(r => roles.includes(r.role) && (!activeOnly || r.active) && (r.role !== 'STUDENT' ||
      ((!f.grades?.length || (!!r.grade && f.grades.includes(r.grade))) && (!f.classes?.length || (!!r.className && f.classes.includes(r.className))))))
    if (!role) continue
    out.push({ id: p.id, firstName: p.firstName, lastName: p.lastName, role: role.role, className: role.role === 'STUDENT' ? role.className : null, on })
  }
  const key = (d: CalendarDay) => d.year * 10000 + d.month * 100 + d.day
  return out.sort((a, b) => key(a.on) - key(b.on) || (a.role === b.role ? 0 : a.role === 'STUDENT' ? -1 : 1) ||
    a.lastName.localeCompare(b.lastName, 'he') || a.firstName.localeCompare(b.firstName, 'he'))
}

/**
 * What a public screen may receive about a birthday: a display name, the class (students) and the
 * day/month. Never the birth year, the full date, an age, an identifier or an internal id.
 */
export type PublicBirthday = { name: string; className: string | null; role: 'STUDENT' | 'TEACHER'; day: number; month: number }
export function toPublicBirthday(m: BirthdayMatch, opts: { lastName?: boolean; showClass?: boolean } = {}): PublicBirthday {
  return {
    name: opts.lastName ? `${m.firstName} ${m.lastName}`.trim() : m.firstName,
    className: opts.showClass === false ? null : m.className,
    role: m.role,
    day: m.on.day,
    month: m.on.month,
  }
}
