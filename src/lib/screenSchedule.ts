export type ScreenSchedule = {
  enabled: boolean
  startTime: string
  endTime: string
  days: number[] // 0=Sunday, 6=Saturday
  standbyMode: 'clock' | 'message' | 'logo'
}

export const DEFAULT_SCHEDULE: ScreenSchedule = {
  enabled: false, startTime: '07:00', endTime: '19:00', days: [0, 1, 2, 3, 4], standbyMode: 'logo',
}

// All scheduling calculations use the school's time zone, not the TV's clock zone.
export function isScreenInOperatingHours(schedule: ScreenSchedule, timezone: string, at: Date): boolean {
  if (!schedule.enabled) return true
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || 'Asia/Jerusalem', weekday: 'short', hour: '2-digit', minute: '2-digit',
      hour12: false, hourCycle: 'h23',
    }).formatToParts(at)
    const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'))
    const current = Number(get('hour')) % 24 * 60 + Number(get('minute'))
    const toMinutes = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5))
    const start = toMinutes(schedule.startTime), end = toMinutes(schedule.endTime)
    if (day < 0) return true // Fail open to content if device timezone data is unavailable.
    if (start === end) return schedule.days.includes(day) // Full-day on selected days.
    if (start < end) return schedule.days.includes(day) && current >= start && current < end
    // Overnight schedule: early morning belongs to the previous day's schedule.
    return (schedule.days.includes(day) && current >= start) ||
      (schedule.days.includes((day + 6) % 7) && current < end)
  } catch { return true }
}
