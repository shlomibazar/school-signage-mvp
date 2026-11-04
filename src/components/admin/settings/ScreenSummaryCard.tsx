'use client'
import { useState } from 'react'
import { ExternalLink, Pencil, Tv } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Display'
import { Button, ButtonLink, buttonClass } from '@/components/ui/Button'
import ScreenConnectDialog from '@/components/admin/screens/ScreenConnectDialog'

export type ScreenSettingsScreen = {
  id: string; name: string; slug: string; shortCode: string | null
  orientation: string; width: number; height: number; active: boolean
}

// "כללי": which screen this is, its state and the everyday links. The name is not editable (there
// is no rename endpoint); the TV connection dialog is the one from the screens list.
export default function ScreenSummaryCard({ screen, active, schoolName, canEditContent, canAdmin }: {
  screen: ScreenSettingsScreen; active: boolean; schoolName?: string; canEditContent: boolean; canAdmin: boolean
}) {
  const [connectOpen, setConnectOpen] = useState(false)
  const portrait = screen.orientation === 'PORTRAIT'
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-ui-muted">כללי</p>
          <h2 className="mt-0.5 truncate text-lg font-semibold text-ui-ink" title={screen.name}>{screen.name}</h2>
          <p className="mt-1 text-[13px] text-ui-muted">
            {portrait ? 'אנכי' : 'אופקי'} · <span dir="ltr">{screen.width}×{screen.height}</span>
            {schoolName && <> · {schoolName}</>}
            {' · '}<span dir="ltr" className="font-mono text-xs">/screen/{screen.slug}</span>
          </p>
        </div>
        <Badge tone={active ? 'success' : 'neutral'} dot>{active ? 'פעיל' : 'מושבת'}</Badge>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
        {canEditContent && <ButtonLink href={`/admin/editor?screen=${screen.id}`} variant="primary" icon={<Pencil className="h-4 w-4" aria-hidden="true" />}>עריכת מסך</ButtonLink>}
        <a href={`/screen/${screen.slug}`} target="_blank" rel="noopener" aria-label={`צפייה במסך ${screen.name} (בלשונית חדשה)`} className={buttonClass('secondary')}>
          <ExternalLink className="h-4 w-4" aria-hidden="true" />צפייה במסך
        </a>
        <Button icon={<Tv className="h-4 w-4" aria-hidden="true" />} onClick={() => setConnectOpen(true)}>חיבור טלוויזיה</Button>
      </div>
      <ScreenConnectDialog open={connectOpen} onClose={() => setConnectOpen(false)} screen={screen} canPair={canAdmin} canCreateLink={canEditContent} />
    </Card>
  )
}
