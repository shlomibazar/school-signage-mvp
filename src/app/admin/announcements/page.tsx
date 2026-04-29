// src/app/admin/announcements/page.tsx
import Link from 'next/link'
import { Plus, Megaphone } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'

const PRIORITY_STYLE: Record<string, { label: string; bg: string; text: string; bar: string }> = {
  LOW:       { label: 'רגיל',   bg: 'bg-blue-50',   text: 'text-blue-700',  bar: '#3b82f6' },
  MEDIUM:    { label: 'בינוני', bg: 'bg-amber-50',  text: 'text-amber-700', bar: '#f59e0b' },
  HIGH:      { label: 'דחוף',   bg: 'bg-red-50',    text: 'text-red-700',   bar: '#ef4444' },
  EMERGENCY: { label: 'חירום',  bg: 'bg-red-100',   text: 'text-red-800',   bar: '#b91c1c' },
}

export default async function AnnouncementsPage() {
  const user     = await getCurrentUser()
  const schoolId = user?.schoolId

  const announcements = await db.announcement.findMany({
    where:   schoolId ? { schoolId } : {},
    orderBy: [{ priority: 'desc' }, { startAt: 'desc' }],
    include: { screens: { include: { screen: { select: { name: true } } } } },
  })

  const now = new Date()

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">הודעות</h1>
          <p className="text-sm text-gray-500 mt-0.5">{announcements.length} הודעות</p>
        </div>
        <Link
          href="/admin/announcements/new"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          הודעה חדשה
        </Link>
      </div>

      {announcements.length === 0 && (
        <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-16 text-center">
          <Megaphone className="w-10 h-10 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 mb-3">אין הודעות עדיין</p>
          <Link href="/admin/announcements/new" className="text-sm text-blue-600 hover:underline">
            צור הודעה ראשונה
          </Link>
        </div>
      )}

      <div className="space-y-2">
        {announcements.map(a => {
          const style    = PRIORITY_STYLE[a.priority] ?? PRIORITY_STYLE.LOW
          const isActive = a.active && new Date(a.startAt) <= now && new Date(a.endAt) >= now
          const screenNames = a.screens.map(s => s.screen.name).join(', ')

          return (
            <div key={a.id} className="bg-white border border-gray-100 rounded-xl flex overflow-hidden hover:border-gray-200 transition-colors">
              {/* Priority bar */}
              <div className="w-1 shrink-0" style={{ background: style.bar }} />

              <div className="flex-1 px-4 py-3 min-w-0">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-800 text-sm">{a.title}</span>
                      {a.isEmergency && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-600 text-white font-medium">חירום</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{a.body}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                      <span>
                        {new Date(a.startAt).toLocaleDateString('he-IL')} –{' '}
                        {new Date(a.endAt).toLocaleDateString('he-IL')}
                      </span>
                      {screenNames && <span>📺 {screenNames}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${style.bg} ${style.text} font-medium`}>
                      {style.label}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {isActive ? 'פעיל' : 'לא פעיל'}
                    </span>
                    <Link
                      href={`/admin/announcements/${a.id}/edit`}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      ערוך
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
