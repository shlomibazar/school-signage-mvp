import { isActiveNow } from '@/lib/scheduling'
import { isOpenEnded } from '@/lib/announcementStatus'

// Dashboard view of announcements: is an announcement actually on a TV right now?
//
// Rules (same as the TV, /api/public/announcements/[itemId]):
// - inactive : switched off (active = false)
// - expired  : its end date has passed
// - draft    : not assigned to any announcement region of any screen
// - live     : start date reached, within its days/hours (school time zone), and assigned to at
//              least one region that is switched on, on a screen that is switched on
// - waiting  : assigned and not expired, but not on a TV right now; `reason` says why
//              (starts later / outside its days or hours / only on screens or regions that are off)
// The order of the checks is the order above. Screen operating hours (standby) are not taken
// into account: outside them the TV shows the standby view, but the announcement is still live.

export type DashboardAnnouncement = {
  active: boolean; startAt: Date | string; endAt: Date | string
  startTime: string | null; endTime: string | null; daysOfWeek: number[]
}
export type Placement = { screenActive: boolean; regionActive: boolean }
export type DisplayState =
  | { state: 'live' | 'draft' | 'inactive' | 'expired' }
  | { state: 'waiting'; reason: 'starts-later' | 'outside-hours' | 'screens-off' }

export function displayState(a: DashboardAnnouncement, placements: Placement[], now: Date, timeZone?: string | null): DisplayState {
  if (!a.active) return { state: 'inactive' }
  if (new Date(a.endAt) < now) return { state: 'expired' }
  if (!placements.length) return { state: 'draft' }
  if (new Date(a.startAt) > now) return { state: 'waiting', reason: 'starts-later' }
  if (!isActiveNow({ active: true, startDate: null, endDate: null, startTime: a.startTime, endTime: a.endTime, daysOfWeek: a.daysOfWeek }, now, timeZone)) return { state: 'waiting', reason: 'outside-hours' }
  if (!placements.some(p => p.screenActive && p.regionActive)) return { state: 'waiting', reason: 'screens-off' }
  return { state: 'live' }
}

export const WAITING_REASON: Record<'starts-later' | 'outside-hours' | 'screens-off', string> = {
  'starts-later': 'תתחיל בתאריך ההתחלה',
  'outside-hours': 'מחוץ לימים או לשעות התצוגה שלה',
  'screens-off': 'המסכים או האזורים שלה כבויים',
}

/** "ללא תאריך סיום" for open-ended announcements, otherwise "עד <date>" in the school time zone. */
export function endLabel(endAt: Date | string, timeZone = 'Asia/Jerusalem'): string {
  if (isOpenEnded(endAt)) return 'ללא תאריך סיום'
  return `עד ${new Date(endAt).toLocaleDateString('he-IL', { timeZone })}`
}
