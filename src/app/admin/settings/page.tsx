import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ScreenRefreshSettings from '@/components/admin/ScreenRefreshSettings'
import ScreenOperatingSettings from '@/components/admin/ScreenOperatingSettings'
import SettingsAccordion from '@/components/admin/SettingsAccordion'
import { DEFAULT_SCHEDULE, type ScreenSchedule } from '@/lib/screenSchedule'

type ScheduleRow = { screenId: string; enabled: boolean; startTime: string; endTime: string; days: number[]; standbyMode: string }

export default async function SettingsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')
  const where = user.role === 'SUPER_ADMIN' ? {} : { schoolId: user.schoolId ?? '__none__' }
  const screens = await db.screen.findMany({ where, select: { id: true, name: true, school: { select: { name: true } }, refreshSecs: true }, orderBy: { name: 'asc' } })
  // The migration must be applied before deploying this page.
  const schedules = await db.$queryRaw<ScheduleRow[]>`
    SELECT "screenId", "enabled", "startTime", "endTime", "days", "standbyMode"
    FROM "ScreenOperatingSchedule"
    WHERE "screenId" IN (SELECT id FROM "screens")
  `
  const byId = new Map(schedules.map(s => [s.screenId, s]))
  const screenSchedules = screens.map(s => {
    const stored = byId.get(s.id)
    const schedule: ScreenSchedule = stored ? {
      enabled: stored.enabled, startTime: stored.startTime, endTime: stored.endTime,
      days: stored.days, standbyMode: ['clock', 'message', 'logo'].includes(stored.standbyMode) ? stored.standbyMode as ScreenSchedule['standbyMode'] : 'logo',
    } : { ...DEFAULT_SCHEDULE }
    return { id: s.id, name: s.name, school: s.school, schedule }
  })
  const canEdit = user.role === 'SUPER_ADMIN' || user.role === 'SCHOOL_ADMIN'
  return <div dir="rtl" className="max-w-4xl space-y-5">
    <div><h1 className="text-xl font-semibold text-gray-900">הגדרות</h1><p className="text-sm text-gray-500 mt-1">הגדרות תפעול, ללא כפילות עם עורך הפריסה.</p></div>
    <SettingsAccordion sections={[
      { id: 'hours', title: 'שעות פעילות', description: 'תזמון מסכים ותצוגת ״נתראה בקרוב״', content: <ScreenOperatingSettings screens={screenSchedules} canEdit={canEdit}/> },
      { id: 'refresh', title: 'רענון תוכן', description: 'כל 5, 10 או 15 דקות — לכל מסך בנפרד', content: <ScreenRefreshSettings screens={screens} canEdit={canEdit}/> },
    ]}/>
  </div>
}
