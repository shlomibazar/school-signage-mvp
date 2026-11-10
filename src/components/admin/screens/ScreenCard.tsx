'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { Pencil, ExternalLink, Tv, Settings, Power, Trash2, Camera, Copy, PenLine } from 'lucide-react'
import ScreenSnapshotImage from '@/components/admin/ScreenSnapshotImage'
import ScreenConnectDialog from './ScreenConnectDialog'
import ScreenNameDialog from './ScreenNameDialog'
import { setScreenActive, deleteScreen } from './screenActions'
import { ButtonLink, Button, buttonClass } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Display'
import { ActionMenu, type MenuItem } from '@/components/ui/ActionMenu'
import { cn } from '@/lib/utils'
import { CONNECTION_LABELS, type ConnectionStatus } from '@/lib/screenConnection'

const CONNECTION_DOT: Record<ConnectionStatus, string> = { connected: 'bg-emerald-500', disconnected: 'bg-red-500', never: 'bg-slate-400' }
const CONNECTION_TEXT: Record<ConnectionStatus, string> = { connected: 'text-emerald-700', disconnected: 'text-red-700', never: 'text-ui-muted' }

export type ScreenCardData = {
  id: string; name: string; slug: string; orientation: string; width: number; height: number
  active: boolean; shortCode: string | null; snapshotUrl: string | null; snapshotAt: string | null
}

// One screen in the screens list: its picture, name and status, the two everyday actions (edit,
// view), "חיבור טלוויזיה", and a "⋮" menu for the rarely used management actions.
export type ScreenConnection = { status: ConnectionStatus; relative: string | null; exact: string | null }

