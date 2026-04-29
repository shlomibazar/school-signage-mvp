// src/lib/scheduling.ts
// Content scheduling engine — determines what to display at any moment

import type { ContentItem, Announcement } from '@/types'

interface SchedulableItem {
  startDate?: string | null
  endDate?: string | null
  startTime?: string | null
  endTime?: string | null
  daysOfWeek: number[]
  active?: boolean
}

/**
 * Check if an item is currently active based on date range, time range,
 * and days-of-week settings.  Empty daysOfWeek = all days.
 */
export function isActiveNow(item: SchedulableItem, now: Date = new Date()): boolean {
  if (item.active === false) return false

  const today = now.getDay() // 0 = Sunday

  if (item.daysOfWeek.length > 0 && !item.daysOfWeek.includes(today)) {
    return false
  }

  if (item.startDate) {
    const start = new Date(item.startDate)
    start.setHours(0, 0, 0, 0)
    if (now < start) return false
  }
  if (item.endDate) {
    const end = new Date(item.endDate)
    end.setHours(23, 59, 59, 999)
    if (now > end) return false
  }

  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
  if (item.startTime && currentTime < item.startTime) return false
  if (item.endTime   && currentTime > item.endTime)   return false

  return true
}

/**
 * From a list of content items in a section, pick the one to display now.
 * Higher priority wins.  Equal priority → round-robin by time slot.
 */
export function resolveActiveContent(
  items: ContentItem[],
  rotationIntervalSecs = 10,
  now: Date = new Date(),
): ContentItem | null {
  const active = items
    .filter(item => isActiveNow(item, now))
    .sort((a, b) => b.priority - a.priority)

  if (active.length === 0) return null
  if (active.length === 1) return active[0]

  const topPriority = active[0].priority
  const topItems = active.filter(i => i.priority === topPriority)

  if (topItems.length === 1) return topItems[0]

  const slotIndex = Math.floor(now.getTime() / (rotationIntervalSecs * 1000))
  return topItems[slotIndex % topItems.length]
}

/**
 * Find the active emergency announcement (if any).
 * Bug fix: Announcement uses startAt/endAt, not startDate/endDate.
 */
export function resolveEmergency(
  announcements: Announcement[],
  now: Date = new Date(),
): Announcement | null {
  const emergencies = announcements.filter(a =>
    a.isEmergency &&
    isActiveNow({
      startDate:  a.startAt,   // ← fixed field name
      endDate:    a.endAt,     // ← fixed field name
      startTime:  a.startTime,
      endTime:    a.endTime,
      daysOfWeek: a.daysOfWeek,
      active:     a.active,
    }, now)
  )

  if (emergencies.length === 0) return null

  const priorityOrder: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, EMERGENCY: 3 }
  return emergencies.sort(
    (a, b) => priorityOrder[b.priority] - priorityOrder[a.priority],
  )[0]
}

/**
 * Filter announcements currently active for a specific screen.
 * Bug fix: use startAt/endAt consistently.
 */
export function getActiveAnnouncements(
  announcements: Announcement[],
  screenId: string,
  now: Date = new Date(),
): Announcement[] {
  return announcements.filter(a => {
    const active = isActiveNow({
      startDate:  a.startAt,
      endDate:    a.endAt,
      startTime:  a.startTime,
      endTime:    a.endTime,
      daysOfWeek: a.daysOfWeek,
      active:     a.active,
    }, now)

    if (!active) return false
    if (!a.screens?.length) return true  // broadcast to all screens
    return a.screens.some(s => s.screenId === screenId)
  })
}
