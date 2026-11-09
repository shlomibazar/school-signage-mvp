// src/app/admin/screens/page.tsx
import { Plus, Monitor } from 'lucide-react'
import ScreenSnapshot from '@/components/admin/ScreenSnapshot'
import ScreenCard from '@/components/admin/screens/ScreenCard'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { homeSchoolWhere } from '@/lib/schoolScope'
import { ButtonLink } from '@/components/ui/Button'
import { PageHeader, EmptyState } from '@/components/ui/Display'
import ConnectionRefresh from '@/components/admin/screens/ConnectionRefresh'
import { connectionStatus, relativeTimeHe } from '@/lib/screenConnection'

export default async function ScreensPage() {
  const user     = await getCurrentUser()
  const schoolId = user?.schoolId
  // Disable/enable, delete, pairing codes and screen settings: SCHOOL_ADMIN and up (as in the API).
  const canAdmin = user?.role === 'SCHOOL_ADMIN' || user?.role === 'SUPER_ADMIN'
  // Editing layouts, creating screens and short links: EDITOR and up (as in the API).
  const canEditContent = !!user && user.role !== 'VIEWER'

  const screens = await db.screen.findMany({
    // SUPER_ADMIN without a school sees all screens; any other user without a school sees none.
    where:   homeSchoolWhere(user),
    orderBy: { createdAt: 'asc' },
    include: {
      layout: { select: { mainSections: true, headerEnabled: true, footerEnabled: true, footerTicker: true, bgColor: true } },
      sections: { orderBy: { position: 'asc' }, include: { contentItems: { select: { contentType: true, active: true, textContent: true, settings: true, galleryId: true, bgColor: true }, orderBy: { createdAt: 'asc' } } } },
    },
  })
  // Only needed for the schematic preview of screens that have no snapshot yet.
  const needSchematic = screens.some(s => !s.snapshotUrl)
  const media = schoolId && needSchematic ? await db.mediaFile.findMany({where:{schoolId,mediaType:'IMAGE',mimeType:{startsWith:'image/'},hidden:false},select:{id:true,url:true,galleryId:true},orderBy:{uploadedAt:'desc'}}) : []
  const announcements = schoolId && needSchematic ? await db.announcement.findMany({where:{schoolId,active:true},select:{id:true,title:true,body:true,priority:true,bgColor:true},orderBy:{createdAt:'desc'}}) : []
  const activeCount = screens.filter(s => s.active).length
  // Connection status ("מצב חיבור"), computed now from the last heartbeat (Screen.lastSeenAt,
  // server time), already loaded with the screens above (same school scope).
  const now = new Date()
  const lastSeen = new Map(screens.map(s => [s.id, s.lastSeenAt]))
  const fmt = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' })
  const connection = (id: string) => {
    const seen = lastSeen.get(id) ?? null
    return { status: connectionStatus(seen, now), relative: seen ? relativeTimeHe(seen, now) : null, exact: seen ? fmt.format(seen) : null }
  }
  // Counted among active screens only (an inactive screen is not expected to report).
  const activeStatuses = screens.filter(s => s.active).map(s => connection(s.id).status)
  const connectedCount = activeStatuses.filter(s => s === 'connected').length
  const disconnectedCount = activeStatuses.filter(s => s === 'disconnected').length
  const checkedAt = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false }).format(now)

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader title="מסכים"
        description={screens.length ? `${screens.length} מסכים · ${activeCount} פעילים · ${connectedCount} מחוברים · ${disconnectedCount} לא מחוברים` : undefined}
        actions={<>
          {screens.length > 0 && <ConnectionRefresh checkedAt={checkedAt} />}
          {canEditContent && <ButtonLink href="/admin/screens/new" variant="primary" icon={<Plus className="h-4 w-4" aria-hidden="true" />}>מסך חדש</ButtonLink>}
        </>} />

      {screens.length === 0 ? (
        <div className="rounded-ui-lg border border-dashed border-ui-border bg-ui-surface">
          <EmptyState icon={<Monitor className="h-6 w-6" />} title="עדיין אין מסכים"
            description="מסך הוא מה שהטלוויזיה מציגה: פריסה, תוכן ועיצוב."
            action={canEditContent && <ButtonLink href="/admin/screens/new" variant="primary" icon={<Plus className="h-4 w-4" aria-hidden="true" />}>יצירת המסך הראשון</ButtonLink>} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {screens.map(screen => (
            <ScreenCard key={screen.id} canEditContent={canEditContent} canAdmin={canAdmin}
              connection={connection(screen.id)}
              screen={{
                id: screen.id, name: screen.name, slug: screen.slug, orientation: screen.orientation,
                width: screen.width, height: screen.height, active: screen.active, shortCode: screen.shortCode,
                snapshotUrl: screen.snapshotUrl, snapshotAt: screen.snapshotAt?.toISOString() ?? null,
              }}
              fallback={screen.snapshotUrl ? null : <ScreenSnapshot screen={screen} media={media} announcements={announcements} />} />
          ))}
        </div>
      )}
    </div>
  )
}
