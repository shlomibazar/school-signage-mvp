// src/app/admin/screens/page.tsx
import Link from 'next/link'
import ScreenDeleteButton from '@/components/admin/ScreenDeleteButton'
import ScreenSnapshot from '@/components/admin/ScreenSnapshot'
import ShortLinkManager from '@/components/admin/ShortLinkManager'
import { Plus, Edit, ExternalLink, Monitor } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'

export default async function ScreensPage() {
  const user     = await getCurrentUser()
  const schoolId = user?.schoolId

  const screens = await db.screen.findMany({
    where:   schoolId ? { schoolId } : {},
    orderBy: { createdAt: 'asc' },
    include: {
      layout: { select: { mainSections: true, headerEnabled: true, footerEnabled: true, footerTicker: true, bgColor: true } },
      sections: { orderBy: { position: 'asc' }, include: { contentItems: { select: { contentType: true, active: true, textContent: true, settings: true, galleryId: true, bgColor: true }, orderBy: { createdAt: 'asc' } } } },
      _count: { select: { sections: true, announcements: true } },
    },
  })

  const media = schoolId ? await db.mediaFile.findMany({where:{schoolId,mediaType:'IMAGE',hidden:false},select:{id:true,url:true,galleryId:true},orderBy:{uploadedAt:'desc'}}) : []
  const announcements = schoolId ? await db.announcement.findMany({where:{schoolId,active:true},select:{id:true,title:true,body:true,priority:true,bgColor:true},orderBy:{createdAt:'desc'}}) : []
  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">מסכים</h1>
          <p className="text-sm text-gray-500 mt-0.5">{screens.length} מסכים סה״כ</p>
        </div>
        <Link
          href="/admin/screens/new"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          מסך חדש
        </Link>
      </div>

      {screens.length === 0 && (
        <div className="bg-white border border-gray-100 border-dashed rounded-2xl p-16 text-center">
          <Monitor className="w-10 h-10 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 mb-3">עדיין אין מסכים</p>
          <Link href="/admin/screens/new" className="text-sm text-blue-600 hover:underline">
            צור את המסך הראשון
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {screens.map(screen => (
          <div key={screen.id} className="bg-white border border-gray-100 rounded-2xl overflow-hidden hover:border-gray-200 transition-colors">
            <ScreenSnapshot screen={screen} media={media} announcements={announcements} />

            <div className="p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-semibold text-gray-800">{screen.name}</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${screen.active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {screen.active ? 'פעיל' : 'כבוי'}
                </span>
              </div>

              <div className="text-xs text-gray-400 space-y-1 mb-3">
                <div>{screen.orientation === 'LANDSCAPE' ? 'אופקי 16:9' : 'אנכי 9:16'} · {screen.width}×{screen.height}</div>
                <div className="text-blue-500">/screen/{screen.slug}</div>
              </div>

              <ShortLinkManager screenId={screen.id} initialCode={screen.shortCode} />
              <div className="flex items-center gap-2">
                <Link
                  href={`/admin/editor?screen=${screen.id}`}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Edit className="w-3.5 h-3.5" />
                  ערוך פריסה
                </Link>
                <Link
                  href={`/screen/${screen.slug}`}
                  target="_blank"
                  className="flex items-center gap-1.5 py-2 px-3 border border-gray-200 rounded-lg text-xs text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
                <ScreenDeleteButton id={screen.id} name={screen.name}/>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
