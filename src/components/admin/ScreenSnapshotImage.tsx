'use client'
import { useEffect, useState } from 'react'
import { ExternalLink, X, Maximize2 } from 'lucide-react'
import { displayImageUrl } from '@/lib/imageDelivery'
import { snapshotStamp as stamp } from '@/lib/snapshotTime'

// The saved snapshot of a screen (captured in the editor with "עדכן צילום"). The card shows a
// small Cloudinary rendition; a click opens a larger one. No TV renderer is loaded here.

export default function ScreenSnapshotImage({ url, takenAt, name, slug, portrait }: { url: string; takenAt: string; name: string; slug: string; portrait: boolean }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  // Card box is 16:9; a portrait screen is shown whole inside it.
  const thumb = portrait ? displayImageUrl(url, 180, 320, { dpr: 2 }) : displayImageUrl(url, 480, 270, { dpr: 2 })
  const large = portrait ? displayImageUrl(url, 720, 1280) : displayImageUrl(url, 1280, 720)
  return <>
    <button type="button" onClick={() => setOpen(true)} aria-label={`הגדלת הצילום של ${name}`}
      className="group relative block aspect-video w-full overflow-hidden bg-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
      <img src={thumb} alt={`צילום של המסך ${name}`} loading="lazy" decoding="async" className="h-full w-full object-contain" />
      <span className="absolute bottom-1.5 start-1.5 rounded-md bg-black/60 px-2 py-0.5 text-[11px] text-white">צילום מ-{stamp(takenAt)}</span>
      <span className="absolute top-1.5 end-1.5 rounded-md bg-black/50 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"><Maximize2 className="h-3.5 w-3.5" /></span>
    </button>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={`צילום של המסך ${name}`} onClick={() => setOpen(false)} dir="rtl">
      <div className="flex max-h-full w-full max-w-6xl flex-col gap-2" onClick={e => e.stopPropagation()}>
        <div className="flex flex-wrap items-center justify-between gap-2 text-white">
          <div className="min-w-0"><p className="truncate font-semibold">{name}</p><p className="text-xs opacity-80">צילום מ-{stamp(takenAt)} · לא מתעדכן אוטומטית</p></div>
          <div className="flex items-center gap-2">
            <a href={`/screen/${slug}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-sm hover:bg-white/25"><ExternalLink className="h-4 w-4" />פתיחת המסך החי</a>
            <button type="button" onClick={() => setOpen(false)} autoFocus className="rounded-lg bg-white/15 p-1.5 hover:bg-white/25" aria-label="סגירה"><X className="h-5 w-5" /></button>
          </div>
        </div>
        <img src={large} alt={`צילום של המסך ${name}`} className="min-h-0 w-full rounded-lg bg-black object-contain" style={{ maxHeight: 'calc(100vh - 7rem)' }} />
      </div>
    </div>}
  </>
}
