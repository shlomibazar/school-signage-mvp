// src/app/admin/announcements/page.tsx
import Link from 'next/link'
import { Suspense } from 'react'
import { Plus, Megaphone, Pencil } from 'lucide-react'
import AnnouncementDeleteButton from '@/components/admin/AnnouncementDeleteButton'
import AnnouncementFilters from '@/components/admin/announcements/AnnouncementFilters'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { homeSchoolWhere } from '@/lib/schoolScope'
import { listScreenRegions, displayedIn } from '@/lib/announcementRegions'
import { announcementStatus, isOpenEnded, STATUS_LABEL, type AnnouncementStatus } from '@/lib/announcementStatus'
import { ButtonLink, buttonClass } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import HelpButton from '@/components/admin/help/HelpButton'
import { PageHeader, Badge, EmptyState, Table, Th, Td, type BadgeTone } from '@/components/ui/Display'

const PRIORITY: Record<string, { label: string; dot: string }> = {
  LOW: { label: 'רגיל', dot: 'bg-slate-300' },
  MEDIUM: { label: 'בינוני', dot: 'bg-amber-500' },
  HIGH: { label: 'דחוף', dot: 'bg-red-500' },
  EMERGENCY: { label: 'חירום', dot: 'bg-red-700' },
}
const STATUS_TONE: Record<AnnouncementStatus, BadgeTone> = { live: 'success', scheduled: 'primary', draft: 'neutral', inactive: 'neutral', expired: 'warning' }
const STATUS_ORDER: AnnouncementStatus[] = ['live', 'scheduled', 'draft', 'inactive', 'expired']
const date = (d: Date) => d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: '2-digit', timeZone: 'Asia/Jerusalem' })
const plain = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()

function ScreenChips({ shownOn }: { shownOn: string[] }) {
  if (!shownOn.length) return <span className="text-xs text-ui-faint">לא משויכת למסך</span>
  return <div className="flex flex-wrap gap-1">{shownOn.map(s => <span key={s} title={s} className="max-w-[220px] truncate whitespace-nowrap rounded-ui-sm bg-ui-subtle px-2 py-0.5 text-xs text-ui-ink-2">{s}</span>)}</div>
}

type Props ={ searchParams: Promise<{ status?: string; screen?: string }> }

