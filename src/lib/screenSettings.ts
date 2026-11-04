import type { ScreenSchedule } from '@/lib/screenSchedule'

// Shared text and rules for the screen settings pages (labels only: the stored values, the API
// validation and the TV's behaviour are unchanged).

/** The refresh intervals the API accepts (PATCH /api/screens/[id]/refresh). */
export const REFRESH_CHOICES = [300, 600, 900] as const
export const isRefreshChoice = (secs: number) => (REFRESH_CHOICES as readonly number[]).includes(secs)
export const refreshLabel = (secs: number) => isRefreshChoice(secs) ? `כל ${secs / 60} דקות` : `כל ${secs} שניות`

export const WEEK_DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'] as const

export const STANDBY_LABELS: Record<ScreenSchedule['standbyMode'], string> = {
  clock: 'שעון בלבד',
  message: 'שעון + נתראה בקרוב',
  logo: 'שעון + נתראה בקרוב + לוגו בית הספר',
}

/** "א׳–ה׳", "א׳, ג׳, ה׳", "כל השבוע". Days are 0 (Sunday) … 6 (Saturday). */
export function daysLabel(days: number[]): string {
  const sorted = [...new Set(days)].filter(d => d >= 0 && d <= 6).sort((a, b) => a - b)
  if (sorted.length === 7) return 'כל השבוע'
  if (sorted.length === 0) return 'ללא ימים'
  const consecutive = sorted.length >= 3 && sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1)
  return consecutive ? `${WEEK_DAYS[sorted[0]]}–${WEEK_DAYS[sorted[sorted.length - 1]]}` : sorted.map(d => WEEK_DAYS[d]).join(', ')
}

/** One line for the settings overview: "כבוי — המסך מציג תוכן תמיד" or "07:00–19:00 · א׳–ה׳". */
export function scheduleSummary(s: ScreenSchedule): string {
  if (!s.enabled) return 'ללא הגבלה — תוכן מוצג תמיד'
  const hours = s.startTime === s.endTime ? 'כל היום' : `${s.startTime}–${s.endTime}`
  return `${hours} · ${daysLabel(s.days)}`
}

export const timezoneLabel = (tz: string) => tz === 'Asia/Jerusalem' ? 'שעון ישראל (Asia/Jerusalem)' : tz

/** Client-side check matching the API's schedule rules, with a message per field. */
export function validateSchedule(s: ScreenSchedule): Partial<Record<'startTime' | 'endTime' | 'days', string>> {
  const errors: Partial<Record<'startTime' | 'endTime' | 'days', string>> = {}
  const time = /^([01]\d|2[0-3]):[0-5]\d$/
  if (!time.test(s.startTime)) errors.startTime = 'יש להזין שעה תקינה'
  if (!time.test(s.endTime)) errors.endTime = 'יש להזין שעה תקינה'
  if (s.enabled && s.days.length === 0) errors.days = 'יש לבחור לפחות יום פעילות אחד'
  return errors
}

export const sameSchedule = (a: ScreenSchedule, b: ScreenSchedule) =>
  a.enabled === b.enabled && a.startTime === b.startTime && a.endTime === b.endTime && a.standbyMode === b.standbyMode &&
  [...a.days].sort().join() === [...b.days].sort().join()

/** The weather city is stored as "lat,lon|name" (picked from the list) or a plain name (older data). */
export const weatherCityName = (value: string | null | undefined) => value?.includes('|') ? value.split('|').slice(1).join('|') : value ?? ''
