import type { ContentItem, Announcement } from '@/types'
import { zonedParts, clockMinutes, inDailyWindow } from '@/lib/zonedTime'

type Schedulable = { active: boolean; startDate: string|null; endDate: string|null; startTime: string|null; endTime: string|null; daysOfWeek: number[] }

/**
 * Is a scheduled item showing at `now`? Days and times are read in the school's time zone
 * (not the server's, which is UTC on Render). A time window may run past midnight
 * (22:00–06:00); its early-morning part belongs to the day it started on.
 *
 * Dates: content items pick a calendar day in the editor (stored as midnight UTC), so they are
 * compared as days and the end day is included (dates: 'day'). Announcements store real
 * moments (startAt/endAt) and are compared as instants (dates: 'instant').
 */
export function isActiveNow(item: Schedulable, now: Date, timeZone?: string | null, dates: 'day' | 'instant' = 'instant'): boolean {
  if (!item.active) return false
  const here = zonedParts(now, timeZone)
  if (dates === 'day') {
    if (item.startDate && here.date < item.startDate.slice(0, 10)) return false
    if (item.endDate && here.date > item.endDate.slice(0, 10)) return false
  } else {
    if (item.startDate && new Date(item.startDate) > now) return false
    if (item.endDate && new Date(item.endDate) < now) return false
  }
  const start = clockMinutes(item.startTime), end = clockMinutes(item.endTime)
  if (!inDailyWindow(here.minutes, start, end)) return false
  if (item.daysOfWeek?.length > 0) {
    const overnightMorning = start !== null && end !== null && start > end && here.minutes < end
    const day = overnightMorning ? (here.weekday + 6) % 7 : here.weekday
    if (!item.daysOfWeek.includes(day)) return false
  }
  return true
}

/**
 * The item a section shows now: the first one in schedule, or none. An item outside its
 * schedule is never shown as a fallback; the section is left empty instead.
 */
export function resolveActiveContent(items: ContentItem[], now: Date, timeZone?: string | null): ContentItem | null {
  return items.find(item => isActiveNow(item, now, timeZone, 'day')) ?? null
}

export function resolveEmergency(announcements: Announcement[], now: Date, timeZone?: string | null): Announcement | null {
  return announcements.find(a => a.isEmergency && isActiveNow({ active: a.active, startDate: a.startAt, endDate: a.endAt, startTime: a.startTime, endTime: a.endTime, daysOfWeek: a.daysOfWeek }, now, timeZone)) ?? null
}

export function getActiveAnnouncements(announcements: Announcement[], _screenId: string, now: Date, timeZone?: string | null): Announcement[] {
  return announcements.filter(a => !a.isEmergency && isActiveNow({ active: a.active, startDate: a.startAt, endDate: a.endAt, startTime: a.startTime, endTime: a.endTime, daysOfWeek: a.daysOfWeek }, now, timeZone))
}
