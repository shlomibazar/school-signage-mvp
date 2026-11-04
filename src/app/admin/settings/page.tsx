import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft, Clock, RefreshCw, Monitor } from 'lucide-react'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { schoolWhere } from '@/lib/schoolScope'
import { loadSchedules } from '@/lib/screenScheduleStore'
import { refreshLabel, scheduleSummary } from '@/lib/screenSettings'
import { PageHeader, Badge, EmptyState } from '@/components/ui/Display'
import { Card, CardHeader } from '@/components/ui/Card'
import SchoolProfileForm from '@/components/admin/settings/SchoolProfileForm'
import UnsavedLinkGuard from '@/components/admin/settings/UnsavedLinkGuard'

// Settings: the school's shared details (logo, weather city) and a short list of the screens,
// each linking to its own settings page. Layout and content stay in the screen editor.
export default async function SettingsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')
  const school = user.schoolId
    ? await db.school.findUnique({ where: { id: user.schoolId }, select: { id: true, name: true, logoUrl: true, weatherCity: true } })
    : null
  const screens = await db.screen.findMany({
    // Same scope as before: SUPER_ADMIN sees every school's screens, everyone else their own.
    where: schoolWhere(user), orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, active: true, refreshSecs: true, schoolId: true, school: { select: { name: true } } },
  })
  const schedules = await loadSchedules(screens.map(s => s.id))
  // Logo and weather city: EDITOR and up (as in /api/schools/[id]/logo and /weather-city).
  const canEditSchool = user.role !== 'VIEWER'

  return (
    <UnsavedLinkGuard className="mx-auto w-full max-w-3xl">
      <PageHeader title="הגדרות" description="פרטי בית הספר והגדרות המסכים. הפריסה והתוכן נערכים בעורך." />
      <div className="grid gap-6">
        {school
          ? <SchoolProfileForm school={school} canEdit={canEditSchool} />
          : <Card className="p-5 text-sm text-ui-muted">המשתמש אינו משויך לבית ספר, ולכן אין פרטי בית ספר לעריכה.</Card>}

        <Card id="screens" className="scroll-mt-20">
          <CardHeader title="הגדרות מסכים" description="שעות פעילות, רענון וחיבור טלוויזיה — לכל מסך בנפרד" />
          {screens.length === 0
            ? <EmptyState icon={<Monitor className="h-6 w-6" />} title="עדיין אין מסכים" />
            : <ul className="divide-y divide-ui-border">
              {screens.map(s => {
                const schedule = schedules.get(s.id)!
                return (
                  <li key={s.id}>
                    <Link href={`/admin/screens/${s.id}/settings`} aria-label={`הגדרות המסך ${s.name}`}
                      className="ui-focus group flex min-h-16 items-center gap-3 px-5 py-3 hover:bg-ui-subtle">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-ui-ink">{s.name}</span>
                          <Badge tone={s.active ? 'success' : 'neutral'} dot>{s.active ? 'פעיל' : 'מושבת'}</Badge>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-ui-muted">
                          <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden="true" />{scheduleSummary(schedule)}</span>
                          {s.schoolId !== user.schoolId && <span>{s.school.name}</span>}
                          <span className="inline-flex items-center gap-1"><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />רענון {refreshLabel(s.refreshSecs)}</span>
                        </div>
                      </div>
                      <ChevronLeft className="h-5 w-5 shrink-0 text-ui-faint group-hover:text-ui-ink-2" aria-hidden="true" />
                    </Link>
                  </li>
                )
              })}
            </ul>}
        </Card>
      </div>
    </UnsavedLinkGuard>
  )
}