export default function ScreenCard({ screen, connection, fallback, canEditContent, canAdmin }: {
  screen: ScreenCardData
  /** "מצב חיבור" from the last heartbeat, computed by the server when the list was loaded. */
  connection: ScreenConnection
  /** Schematic preview (server-rendered) for a screen without a snapshot. */
  fallback: React.ReactNode
  canEditContent: boolean
  canAdmin: boolean
}) {
  const router = useRouter()
  const [active, setActive] = useState(screen.active)
  useEffect(() => { setActive(screen.active) }, [screen.active])
  const [connectOpen, setConnectOpen] = useState(false)
  // The name shown on the card follows a rename right away (the list refresh then confirms it).
  const [name, setName] = useState(screen.name)
  useEffect(() => { setName(screen.name) }, [screen.name])
  const [dialog, setDialog] = useState<'rename' | 'duplicate' | null>(null)
  const portrait = screen.orientation === 'PORTRAIT'

  async function rename(next: string) {
    const r = await fetch(`/api/screens/${encodeURIComponent(screen.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: next }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(r.status === 403 ? 'אין לך הרשאה לשנות את שם המסך' : d.error || 'שינוי השם נכשל. נסו שוב.')
    setName(d.data?.name ?? next); setDialog(null); toast.success('שם המסך עודכן'); router.refresh()
  }
  async function duplicate(next: string) {
    const r = await fetch(`/api/screens/${encodeURIComponent(screen.id)}/duplicate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: next }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(r.status === 403 ? 'אין לך הרשאה ליצור מסכים' : d.error || 'שכפול המסך נכשל. נסו שוב.')
    setDialog(null); router.refresh()
    toast.success(t => <span>המסך ״{d.data.name}״ נוצר (לא פעיל). <Link href={`/admin/editor?screen=${d.data.id}`} onClick={() => toast.dismiss(t.id)} className="font-semibold underline">פתיחה בעורך</Link></span>, { duration: 8000 })
  }

  // Rename and duplicate: EDITOR and up (as creating a screen). The rest: SCHOOL_ADMIN and up.
  const menu: MenuItem[] = [
    ...(canEditContent ? [
      { label: 'שינוי שם', icon: <PenLine className="h-4 w-4" aria-hidden="true" />, onSelect: () => setDialog('rename') },
      { label: 'שכפול מסך', icon: <Copy className="h-4 w-4" aria-hidden="true" />, onSelect: () => setDialog('duplicate') },
    ] : []),
    ...(canAdmin ? adminItems() : []),
  ]
  function adminItems(): MenuItem[] { return [
    { label: 'הגדרות מסך', icon: <Settings className="h-4 w-4" aria-hidden="true" />, href: `/admin/screens/${screen.id}/settings` },
    {
      label: active ? 'השבתת המסך' : 'הפעלת המסך', icon: <Power className="h-4 w-4" aria-hidden="true" />,
      onSelect: async () => { const next = await setScreenActive({ ...screen, name }, !active); if (next !== null) { setActive(next); router.refresh() } },
    },
    {
      label: 'מחיקת המסך', icon: <Trash2 className="h-4 w-4" aria-hidden="true" />, tone: 'danger',
      onSelect: async () => { if (await deleteScreen({ ...screen, name })) router.refresh() },
    },
  ] }

  return (
    <article data-tour="screen-card" aria-label={name} className="flex min-w-0 flex-col overflow-hidden rounded-ui-lg border border-ui-border bg-ui-surface shadow-ui">
      <div className={cn('relative', !active && 'opacity-60 grayscale-[35%]')}>
        {screen.snapshotUrl && screen.snapshotAt
          ? <ScreenSnapshotImage url={screen.snapshotUrl} takenAt={screen.snapshotAt} name={screen.name} slug={screen.slug} portrait={portrait} />
          : <>
              {fallback}
              <span className="absolute bottom-1.5 start-1.5 inline-flex items-center gap-1 rounded-md bg-white/90 px-2 py-0.5 text-[11px] text-ui-ink-2 shadow-sm">
                <Camera className="h-3 w-3" aria-hidden="true" />
                {canEditContent ? 'אין צילום עדיין · אפשר ליצור בעורך' : 'אין צילום עדיין'}
              </span>
            </>}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold text-ui-ink" title={name}>{name}</h3>
            <p className="mt-0.5 text-xs text-ui-muted">{portrait ? 'אנכי' : 'אופקי'} · <span dir="ltr">{screen.width}×{screen.height}</span></p>
          </div>
          {/* Administrative status (set by an administrator), unchanged. */}
          <span title="מצב במערכת" className="shrink-0"><Badge tone={active ? 'success' : 'neutral'} dot>{active ? 'פעיל' : 'לא פעיל'}</Badge></span>
        </div>
        {/* Connection status (from the screen's own reports): one compact line, separate from the badge. */}
        <p className="-mt-1 flex min-w-0 items-center gap-1.5 text-xs" title={connection.exact ? `דיווח אחרון: ${connection.exact}` : 'המסך עוד לא דיווח'}>
          <span className="text-ui-muted">מצב חיבור:</span>
          {active ? <>
            <span className={cn('h-2 w-2 shrink-0 rounded-full', CONNECTION_DOT[connection.status])} aria-hidden="true" />
            <span className={cn('font-medium', CONNECTION_TEXT[connection.status])}>{CONNECTION_LABELS[connection.status]}</span>
          </> : <span className="text-ui-muted">— (המסך לא פעיל)</span>}
          {connection.relative && <span className="truncate text-ui-muted">· דיווח אחרון {connection.relative}</span>}
        </p>

        <div data-tour="screen-card-edit" className="mt-auto grid grid-cols-2 gap-2">
          {canEditContent && <ButtonLink href={`/admin/editor?screen=${screen.id}`} variant="primary" icon={<Pencil className="h-4 w-4" aria-hidden="true" />}>עריכת מסך</ButtonLink>}
          <a href={`/screen/${screen.slug}`} target="_blank" rel="noopener" aria-label={`צפייה במסך ${screen.name} (בלשונית חדשה)`}
            className={buttonClass('secondary', 'md', canEditContent ? '' : 'col-span-2')}>
            <ExternalLink className="h-4 w-4" aria-hidden="true" />צפייה במסך
          </a>
        </div>
        <div data-tour="screen-card-connect" className="flex gap-2">
          <Button variant="ghost" className="flex-1 border border-ui-border" icon={<Tv className="h-4 w-4" aria-hidden="true" />} onClick={() => setConnectOpen(true)}>
            חיבור טלוויזיה
          </Button>
          {menu.length > 0 && <ActionMenu label={`פעולות נוספות למסך ${name}`} items={menu} />}
        </div>
      </div>

      <ScreenNameDialog open={dialog === 'rename'} title="שינוי שם המסך" initialName={name} confirmLabel="שמירה" requireChange
        description="הכתובת של המסך, החיבור לטלוויזיה והתוכן לא משתנים." onClose={() => setDialog(null)} onSubmit={rename} />
      <ScreenNameDialog open={dialog === 'duplicate'} title="שכפול מסך" initialName={`${name} (עותק)`.slice(0, 100)} confirmLabel="שכפול"
        description="ייווצר מסך חדש עם אותה פריסה, עיצוב ותוכן. הוא ייווצר כלא פעיל, עם כתובת משלו, ובלי חיבור לטלוויזיה."
        onClose={() => setDialog(null)} onSubmit={duplicate} />
      <ScreenConnectDialog open={connectOpen} onClose={() => setConnectOpen(false)} screen={screen}
        canPair={canAdmin} canCreateLink={canEditContent} />
    </article>
  )
}
