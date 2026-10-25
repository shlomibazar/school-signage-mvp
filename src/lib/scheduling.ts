import type { ContentItem, Announcement } from '@/types'

export function isActiveNow(item: { active: boolean; startDate: string|null; endDate: string|null; startTime: string|null; endTime: string|null; daysOfWeek: number[] }, now: Date): boolean {
  if (!item.active) return false
  if (item.startDate && new Date(item.startDate) > now) return false
  if (item.endDate   && new Date(item.endDate)   < now) return false
  if (item.daysOfWeek?.length > 0 && !item.daysOfWeek.includes(now.getDay())) return false
  if (item.startTime || item.endTime) {
    const cur = now.getHours() * 60 + now.getMinutes()
    if (item.startTime) { const [h,m] = item.startTime.split(':').map(Number); if (cur < h*60+m) return false }
    if (item.endTime)   { const [h,m] = item.endTime.split(':').map(Number);   if (cur > h*60+m) return false }
  }
  return true
}

export function resolveActiveContent(items: ContentItem[], _refreshSecs: number, now: Date): ContentItem | null {
  return items.find(item => isActiveNow(item, now)) ?? items[0] ?? null
}

export function resolveEmergency(announcements: Announcement[], now: Date): Announcement | null {
  return announcements.find(a => a.isEmergency && isActiveNow({ active: a.active, startDate: a.startAt, endDate: a.endAt, startTime: a.startTime, endTime: a.endTime, daysOfWeek: a.daysOfWeek }, now)) ?? null
}

export function getActiveAnnouncements(announcements: Announcement[], _screenId: string, now: Date): Announcement[] {
  return announcements.filter(a => !a.isEmergency && isActiveNow({ active: a.active, startDate: a.startAt, endDate: a.endAt, startTime: a.startTime, endTime: a.endTime, daysOfWeek: a.daysOfWeek }, now))
}
