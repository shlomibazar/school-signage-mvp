'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Monitor, AlertCircle } from 'lucide-react'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Display'
import { cn } from '@/lib/utils'

export type RegionOption = { id: string; title: string; position: number; positionLabel: string; active: boolean; announcementIds: string[] }
export type ScreenOption = { id: string; name: string; active: boolean; regions: RegionOption[] }

// "Where to display": the user picks screens, not technical regions.
// - A screen with one announcement region: ticking the screen selects that region.
// - A screen with several: each region is ticked explicitly (none is pre-selected).
// - A screen without an announcement region is shown unavailable, with a link to the editor.
export default function WhereToDisplay({ announcementId, value, onChange, onLoaded, disabled = false }: {
  announcementId?: string
  value: string[]
  onChange: (regionIds: string[]) => void
  onLoaded?: (screens: ScreenOption[], current: string[]) => void
  disabled?: boolean
}) {
  const [screens, setScreens] = useState<ScreenOption[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    fetch('/api/announcement-regions', { cache: 'no-store' })
      .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw Error(d.error || 'טעינת המסכים נכשלה'); return d.data as ScreenOption[] })
      .then(list => {
        if (!alive) return
        setScreens(list)
        // An existing announcement starts with the regions it is shown in now.
        const current = announcementId ? list.flatMap(s => s.regions.filter(r => r.announcementIds.includes(announcementId)).map(r => r.id)) : []
        onLoaded?.(list, current)
      })
      .catch(e => alive && setError(e.message))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per announcement
  }, [announcementId])

  const selected = new Set(value)
  const toggle = (ids: string[], on: boolean) => onChange(on ? [...value, ...ids.filter(id => !selected.has(id))] : value.filter(id => !ids.includes(id)))
  const chosenScreens = screens?.filter(s => s.regions.some(r => selected.has(r.id))).length ?? 0
  const unavailable = screens?.filter(s => s.regions.length === 0) ?? []

  return (
    <Card>
      <CardHeader title="איפה להציג" description="רק מסכים של בית הספר שלך" actions={chosenScreens ? <Badge tone="primary">{chosenScreens === 1 ? 'מסך אחד' : `${chosenScreens} מסכים`}</Badge> : <Badge>טרם נבחר מסך</Badge>} />
      <CardBody className="grid gap-2">
        {error && <p role="alert" className="flex items-center gap-2 text-sm text-ui-danger"><AlertCircle className="h-4 w-4" />{error}</p>}
        {!screens && !error && <p className="text-sm text-ui-muted">טוען מסכים...</p>}
        {screens?.length === 0 && <p className="text-sm text-ui-muted">אין עדיין מסכים בבית הספר.</p>}
        {screens?.filter(s => s.regions.length > 0).map(screen => {
          const single = screen.regions.length === 1
          const on = single && selected.has(screen.regions[0].id)
          return (
            <div key={screen.id} className={cn('rounded-ui border p-3', on || screen.regions.some(r => selected.has(r.id)) ? 'border-ui-primary-line bg-ui-primary-soft/40' : 'border-ui-border')}>
              <label className={cn('flex items-start gap-3', single && !disabled ? 'cursor-pointer' : '')}>
                {single
                  ? <input type="checkbox" className="ui-focus mt-1 h-4 w-4 shrink-0 accent-[var(--ui-primary)]" checked={on} disabled={disabled} onChange={e => toggle([screen.regions[0].id], e.target.checked)} />
                  : <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-ui-muted" aria-hidden="true" />}
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ui-ink">{screen.name}</span>
                    {!screen.active && <Badge tone="warning">המסך כבוי</Badge>}
                  </span>
                  <span className="block text-xs text-ui-muted">
                    {single ? `${screen.regions[0].title} · ${countLabel(screen.regions[0].announcementIds.length)}`
                      : `${screen.regions.length} אזורי הודעות · בחרו באיזה אזור להציג`}
                  </span>
                </span>
              </label>
              {screen.regions.length > 1 && (
                <div className="mt-2 grid gap-1.5 ps-7">
                  {screen.regions.map(region => (
                    <label key={region.id} className={cn('flex items-center gap-2.5 rounded-ui-sm border bg-ui-surface px-3 py-2 text-sm', selected.has(region.id) ? 'border-ui-primary-line' : 'border-ui-border', !disabled && 'cursor-pointer')}>
                      <input type="checkbox" className="ui-focus h-4 w-4 shrink-0 accent-[var(--ui-primary)]" checked={selected.has(region.id)} disabled={disabled} onChange={e => toggle([region.id], e.target.checked)} />
                      <span className="min-w-0 flex-1"><b className="font-semibold text-ui-ink">{region.title}</b> <span className="text-ui-muted">· {region.positionLabel} · {countLabel(region.announcementIds.length)}</span></span>
                      {!region.active && <Badge tone="warning">האזור כבוי</Badge>}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {unavailable.length > 0 && (
          <div className="rounded-ui border border-dashed border-ui-border bg-ui-subtle p-3">
            <p className="text-xs font-semibold text-ui-ink-2">{unavailable.length === 1 ? 'מסך אחד לא זמין' : `${unavailable.length} מסכים לא זמינים`}</p>
            <p className="mt-0.5 text-xs text-ui-muted">אין בהם אזור הודעות, לכן אי אפשר להציג בהם הודעות. אפשר להוסיף אזור הודעות בעורך המסך.</p>
            <ul className="mt-2 grid gap-1">
              {unavailable.map(s => (
                <li key={s.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex min-w-0 items-center gap-1.5 text-ui-muted"><Monitor className="h-3.5 w-3.5 shrink-0 text-ui-faint" aria-hidden="true" /><span className="truncate">{s.name}</span></span>
                  <Link href={`/admin/editor?screen=${encodeURIComponent(s.id)}`} className="shrink-0 font-medium text-ui-primary hover:underline">לעורך המסך</Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        {screens && screens.length > 0 && <p className="text-xs text-ui-muted">ההודעה תתווסף לסוף סבב ההודעות בכל אזור שנבחר. ההודעות הקיימות נשארות. בלי בחירת מסך, ההודעה תישמר כטיוטה ולא תוצג.</p>}
      </CardBody>
    </Card>
  )
}

const countLabel = (n: number) => n === 0 ? 'אין הודעות כרגע' : n === 1 ? 'הודעה אחת בסבב' : `${n} הודעות בסבב`
