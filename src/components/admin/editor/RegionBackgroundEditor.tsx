'use client'
import { useId, useState } from 'react'
import { ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DEFAULT_REGION_BACKGROUND, normalizeRegionBackground, type RegionBackground } from '@/lib/regionBackground'
import { cloudinaryThumbnailUrl } from '@/lib/mediaThumbnail'
import MediaImagePicker from '@/components/admin/media/MediaImagePicker'

// "רקע האזור": theme default, a solid colour, or an image from the school's media library with
// position, cover/contain and a dark or light overlay (0–90%). Saved with the layout. The image is
// chosen (or uploaded) in a picker that loads nothing until it is opened; choosing one changes only
// the image URL, never the other settings. The TV keeps using the full image.
export default function RegionBackgroundEditor({ value, onChange }: { value: RegionBackground | null | undefined; onChange: (bg: RegionBackground | null) => void }) {
  const id = useId()
  const bg = { ...DEFAULT_REGION_BACKGROUND, ...(value ?? {}) }
  const set = (patch: Partial<RegionBackground>) => onChange(normalizeRegionBackground({ ...bg, ...patch }) ?? (patch.mode === 'theme' ? null : { ...bg, ...patch }))
  const [picking, setPicking] = useState(false)
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
          <div className="flex items-center gap-3">
            <div className="flex aspect-video w-28 shrink-0 items-center justify-center overflow-hidden rounded-ui-sm border border-ui-border bg-ui-subtle">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {bg.imageUrl ? <img src={cloudinaryThumbnailUrl(bg.imageUrl) ?? bg.imageUrl} alt="תמונת הרקע שנבחרה" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                : <ImageIcon className="h-5 w-5 text-ui-muted" aria-hidden="true" />}
            </div>
            <div className="grid gap-1">
              <button type="button" onClick={() => setPicking(true)} className="ui-focus h-9 rounded-ui-sm border border-ui-border-strong bg-ui-surface px-3 text-xs font-medium text-ui-ink-2 hover:bg-ui-subtle">
                {bg.imageUrl ? 'החלפת תמונה' : 'בחירת תמונה'}
              </button>
              {!bg.imageUrl && <span className="text-xs text-ui-muted">בחרו או העלו תמונה כדי להפעיל את הרקע.</span>}
            </div>
          </div>
          {picking && <MediaImagePicker open onClose={() => setPicking(false)} selectedUrl={bg.imageUrl} onSelect={m => set({ imageUrl: m.url })} />}
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
