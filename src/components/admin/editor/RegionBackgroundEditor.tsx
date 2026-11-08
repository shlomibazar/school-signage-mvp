'use client'
import { useEffect, useId, useState } from 'react'
import { ImageIcon, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DEFAULT_REGION_BACKGROUND, normalizeRegionBackground, type RegionBackground } from '@/lib/regionBackground'

type Media = { id: string; url: string; originalName: string; mimeType?: string; mediaType?: string }

// "רקע האזור": theme default, a solid colour, or an image from the school's media library with
// position, cover/contain and a dark or light overlay (0–90%). Saved with the layout.
export default function RegionBackgroundEditor({ value, onChange }: { value: RegionBackground | null | undefined; onChange: (bg: RegionBackground | null) => void }) {
  const id = useId()
  const bg = { ...DEFAULT_REGION_BACKGROUND, ...(value ?? {}) }
  const set = (patch: Partial<RegionBackground>) => onChange(normalizeRegionBackground({ ...bg, ...patch }) ?? (patch.mode === 'theme' ? null : { ...bg, ...patch }))
  const [media, setMedia] = useState<Media[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (bg.mode !== 'image' || media) return
    fetch('/api/media', { cache: 'no-store' }).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'טעינת ספריית המדיה נכשלה'); return d })
      .then(d => setMedia(((d.data ?? []) as Media[]).filter(m => (m.mimeType ?? '').startsWith('image/') || m.mediaType === 'IMAGE')))
      .catch(e => setError(e instanceof Error ? e.message : 'טעינת ספריית המדיה נכשלה'))
  }, [bg.mode, media])
  const label = 'text-xs font-medium text-ui-ink-2'
  const select = 'ui-focus h-9 w-full rounded-ui-sm border border-ui-border-strong bg-ui-surface px-2 text-sm'

  return (
    <section className="rounded-ui-lg border border-ui-border bg-ui-surface px-4 py-3">
      <h3 className="text-sm font-semibold text-ui-ink">רקע האזור</h3>
      <p className="mb-3 text-xs text-ui-muted">לאזור הזה בלבד. השקיפות חלה על שכבת ההכהיה, לא על הטקסט.</p>
      <div role="radiogroup" aria-label="סוג רקע" className="mb-3 grid grid-cols-3 gap-1.5">
        {([['theme', 'ערכת הנושא'], ['color', 'צבע'], ['image', 'תמונה']] as const).map(([m, name]) => (
          <button key={m} type="button" role="radio" aria-checked={bg.mode === m} onClick={() => set({ mode: m })}
            className={cn('ui-focus h-9 rounded-ui-sm border text-xs font-medium', bg.mode === m ? 'border-ui-primary bg-ui-primary-soft text-ui-primary-ink' : 'border-ui-border text-ui-ink-2 hover:bg-ui-subtle')}>{name}</button>
        ))}
      </div>
      {bg.mode === 'color' && (
        <label className="flex items-center gap-3"><span className={label}>צבע</span>
          <input type="color" value={bg.color ?? '#1f2937'} onChange={e => set({ color: e.target.value })} className="h-9 w-16 cursor-pointer rounded border border-ui-border" aria-label="צבע הרקע" />
          <span className="text-xs text-ui-muted" dir="ltr">{bg.color ?? 'לא נבחר'}</span>
        </label>
      )}
      {bg.mode === 'image' && (
        <div className="grid gap-3">
          {error ? <p role="alert" className="text-xs text-ui-danger">{error}</p> : media === null ? (
            <p className="flex items-center gap-1.5 text-xs text-ui-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />טוען ספריית מדיה…</p>
          ) : media.length === 0 ? <p className="text-xs text-ui-muted">אין תמונות בספריית המדיה. אפשר להעלות תמונות בעמוד ״ספריית מדיה״.</p> : (
            <div className="grid max-h-44 grid-cols-4 gap-1.5 overflow-y-auto" role="listbox" aria-label="תמונת רקע">
              {media.map(m => (
                <button key={m.id} type="button" role="option" aria-selected={bg.imageUrl === m.url} onClick={() => set({ imageUrl: m.url })} title={m.originalName}
                  className={cn('ui-focus aspect-video overflow-hidden rounded border-2', bg.imageUrl === m.url ? 'border-ui-primary' : 'border-transparent')}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.url} alt={m.originalName} className="h-full w-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          )}
          {!bg.imageUrl && media && media.length > 0 && <p className="flex items-center gap-1 text-xs text-ui-muted"><ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />בחרו תמונה כדי להפעיל את הרקע.</p>}
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1"><span className={label}>מיקום</span>
              <select id={`${id}-pos`} className={select} value={bg.position} onChange={e => set({ position: e.target.value as RegionBackground['position'] })}>
                <option value="center">מרכז</option><option value="top">למעלה</option><option value="bottom">למטה</option><option value="right">ימין</option><option value="left">שמאל</option>
              </select></label>
            <label className="grid gap-1"><span className={label}>התאמה</span>
              <select className={select} value={bg.fit} onChange={e => set({ fit: e.target.value === 'contain' ? 'contain' : 'cover' })}>
                <option value="cover">מילוי (חיתוך)</option><option value="contain">התאמה (ללא חיתוך)</option>
              </select></label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {([['dark', 'הכהיה'], ['light', 'הבהרה']] as const).map(([o, name]) => (
              <button key={o} type="button" aria-pressed={bg.overlay === o} onClick={() => set({ overlay: o })}
                className={cn('ui-focus h-9 rounded-ui-sm border text-xs font-medium', bg.overlay === o ? 'border-ui-primary bg-ui-primary-soft text-ui-primary-ink' : 'border-ui-border text-ui-ink-2 hover:bg-ui-subtle')}>{name}</button>
            ))}
          </div>
          <label className="grid gap-1"><span className={label}>עוצמת השכבה: {bg.opacity}%</span>
            <input type="range" min={0} max={90} step={5} value={bg.opacity} onChange={e => set({ opacity: Number(e.target.value) })} aria-label="עוצמת שכבת ההכהיה" />
          </label>
          {bg.opacity < 45 && <p className="text-xs text-amber-700">בעוצמה נמוכה הטקסט עלול להיות קשה לקריאה על התמונה.</p>}
        </div>
      )}
    </section>
  )
}
