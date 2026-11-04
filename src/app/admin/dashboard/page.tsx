// src/app/admin/dashboard/page.tsx
import Link from 'next/link'
import { Monitor, Megaphone, ImageIcon, Plus, Edit, ExternalLink, Upload, MonitorPlay, FileClock } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { homeSchoolWhere } from '@/lib/schoolScope'
import { listScreenRegions } from '@/lib/announcementRegions'
import { displayState, endLabel, WAITING_REASON, type Placement, type DisplayState } from '@/lib/announcementDashboard'
import { Badge } from '@/components/ui/Display'

export default async function DashboardPage() {
  const user = await getCurrentUser()

  // SUPER_ADMIN with no school: show global stats. Any other user without a school sees nothing.
  const scope = homeSchoolWhere(user)
  const [screenCount, activeScreenCount, mediaCount, announcements, recentScreens, school] = await Promise.all([
    db.screen.count({ where: scope }),
    db.screen.count({ where: { ...scope, active: true } }),
    db.mediaFile.count({ where: scope }),
    db.announcement.findMany({
      where: scope,
      select: { id: true, schoolId: true, title: true, priority: true, active: true, startAt: true, endAt: true, startTime: true, endTime: true, daysOfWeek: true },
    }),
    db.screen.findMany({ where: scope, take: 4, orderBy: { updatedAt: 'desc' }, select: { id: true, name: true, slug: true, active: true } }),
    user?.schoolId ? db.school.findUnique({ where: { id: user.schoolId }, select: { timezone: true } }) : null,
  ])
  const timeZone = school?.timezone ?? 'Asia/Jerusalem'

  // Where each announcement is assigned, with the on/off state of the screen and the region.
  const screens = await listScreenRegions([...new Set(announcements.map(a => a.schoolId))])
  const placements = new Map<string, Placement[]>()
  const screenNames = new Map<string, Set<string>>()
  for (const s of screens) for (const r of s.regions) for (const id of r.announcementIds) {
    placements.set(id, [...(placements.get(id) ?? []), { screenActive: s.active, regionActive: r.active }])
    screenNames.set(id, (screenNames.get(id) ?? new Set()).add(s.name))
  }
  const now = new Date()
  const rows = announcements.map(a => ({ a, d: displayState(a, placements.get(a.id) ?? [], now, timeZone) }))
  const count = (state: DisplayState['state']) => rows.filter(r => r.d.state === state).length
  const liveCount = count('live'), draftCount = count('draft')
  // On the TVs now first, then the ones waiting for their time (earliest start first).
  const onScreens = rows.filter(r => r.d.state === 'live' || r.d.state === 'waiting')
    .sort((x, y) => (x.d.state === 'live' ? 0 : 1) - (y.d.state === 'live' ? 0 : 1) || +new Date(x.a.startAt) - +new Date(y.a.startAt))
    .slice(0, 5)

  return (
    <div className="max-w-5xl">
      <h1 className="mb-1 text-[22px] font-bold text-ui-ink">לוח בקרה</h1>
      <p className="mb-6 text-[13.5px] text-ui-muted">ברוכים הבאים, {user?.name}</p>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="מסכים" value={screenCount} hint={`${activeScreenCount} פעילים`} icon={Monitor} href="/admin/screens" />
        <StatCard label="מוצגות עכשיו" value={liveCount} hint="הודעות על המסכים כרגע" icon={Megaphone} href="/admin/announcements" />
        <StatCard label="טיוטות" value={draftCount} hint="לא משויכות לאף מסך" icon={FileClock} href="/admin/announcements?status=draft" />
        <StatCard label="קבצי מדיה" value={mediaCount} icon={ImageIcon} href="/admin/media" />
      </div>

      {/* Quick actions: all of them create or change content (EDITOR or higher), so viewers don't get them. */}
      {user?.role !== 'VIEWER' && <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-ui-ink-2">פעולות מהירות</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <QuickAction href="/admin/announcements/new" icon={<Megaphone className="h-5 w-5" />} label="הודעה חדשה" />
          <QuickAction href="/admin/media"             icon={<Upload className="h-5 w-5" />} label="העלאת מדיה" />
          <QuickAction href="/admin/screens/new"       icon={<MonitorPlay className="h-5 w-5" />} label="מסך חדש" />
          <QuickAction href="/admin/screens"           icon={<Edit className="h-5 w-5" />} label="עריכת מסכים" />
        </div>
      </section>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent screens: status only. Enabling/disabling and other management stay on the Screens page. */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ui-ink-2">מסכים אחרונים</h2>
            <Link href="/admin/screens" className="ui-focus text-xs text-ui-primary hover:underline">כל המסכים</Link>
          </div>
          <div className="space-y-2">
            {recentScreens.length === 0 && <EmptyState message="אין מסכים עדיין" href="/admin/screens/new" cta="יצירת מסך" />}
            {recentScreens.map(s => (
              <div key={s.id} className="flex items-center gap-3 rounded-ui border border-ui-border bg-ui-surface px-4 py-3">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-ui-sm bg-ui-primary-soft text-ui-primary">
                  <Monitor className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ui-ink">{s.name}</div>
                  <div className="text-xs text-ui-faint" dir="ltr">/screen/{s.slug}</div>
                </div>
                <Badge tone={s.active ? 'success' : 'neutral'} dot>{s.active ? 'פעיל' : 'מושבת'}</Badge>
                <div className="flex items-center gap-1">
                  {user?.role !== 'VIEWER' && <Link href={`/admin/editor?screen=${s.id}`} aria-label={`עריכת המסך ${s.name}`} title="עריכה"
                    className="ui-focus rounded-ui-sm p-1.5 text-ui-muted transition-colors hover:bg-ui-subtle hover:text-ui-ink">
                    <Edit className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>}
                  <Link href={`/screen/${s.slug}`} target="_blank" aria-label={`צפייה במסך ${s.name} (בלשונית חדשה)`} title="צפייה במסך"
                    className="ui-focus rounded-ui-sm p-1.5 text-ui-muted transition-colors hover:bg-ui-subtle hover:text-ui-ink">
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Announcements on the screens: shown now, or assigned and waiting for their time. */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ui-ink-2">הודעות על המסכים</h2>
            <Link href="/admin/announcements" className="ui-focus text-xs text-ui-primary hover:underline">כל ההודעות</Link>
          </div>
          <div className="space-y-2">
            {onScreens.length === 0 && <EmptyState message="אין הודעות שמשויכות למסכים" href="/admin/announcements/new" cta="יצירת הודעה" />}
            {onScreens.map(({ a, d }) => (
              <div key={a.id} className="flex items-start gap-3 rounded-ui border border-ui-border bg-ui-surface px-4 py-3">
                <div className="w-1 shrink-0 self-stretch rounded-full" aria-hidden="true"
                  style={{ background: a.priority === 'EMERGENCY' || a.priority === 'HIGH' ? '#ef4444' : a.priority === 'MEDIUM' ? '#f59e0b' : '#3b82f6' }} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ui-ink">{a.title}</div>
                  <div className="mt-0.5 text-xs text-ui-muted">
                    {[...(screenNames.get(a.id) ?? [])].join(' · ')} · {endLabel(a.endAt, timeZone)}
                  </div>
                  {d.state === 'waiting' && <div className="mt-0.5 text-xs text-ui-warning">{WAITING_REASON[d.reason]}</div>}
                </div>
                <Badge tone={d.state === 'live' ? 'success' : 'warning'} dot={d.state === 'live'}>{d.state === 'live' ? 'מוצגת עכשיו' : 'ממתינה'}</Badge>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

// ── Small components ────────────────────────────────────

function StatCard({ label, value, hint, icon: Icon, href }: {
  label: string; value: number; hint?: string; href: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <Link href={href} className="ui-focus block rounded-ui border border-ui-border bg-ui-surface p-4 transition-colors hover:border-ui-primary-line">
      <div className="mb-3 grid h-8 w-8 place-items-center rounded-ui-sm bg-ui-primary-soft text-ui-primary">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="text-2xl font-semibold tabular-nums text-ui-ink">{value}</div>
      <div className="mt-0.5 text-xs font-medium text-ui-ink-2">{label}</div>
      {hint && <div className="text-[11px] text-ui-muted">{hint}</div>}
    </Link>
  )
}

function QuickAction({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="ui-focus group flex flex-col items-center gap-2 rounded-ui-lg border border-ui-border bg-ui-surface px-3 py-4 shadow-ui transition-colors hover:border-ui-primary-line hover:bg-ui-primary-soft"
    >
      <span className="grid h-10 w-10 place-items-center rounded-ui bg-ui-primary-soft text-ui-primary">{icon}</span>
      <span className="text-center text-[13px] font-medium text-ui-ink-2 group-hover:text-ui-primary-ink">{label}</span>
    </Link>
  )
}

function EmptyState({ message, href, cta }: { message: string; href: string; cta: string }) {
  return (
    <div className="rounded-ui border border-dashed border-ui-border bg-ui-surface px-4 py-6 text-center">
      <p className="mb-2 text-sm text-ui-muted">{message}</p>
      <Link href={href} className="ui-focus inline-flex items-center gap-1 text-xs text-ui-primary hover:underline">
        <Plus className="h-3 w-3" aria-hidden="true" />{cta}
      </Link>
    </div>
  )
}
