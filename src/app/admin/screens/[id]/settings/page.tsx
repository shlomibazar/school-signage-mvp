import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { schoolWhere } from '@/lib/schoolScope'
import { loadSchedules } from '@/lib/screenScheduleStore'
import { PageHeader } from '@/components/ui/Display'
import ScreenSettingsView from '@/components/admin/settings/ScreenSettingsView'
import UnsavedLinkGuard from '@/components/admin/settings/UnsavedLinkGuard'

// Settings of one screen. The screen is looked up with the same school scope as the screen API
// (SUPER_ADMIN: any school; everyone else: their own), so another school's screen is a 404.
export default async function ScreenSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')
  const { id } = await params
  const screen = await db.screen.findFirst({
    where: { id, ...schoolWhere(user) },
    select: { id: true, name: true, slug: true, shortCode: true, orientation: true, width: true, height: true, active: true, refreshSecs: true, schoolId: true, school: { select: { name: true, timezone: true } } },
  })
  if (!screen) notFound()
  const schedule = (await loadSchedules([screen.id])).get(screen.id)!
  const canAdmin = user.role === 'SCHOOL_ADMIN' || user.role === 'SUPER_ADMIN'
  const canEditContent = user.role !== 'VIEWER'

  return (
    <UnsavedLinkGuard className="mx-auto w-full max-w-3xl">
      <nav aria-label="מיקום" className="mb-2 flex items-center gap-1 text-[13px] text-ui-muted">
        <Link href="/admin/screens" className="ui-focus rounded hover:text-ui-ink">מסכים</Link>
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        <span aria-current="page" className="truncate">{screen.name}</span>
      </nav>
      <PageHeader title="הגדרות מסך" />
      <ScreenSettingsView
        screen={{ id: screen.id, name: screen.name, slug: screen.slug, shortCode: screen.shortCode, orientation: screen.orientation, width: screen.width, height: screen.height, active: screen.active }}
        schedule={schedule} refreshSecs={screen.refreshSecs} timezone={screen.school.timezone}
        schoolName={user.role === 'SUPER_ADMIN' && screen.schoolId !== user.schoolId ? screen.school.name : undefined}
        canEditContent={canEditContent} canAdmin={canAdmin} />
    </UnsavedLinkGuard>
  )
}
