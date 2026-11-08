// What a screen shows about birthdays, and how it is configured. Client-safe (no database): used by
// the editor forms, the editor preview, the public renderer and the server.
//
// The people themselves live only in the central registry (/admin/birthdays). A screen region or the
// footer stores a *display configuration*; the server turns it into a short public list when the TV
// page is rendered (see lib/people/screenBirthdays.ts).
//
// Date ranges (always in the school's time zone; February 29 is celebrated on February 28 in
// non-leap years — see lib/people/birthdays.ts):
//   today  — today only
//   next7  — today and the following 6 days (7 days, today included)
//   week   — the current school week, Sunday to Saturday (days that already passed included)
//   month  — the current calendar month, from the 1st to its last day
// Grades filter students only. Teachers are never filtered out by grade: when the audience includes
// teachers, all teachers with a birthday in the range are shown, whatever grades are selected.

export type BirthdayAudience = 'ALL' | 'STUDENT' | 'TEACHER'
export type BirthdayRange = 'today' | 'next7' | 'week' | 'month'
export type BirthdayNameFormat = 'first' | 'full'

export type BirthdayDisplayConfig = {
  audience: BirthdayAudience
  period: BirthdayRange
  /** Canonical grades ("ט׳"); empty = all grades. Students only. */
  grades: string[]
  nameFormat: BirthdayNameFormat
}

/** The settings of a "ימי הולדת" region (stored in ContentItem.settings). */
export type BirthdayRegionSettings = BirthdayDisplayConfig & {
  mode: 'registry'
  /** Custom heading; empty = the default heading of the range. */
  title: string
  /** Line under the heading; empty = none. */
  greetingText: string
}

/** What a public screen receives about one birthday: never an id, a birth year or a full date. */
export type PublicBirthday = { name: string; className: string | null; role: 'STUDENT' | 'TEACHER'; day: number; month: number }

/** The list the server attaches to a region or the footer of a public screen. */
export type PublicBirthdayList = { items: PublicBirthday[]; today: { day: number; month: number }; more: number }

export const BIRTHDAY_AUDIENCES: { value: BirthdayAudience; label: string }[] = [
  { value: 'STUDENT', label: 'תלמידים' },
  { value: 'TEACHER', label: 'מורים' },
  { value: 'ALL', label: 'תלמידים ומורים' },
]
export const BIRTHDAY_RANGES: { value: BirthdayRange; label: string; hint: string }[] = [
  { value: 'today', label: 'היום', hint: 'ימי הולדת של היום בלבד' },
  { value: 'next7', label: '7 הימים הקרובים', hint: 'היום ו־6 הימים שאחריו' },
  { value: 'week', label: 'השבוע', hint: 'מיום ראשון עד שבת של השבוע הנוכחי' },
  { value: 'month', label: 'החודש', hint: 'מה־1 בחודש ועד סופו' },
]

export const DEFAULT_BIRTHDAY_CONFIG: BirthdayDisplayConfig = { audience: 'ALL', period: 'today', grades: [], nameFormat: 'first' }
export const DEFAULT_BIRTHDAY_REGION: BirthdayRegionSettings = { mode: 'registry', ...DEFAULT_BIRTHDAY_CONFIG, title: '', greetingText: 'מזל טוב! 🎉' }

/** Server-side cap of a list sent to a screen (the rest is reported as a count). */
export const MAX_PUBLIC_BIRTHDAYS = 60

const AUDIENCES = new Set<BirthdayAudience>(['ALL', 'STUDENT', 'TEACHER'])
const RANGES = new Set<BirthdayRange>(['today', 'next7', 'week', 'month'])
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** A valid configuration from any stored or submitted value (unknown values fall back to defaults). */
export function normalizeBirthdayConfig(raw: unknown): BirthdayDisplayConfig {
  const s = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const grades = Array.isArray(s.grades) ? [...new Set(s.grades.filter((g): g is string => typeof g === 'string' && g.length > 0 && g.length <= 10))].slice(0, 20) : []
  return {
    audience: AUDIENCES.has(s.audience as BirthdayAudience) ? s.audience as BirthdayAudience : DEFAULT_BIRTHDAY_CONFIG.audience,
    period: RANGES.has(s.period as BirthdayRange) ? s.period as BirthdayRange : DEFAULT_BIRTHDAY_CONFIG.period,
    grades,
    nameFormat: s.nameFormat === 'full' ? 'full' : 'first',
  }
}

/** Region settings to store: only the display configuration (legacy name/class/date fields are dropped). */
export function normalizeBirthdayRegion(raw: unknown): BirthdayRegionSettings {
  const s = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  return { mode: 'registry', ...normalizeBirthdayConfig(s), title: text(s.title, 80), greetingText: 'greetingText' in s ? text(s.greetingText, 120) : DEFAULT_BIRTHDAY_REGION.greetingText }
}

/** True for regions saved before the central registry (a manually typed single-person card). */
export function isLegacyBirthdayCard(settings: unknown): boolean {
  const s = settings && typeof settings === 'object' ? settings as Record<string, unknown> : {}
  return s.mode !== 'registry'
}

const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

/** Default heading of a range ("ימי הולדת השבוע"); month names come from the server's "today". */
export function birthdayHeading(period: BirthdayRange, today?: { month: number }): string {
  if (period === 'today') return 'ימי הולדת היום'
  if (period === 'next7') return 'ימי הולדת בשבוע הקרוב'
  if (period === 'week') return 'ימי הולדת השבוע'
  return today ? `ימי הולדת ב${MONTHS[today.month - 1]}` : 'ימי הולדת החודש'
}

/** "12.11", or "היום" for today's date. */
export function birthdayDayLabel(b: { day: number; month: number }, today?: { day: number; month: number }): string {
  if (today && b.day === today.day && b.month === today.month) return 'היום'
  return `${b.day}.${b.month}`
}

/** How a person is named in the footer ticker: "נועה (ט׳ 2)", "המורה דנה". */
export function tickerName(b: PublicBirthday): string {
  return b.role === 'TEACHER' ? `המורה ${b.name}` : b.className ? `${b.name} (${b.className})` : b.name
}

/**
 * The birthday segment of the footer ticker, or '' when there is nobody (no empty segment).
 * Ranges longer than a day add the date to each name.
 */
export function birthdayTickerText(list: PublicBirthdayList | null | undefined, period: BirthdayRange): string {
  if (!list || !list.items.length) return ''
  const names = list.items.map(b => (period === 'today' ? tickerName(b) : `${tickerName(b)} – ${birthdayDayLabel(b, list.today)}`))
  const more = list.more > 0 ? ` ועוד ${list.more}` : ''
  const lead = period === 'today' ? '🎂 יום הולדת שמח' : `🎂 ${birthdayHeading(period, list.today)}`
  return `${lead}: ${names.join(' · ')}${more}`
}

/** The footer's birthday configuration from its layout fields (ScreenLayout.footerBirthday*). */
export function footerBirthdayConfig(layout: { footerBirthdayAudience?: unknown; footerBirthdayPeriod?: unknown; footerBirthdayGrades?: unknown; footerBirthdayNameFormat?: unknown }): BirthdayDisplayConfig {
  return normalizeBirthdayConfig({ audience: layout.footerBirthdayAudience, period: layout.footerBirthdayPeriod, grades: layout.footerBirthdayGrades, nameFormat: layout.footerBirthdayNameFormat })
}