export default async function AnnouncementsPage({ searchParams }: Props) {
  const { status: statusFilter, screen: screenFilter } = await searchParams
  const user = await getCurrentUser()
  const announcements = await db.announcement.findMany({
    where: homeSchoolWhere(user),
    orderBy: [{ updatedAt: 'desc' }],
  })
  const schoolIds = [...new Set(announcements.map(a => a.schoolId).filter((x): x is string => !!x))]
  if (user?.schoolId && !schoolIds.includes(user.schoolId)) schoolIds.push(user.schoolId)
  const screens = await listScreenRegions(schoolIds)
  const shown = displayedIn(screens)
  const now = new Date()
  // Creating, editing and deleting announcements needs EDITOR or higher (as in the API).
  const canEdit = !!user && user.role !== 'VIEWER'

  const rows = announcements.map(a => {
    const places = shown.get(a.id) ?? []
    return { a, places, status: announcementStatus(a, places.length > 0, now) }
  })
  const counts = new Map<AnnouncementStatus, number>()
  for (const r of rows) counts.set(r.status, (counts.get(r.status) ?? 0) + 1)
  const visible = rows.filter(r =>
    (!statusFilter || r.status === statusFilter) &&
    (!screenFilter || r.places.some(p => p.screenId === screenFilter)))

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader title="הודעות" description="כאן יוצרים הודעה, בוחרים מתי ואיפה היא מוצגת ומפרסמים."
        actions={<><HelpButton topic="announcements" />{canEdit && <ButtonLink href="/admin/announcements/new" variant="primary" icon={<Plus className="h-4 w-4" />}>הודעה חדשה</ButtonLink>}</>} />

      <Card className="overflow-hidden">
        {announcements.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ui-border px-4 py-3">
            <Suspense><AnnouncementFilters
              screens={screens.filter(s => s.regions.length > 0).map(s => ({ id: s.id, name: s.name }))}
              statuses={STATUS_ORDER.filter(s => counts.get(s)).map(s => ({ id: s, label: STATUS_LABEL[s], count: counts.get(s) ?? 0 }))} /></Suspense>
            <span className="text-xs text-ui-muted">{visible.length === rows.length ? `${rows.length} הודעות` : `${visible.length} מתוך ${rows.length} הודעות`}</span>
          </div>
        )}

        {announcements.length === 0 ? (
          <EmptyState icon={<Megaphone className="h-6 w-6" />} title="אין עדיין הודעות"
            description="הודעה חדשה נכתבת כאן, ובאותו מקום בוחרים באילו מסכים להציג אותה."
            action={canEdit && <ButtonLink href="/admin/announcements/new" variant="primary" icon={<Plus className="h-4 w-4" />}>יצירת הודעה ראשונה</ButtonLink>} />
        ) : visible.length === 0 ? (
          <EmptyState title="אין הודעות שמתאימות לסינון" action={<ButtonLink href="/admin/announcements" size="sm">ניקוי הסינון</ButtonLink>} />
        ) : (<>
          {/* Narrow screens: one card per announcement. */}
          <ul className="divide-y divide-ui-border md:hidden">
            {visible.map(({ a, places, status }) => {
              const p = PRIORITY[a.priority] ?? PRIORITY.LOW
              const shownOn = places.map(x => x.regionsOnScreen > 1 ? `${x.screenName} · ${x.regionTitle}` : x.screenName)
              return (
                <li key={a.id} className="grid gap-2 px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2">
                      <span title={`עדיפות: ${p.label}`} className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${p.dot}`} />
                      {canEdit ? <Link href={`/admin/announcements/${a.id}/edit`} className="font-semibold text-ui-ink hover:text-ui-primary">{a.title}</Link> : <span className="font-semibold text-ui-ink">{a.title}</span>}
                    </div>
                    <Badge tone={STATUS_TONE[status]} dot={status === 'live'}>{STATUS_LABEL[status]}</Badge>
                  </div>
                  <ScreenChips shownOn={shownOn} />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-ui-ink-2">{isOpenEnded(a.endAt) ? <>מ-{date(a.startAt)} · <span className="text-ui-muted">ללא סיום</span></> : <>{date(a.startAt)} – {date(a.endAt)}</>}</span>
                    {canEdit && <div className="inline-flex items-center gap-1">
                      <Link href={`/admin/announcements/${a.id}/edit`} className={buttonClass('ghost', 'sm')}><Pencil className="h-4 w-4" />עריכה</Link>
                      <AnnouncementDeleteButton id={a.id} title={a.title} shownOn={shownOn} />
                    </div>}
                  </div>
                </li>
              )
            })}
          </ul>
          <Table className="hidden md:block">
            <thead><tr>
              <Th>הודעה</Th><Th>מוצגת ב</Th><Th className="whitespace-nowrap">מתי</Th><Th>מצב</Th>{canEdit && <Th><span className="sr-only">פעולות</span></Th>}
            </tr></thead>
            <tbody>
              {visible.map(({ a, places, status }) => {
                const p = PRIORITY[a.priority] ?? PRIORITY.LOW
                const shownOn = places.map(x => x.regionsOnScreen > 1 ? `${x.screenName} · ${x.regionTitle}` : x.screenName)
                const text = plain(a.body)
                return (
                  <tr key={a.id} className="hover:bg-ui-subtle/60">
                    <Td className="min-w-[220px]">
                      <div className="flex items-start gap-2">
                        <span title={`עדיפות: ${p.label}`} className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${p.dot}`} />
                        <div className="min-w-0">
                          {canEdit ? <Link href={`/admin/announcements/${a.id}/edit`} className="font-semibold text-ui-ink hover:text-ui-primary">{a.title}</Link> : <span className="font-semibold text-ui-ink">{a.title}</span>}
                          {a.priority !== 'LOW' && <span className="ms-2 text-xs text-ui-muted">{p.label}</span>}
                          {text && <p className="mt-0.5 line-clamp-1 text-xs text-ui-muted">{text}</p>}
                        </div>
                      </div>
                    </Td>
                    <Td className="min-w-[180px]">
                      <ScreenChips shownOn={shownOn} />
                    </Td>
                    <Td className="whitespace-nowrap text-xs text-ui-ink-2">
                      {isOpenEnded(a.endAt) ? <>מ-{date(a.startAt)} · <span className="text-ui-muted">ללא סיום</span></> : <>{date(a.startAt)} – {date(a.endAt)}</>}
                    </Td>
                    <Td><Badge tone={STATUS_TONE[status]} dot={status === 'live'}>{STATUS_LABEL[status]}</Badge></Td>
                    {canEdit && <Td className="whitespace-nowrap text-end">
                      <div className="inline-flex items-center gap-1">
                        <Link href={`/admin/announcements/${a.id}/edit`} className={buttonClass('ghost', 'sm')}><Pencil className="h-4 w-4" />עריכה</Link>
                        <AnnouncementDeleteButton id={a.id} title={a.title} shownOn={shownOn} />
                      </div>
                    </Td>}
                  </tr>
                )
              })}
            </tbody>
          </Table>
        </>)}
      </Card>
    </div>
  )
}
