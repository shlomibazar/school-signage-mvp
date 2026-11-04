// Announcement status and scheduling helpers, shared by the admin UI and the API (no server
// imports). Status is derived from the data; there is no status column.
//
// "No end date" uses the representation the form has always used: an end date in 2099.

export const OPEN_END_LOCAL = '2099-12-31T23:59'
const OPEN_END_FROM = Date.UTC(2099, 0, 1)

export function isOpenEnded(endAt: string | Date): boolean {
  return new Date(endAt).getTime() >= OPEN_END_FROM
}

export type AnnouncementStatus = 'inactive' | 'expired' | 'draft' | 'scheduled' | 'live'

/**
 * - inactive:  switched off by the user
 * - expired:   its end date has passed
 * - draft:     not assigned to any screen region, so no TV shows it
 * - scheduled: assigned, but its start date is still ahead
 * - live:      assigned and within its dates (shown on the TV, subject to day/time limits)
 */
export function announcementStatus(a: { active: boolean; startAt: string | Date; endAt: string | Date }, assigned: boolean, now = new Date()): AnnouncementStatus {
  if (!a.active) return 'inactive'
  if (new Date(a.endAt) < now) return 'expired'
  if (!assigned) return 'draft'
  if (new Date(a.startAt) > now) return 'scheduled'
  return 'live'
}

export const STATUS_LABEL: Record<AnnouncementStatus, string> = {
  live: 'מוצגת עכשיו',
  scheduled: 'מתוזמנת',
  draft: 'טיוטה · לא משויכת',
  expired: 'הסתיימה',
  inactive: 'כבויה',
}

export type SchedulePreset = 'none' | 'week' | 'month' | 'custom'

/** Local "YYYY-MM-DDTHH:mm" (the format of <input type="datetime-local">). */
export function toLocalInput(value: string | Date): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * End date (local datetime string) for a preset, counted from the start:
 * none → the open end; week → 7 days later at 23:59; month → one calendar month later at 23:59.
 * 'custom' returns null (the user picks the date).
 */
export function presetEnd(preset: SchedulePreset, startLocal: string): string | null {
  if (preset === 'none') return OPEN_END_LOCAL
  if (preset === 'custom') return null
  const start = new Date(startLocal)
  if (Number.isNaN(start.getTime())) return null
  const end = new Date(start)
  if (preset === 'week') end.setDate(end.getDate() + 7)
  else {
    const day = end.getDate()
    end.setDate(1); end.setMonth(end.getMonth() + 1)
    end.setDate(Math.min(day, new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate()))
  }
  end.setHours(23, 59, 0, 0)
  return toLocalInput(end)
}

/** The preset an existing announcement is shown with: open-ended ones as "none", all others as their exact dates. */
export function presetFor(endAt: string | Date): SchedulePreset {
  return isOpenEnded(endAt) ? 'none' : 'custom'
}
