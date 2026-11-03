// Wall-clock time in a school's time zone, independent of the server's (UTC on Render) and the
// TV's own time-zone settings. Intl handles daylight-saving changes. An unknown time-zone name
// falls back to Asia/Jerusalem.

export const DEFAULT_TIME_ZONE = 'Asia/Jerusalem'

export type ZonedParts = {
  date: string     // YYYY-MM-DD
  weekday: number  // 0 = Sunday … 6 = Saturday
  hour: number
  minute: number
  second: number
  minutes: number  // minutes since midnight
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    })
    formatters.set(timeZone, f)
  }
  return f
}

export function zonedParts(at: Date, timeZone?: string | null): ZonedParts {
  let parts: Intl.DateTimeFormatPart[]
  try { parts = formatter(timeZone || DEFAULT_TIME_ZONE).formatToParts(at) }
  catch { parts = formatter(DEFAULT_TIME_ZONE).formatToParts(at) }
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  const hour = Number(get('hour')) % 24, minute = Number(get('minute')), second = Number(get('second'))
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: WEEKDAYS.indexOf(get('weekday')),
    hour, minute, second,
    minutes: hour * 60 + minute,
  }
}

/** HH:mm in the given time zone (24-hour clock). */
export function zonedClock(at: Date, timeZone?: string | null, withSeconds = false): string {
  const p = zonedParts(at, timeZone)
  const two = (n: number) => String(n).padStart(2, '0')
  return `${two(p.hour)}:${two(p.minute)}${withSeconds ? `:${two(p.second)}` : ''}`
}

/** A Date at local noon on the school's calendar day, for date formatters that read local fields. */
export function zonedCalendarDate(at: Date, timeZone?: string | null): Date {
  const [y, m, d] = zonedParts(at, timeZone).date.split('-').map(Number)
  return new Date(y, m - 1, d, 12)
}

/** "HH:mm" → minutes since midnight, or null when not set or malformed. */
export function clockMinutes(value: string | null | undefined): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value ?? '')
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/**
 * Is `minutes` inside the daily window [start, end)? A missing bound is open; a window whose end
 * is before its start runs past midnight (22:00–06:00); equal bounds mean the whole day.
 */
export function inDailyWindow(minutes: number, start: number | null, end: number | null): boolean {
  if (start === null && end === null) return true
  if (start === null) return minutes < end!
  if (end === null) return minutes >= start
  if (start === end) return true
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end
}
