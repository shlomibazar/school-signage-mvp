'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, ExternalLink, Tv, Settings, Power, Trash2, Camera } from 'lucide-react'
import ScreenSnapshotImage from '@/components/admin/ScreenSnapshotImage'
import ScreenConnectDialog from './ScreenConnectDialog'
import { setScreenActive, deleteScreen } from './screenActions'
import { ButtonLink, Button, buttonClass } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Display'
import { ActionMenu, type MenuItem } from '@/components/ui/ActionMenu'
import { cn } from '@/lib/utils'

export type ScreenCardData = {
  id: string; name: string; slug: string; orientation: string; width: number; height: number
  active: boolean; shortCode: string | null; snapshotUrl: string | null; snapshotAt: string | null
}

// One screen in the screens list: its picture, name and status, the two everyday actions (edit,
// view), "חיבור טלוויזיה", and a "⋮" menu for the rarely used management actions.
export default function ScreenCard({ screen, fallback, canEditContent, canAdmin }: {
  screen: ScreenCardData
  /** Schematic preview (server-rendered) for a screen without a snapshot. */
  fallback: React.ReactNode
  canEditContent: boolean
  canAdmin: boolean
}) {
  const router = useRouter()
  const [active, setActive] = useState(screen.active)
  useEffect(() => { setActive(screen.active) }, [screen.active])
  const [connectOpen, setConnectOpen] = useState(false)
  const portrait = screen.orientation === 'PORTRAIT'

  const menu: MenuItem[] = [
    { label: 'הגדרות מסך', icon: <Settings className="h-4 w-4" aria-hidden="true" />, href: '/admin/settings' },
    {
      label: active ? 'השבתת המסך' : 'הפעלת המסך', icon: <Power className="h-4 w-4" aria-hidden="true" />,
      onSelect: async () => { const next = await setScreenActive(screen, !active); if (next !== null) { setActive(next); router.refresh() } },
    },
    {
      label: 'מחיקת המסך', icon: <Trash2 className="h-4 w-4" aria-hidden="true" />, tone: 'danger',
      onSelect: async () => { if (await deleteScreen(screen)) router.refresh() },
    },
  ]

  return (
    <article aria-label={screen.name} className="flex min-w-0 flex-col overflow-hidden rounded-ui-lg border border-ui-border bg-ui-surface shadow-ui">
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
            <h3 className="truncate text-[15px] font-semibold text-ui-ink" title={screen.name}>{screen.name}</h3>
            <p className="mt-0.5 text-xs text-ui-muted">{portrait ? 'אנכי' : 'אופקי'} · <span dir="ltr">{screen.width}×{screen.height}</span></p>
          </div>
          <Badge tone={active ? 'success' : 'neutral'} dot>{active ? 'פעיל' : 'מושבת'}</Badge>
        </div>

        <div className="mt-auto grid grid-cols-2 gap-2">
          {canEditContent && <ButtonLink href={`/admin/editor?screen=${screen.id}`} variant="primary" icon={<Pencil className="h-4 w-4" aria-hidden="true" />}>עריכת מסך</ButtonLink>}
          <a href={`/screen/${screen.slug}`} target="_blank" rel="noopener" aria-label={`צפייה במסך ${screen.name} (בלשונית חדשה)`}
            className={buttonClass('secondary', 'md', canEditContent ? '' : 'col-span-2')}>
            <ExternalLink className="h-4 w-4" aria-hidden="true" />צפייה במסך
          </a>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1 border border-ui-border" icon={<Tv className="h-4 w-4" aria-hidden="true" />} onClick={() => setConnectOpen(true)}>
            חיבור טלוויזיה
          </Button>
          {canAdmin && <ActionMenu label={`פעולות נוספות למסך ${screen.name}`} items={menu} />}
        </div>
      </div>

      <ScreenConnectDialog open={connectOpen} onClose={() => setConnectOpen(false)} screen={screen}
        canPair={canAdmin} canCreateLink={canEditContent} />
    </article>
  )
}
