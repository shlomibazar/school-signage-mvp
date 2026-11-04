import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { DEFAULT_SCHEDULE, type ScreenSchedule } from '@/lib/screenSchedule'

type ScheduleRow = { screenId: string; enabled: boolean; startTime: string; endTime: string; days: number[]; standbyMode: string }

/** The operating schedules of the given screens (callers pass only screens the user may see).
 *  A screen without a stored schedule gets the default, as before. */
export async function loadSchedules(screenIds: string[]): Promise<Map<string, ScreenSchedule>> {
  const rows = screenIds.length ? await db.$queryRaw<ScheduleRow[]>`
    SELECT "screenId", "enabled", "startTime", "endTime", "days", "standbyMode"
    FROM "ScreenOperatingSchedule"
    WHERE "screenId" IN (${Prisma.join(screenIds)})
  ` : []
  const byId = new Map(rows.map(r => [r.screenId, r]))
  return new Map(screenIds.map(id => {
    const stored = byId.get(id)
    const schedule: ScreenSchedule = stored ? {
      enabled: stored.enabled, startTime: stored.startTime, endTime: stored.endTime, days: stored.days,
      standbyMode: ['clock', 'message', 'logo'].includes(stored.standbyMode) ? stored.standbyMode as ScreenSchedule['standbyMode'] : 'logo',
    } : { ...DEFAULT_SCHEDULE }
    return [id, schedule]
  }))
}
