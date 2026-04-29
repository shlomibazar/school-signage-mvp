// src/app/admin/dashboard/page.tsx
import Link from 'next/link'
import { Monitor, Megaphone, ImageIcon, Plus, Edit, ExternalLink } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'

export default async function DashboardPage() {
  const user = await getCurrentUser()
  const schoolId = user?.schoolId

  // SUPER_ADMIN with no school: show global stats
  const [screenCount, activeScreenCount, announcementCount, mediaCount] = await Promise.all([
    db.screen.count({ where: schoolId ? { schoolId } : {} }),
    db.screen.count({ where: schoolId ? { schoolId, active: true } : { active: true } }),
    db.announcement.count({ where: schoolId ? { schoolId } : {} }),
    db.mediaFile.count({ where: schoolId ? { schoolId } : {} }),
  ])

  const recentScreens = await db.screen.findMany({
    where:   schoolId ? { schoolId } : {},
    take:    4,
    orderBy: { updatedAt: 'desc' },
    include: { layout: { select: { mainSections: true, headerEnabled: true, footerEnabled: true } } },
  })

  const now = new Date()
  const upcomingAnnouncements = await db.announcement.findMany({
    where: {
      ...(schoolId ? { schoolId } : {}),
      endAt:  { gte: now },
      active: true,
    },
    take:    5,
    orderBy: { startAt: 'asc' },
  })

  return (
    <div className="max-w-5xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-1">לוח בקרה</h1>
      <p className="text-sm text-gray-500 mb-6">ברוכים הבאים, {user?.name}</p>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <StatCard label="סך מסכים"       value={screenCount}        icon={Monitor}    color="blue" />
        <StatCard label="מסכים פעילים"   value={activeScreenCount}  icon={Monitor}    color="green" />
        <StatCard label="הודעות פעילות"  value={announcementCount}  icon={Megaphone}  color="amber" />
        <StatCard label="קבצי מדיה"      value={mediaCount}         icon={ImageIcon}  color="purple" />
      </div>

      {/* Quick actions */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">פעולות מהירות</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <QuickAction href="/admin/announcements/new" icon="📢" label="הודעה חדשה" />
          <QuickAction href="/admin/media"             icon="🖼" label="העלאת מדיה" />
          <QuickAction href="/admin/screens/new"       icon="📺" label="מסך חדש"    />
          <QuickAction href="/admin/screens"           icon="✏️" label="עריכת מסכים" />
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent screens */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">מסכים אחרונים</h2>
            <Link href="/admin/screens" className="text-xs text-blue-600 hover:underline">הכל</Link>
          </div>
          <div className="space-y-2">
            {recentScreens.length === 0 && (
              <EmptyState message="אין מסכים עדיין" href="/admin/screens/new" cta="צור מסך" />
            )}
            {recentScreens.map(s => (
              <div key={s.id} className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-4 py-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                  <Monitor className="w-4 h-4 text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{s.name}</div>
                  <div className="text-xs text-gray-400">/screen/{s.slug}</div>
                </div>
                <div className={`text-xs px-2 py-0.5 rounded-full ${s.active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {s.active ? 'פעיל' : 'כבוי'}
                </div>
                <div className="flex items-center gap-1">
                  <Link href={`/admin/editor?screen=${s.id}`}
                    className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
                    <Edit className="w-3.5 h-3.5" />
                  </Link>
                  <Link href={`/screen/${s.slug}`} target="_blank"
                    className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Upcoming announcements */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">הודעות פעילות</h2>
            <Link href="/admin/announcements" className="text-xs text-blue-600 hover:underline">הכל</Link>
          </div>
          <div className="space-y-2">
            {upcomingAnnouncements.length === 0 && (
              <EmptyState message="אין הודעות פעילות" href="/admin/announcements/new" cta="צור הודעה" />
            )}
            {upcomingAnnouncements.map(a => (
              <div key={a.id} className="flex items-start gap-3 bg-white border border-gray-100 rounded-xl px-4 py-3">
                <div
                  className="w-1 rounded-full self-stretch shrink-0"
                  style={{
                    background: a.priority === 'EMERGENCY' || a.priority === 'HIGH'
                      ? '#ef4444'
                      : a.priority === 'MEDIUM' ? '#f59e0b' : '#3b82f6',
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{a.title}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    עד {new Date(a.endAt).toLocaleDateString('he-IL')}
                  </div>
                </div>
                <PriorityBadge priority={a.priority} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

// ── Small components ────────────────────────────────────

function StatCard({
  label, value, icon: Icon, color,
}: {
  label: string; value: number
  icon: React.ComponentType<{ className?: string }>
  color: 'blue' | 'green' | 'amber' | 'purple'
}) {
  const colors = {
    blue:   'bg-blue-50 text-blue-600',
    green:  'bg-green-50 text-green-600',
    amber:  'bg-amber-50 text-amber-600',
    purple: 'bg-purple-50 text-purple-600',
  }
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4">
      <div className={`w-8 h-8 rounded-lg ${colors[color]} flex items-center justify-center mb-3`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="text-2xl font-semibold text-gray-900 tabular-nums">{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  )
}

function QuickAction({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-2 bg-white border border-gray-100 rounded-xl py-4 px-3 hover:border-blue-200 hover:bg-blue-50/30 transition-colors group"
    >
      <span className="text-2xl">{icon}</span>
      <span className="text-xs text-gray-600 group-hover:text-blue-700 text-center">{label}</span>
    </Link>
  )
}

function EmptyState({ message, href, cta }: { message: string; href: string; cta: string }) {
  return (
    <div className="bg-white border border-gray-100 border-dashed rounded-xl px-4 py-6 text-center">
      <p className="text-sm text-gray-400 mb-2">{message}</p>
      <Link href={href} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
        <Plus className="w-3 h-3" />{cta}
      </Link>
    </div>
  )
}

const PRIORITY_LABELS: Record<string, { label: string; className: string }> = {
  LOW:       { label: 'רגיל',  className: 'bg-blue-50 text-blue-700' },
  MEDIUM:    { label: 'בינוני', className: 'bg-amber-50 text-amber-700' },
  HIGH:      { label: 'דחוף',  className: 'bg-red-50 text-red-700' },
  EMERGENCY: { label: 'חירום', className: 'bg-red-100 text-red-800' },
}
function PriorityBadge({ priority }: { priority: string }) {
  const p = PRIORITY_LABELS[priority] ?? PRIORITY_LABELS.LOW
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${p.className}`}>
      {p.label}
    </span>
  )
}
