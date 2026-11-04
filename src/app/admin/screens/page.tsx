// src/app/admin/screens/page.tsx
import { Plus, Monitor } from 'lucide-react'
import ScreenSnapshot from '@/components/admin/ScreenSnapshot'
import ScreenCard from '@/components/admin/screens/ScreenCard'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { homeSchoolWhere } from '@/lib/schoolScope'
import { ButtonLink } from '@/components/ui/Button'
import { PageHeader, EmptyState } from '@/components/ui/Display'

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

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader title="מסכים"
        description={screens.length ? `${screens.length} מסכים · ${activeCount} פעילים` : undefined}
        actions={canEditContent && <ButtonLink href="/admin/screens/new" variant="primary" icon={<Plus className="h-4 w-4" aria-hidden="true" />}>מסך חדש</ButtonLink>} />

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
