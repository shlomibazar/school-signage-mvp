'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Loader2, AlertCircle, CheckCircle2, RotateCcw, X } from 'lucide-react'
import { thumbnailImageUrl, isImageMedia } from '@/lib/imageDelivery'
import { pdfPages } from '@/lib/pdfPages'
import { cn } from '@/lib/utils'

// Attachments of a NEW announcement (no database id yet). Each chosen file is processed at once:
// a PDF is converted to page images in the browser (the same pdfPages used for saved
// announcements), and every image/page is uploaded to /api/announcement-uploads, which stores
// it and returns a signed token. Saving the announcement sends the tokens (see AnnouncementForm).
// Removed items, and everything when the form is left unsaved, are discarded on the server.

export type PendingMedia = { id: string; url: string; originalName: string; mimeType?: string }
export type PreparedPage = { token: string; url: string; preview: string }
export type PreparedItem = {
  key: string
  name: string
  kind: 'image' | 'pdf' | 'media'
  status: 'converting' | 'uploading' | 'ready' | 'error'
  done: number
  total: number
  error?: string
  pages: PreparedPage[]
  media?: PendingMedia
}

const ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name)

/** The items as they are sent when saving: one entry per image/page, in order. */
export const preparedPayload = (items: PreparedItem[]): ({ token: string } | { mediaId: string })[] =>
  items.flatMap((i): ({ token: string } | { mediaId: string })[] => i.media ? [{ mediaId: i.media.id }] : i.pages.map(p => ({ token: p.token })))
export const preparedTokens = (items: PreparedItem[]) => items.flatMap(i => i.pages.map(p => p.token))
export const preparedBusy = (items: PreparedItem[]) => items.some(i => i.status === 'converting' || i.status === 'uploading')

/** Asks the server to delete prepared uploads that will not be saved (keepalive: also while leaving). */
export function discardPrepared(tokens: string[]) {
  if (!tokens.length) return
  fetch('/api/announcement-uploads/discard', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tokens }) }).catch(() => {})
}

export default function PendingAnnouncementAttachments({ items, onChange, disabled = false }: { items: PreparedItem[]; onChange: (update: (items: PreparedItem[]) => PreparedItem[]) => void; disabled?: boolean }) {
  const [media, setMedia] = useState<PendingMedia[]>([])
  const [picker, setPicker] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  // Per item: the source file and its converted pages (kept for retries), and removal flags.
  const sources = useRef(new Map<string, { file: File; pages?: File[]; uploaded?: number }>())
  const removed = useRef(new Set<string>())
  const previews = useRef<string[]>([])
  const queue = useRef<Promise<void>>(Promise.resolve())
  useEffect(() => { fetch('/api/media', { cache: 'no-store' }).then(async r => { const d = await r.json(); if (!r.ok) throw Error(d.error || 'שגיאה בטעינת הגלריה'); setMedia((d.data ?? []).filter(isImageMedia)) }).catch(e => setError(e.message)) }, [])
  useEffect(() => () => { for (const url of previews.current) URL.revokeObjectURL(url) }, [])
  const selected = useMemo(() => new Set(items.map(a => a.media?.id).filter(Boolean)), [items])
  const patch = (key: string, p: Partial<PreparedItem> | ((i: PreparedItem) => Partial<PreparedItem>)) =>
    onChange(list => list.map(i => i.key === key ? { ...i, ...(typeof p === 'function' ? p(i) : p) } : i))

  async function processItem(key: string) {
    const src = sources.current.get(key)
    if (!src) return
    try {
      if (isPdf(src.file) && !src.pages) {
        patch(key, { status: 'converting', error: undefined })
        src.pages = await pdfPages(src.file, (done, total) => patch(key, { done, total }))
      }
      const files = src.pages ?? [src.file]
      patch(key, { status: 'uploading', error: undefined, total: files.length })
      // Continue after the pages already uploaded (a retry does not upload them twice).
      for (let n = src.uploaded ?? 0; n < files.length && !removed.current.has(key); n++) {
        const page = files[n]
        const form = new FormData()
        form.append('file', page)
        if (src.pages) { form.append('pdfPage', '1'); form.append('originalName', page.name) }
        patch(key, { done: n })
        const r = await fetch('/api/announcement-uploads', { method: 'POST', body: form })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw Error(d.error || `ההעלאה נכשלה (${r.status})`)
        if (removed.current.has(key)) { discardPrepared([d.data.token]); break }
        src.uploaded = n + 1
        const preview = URL.createObjectURL(page); previews.current.push(preview)
        patch(key, i => ({ pages: [...i.pages, { token: d.data.token, url: d.data.url, preview }], done: i.pages.length + 1 }))
      }
      if (!removed.current.has(key)) patch(key, { status: 'ready' })
    } catch (e) {
      patch(key, { status: 'error', error: e instanceof Error ? e.message : 'ההעלאה נכשלה' })
    }
  }
  // One file at a time, in the order chosen.
  const enqueue = (key: string) => { queue.current = queue.current.then(() => processItem(key)) }

  function addFiles(files: FileList | null) {
    if (!files) return
    setError('')
    const next: PreparedItem[] = []
    for (const file of Array.from(files)) {
      if (!ACCEPT.includes(file.type) && !isPdf(file)) { setError(`סוג קובץ לא נתמך: ${file.name}`); continue }
      if (file.size > (isPdf(file) ? 20 : 10) * 1024 * 1024) { setError(`הקובץ גדול מדי: ${file.name}`); continue }
      const key = crypto.randomUUID()
      sources.current.set(key, { file })
      next.push({ key, name: file.name, kind: isPdf(file) ? 'pdf' : 'image', status: isPdf(file) ? 'converting' : 'uploading', done: 0, total: isPdf(file) ? 0 : 1, pages: [] })
    }
    onChange(list => [...list, ...next])
    for (const item of next) enqueue(item.key)
    if (fileRef.current) fileRef.current.value = ''
  }
  function remove(item: PreparedItem) {
    removed.current.add(item.key)
    discardPrepared(item.pages.map(p => p.token))
    sources.current.delete(item.key)
    onChange(list => list.filter(i => i.key !== item.key))
  }
  function toggle(m: PendingMedia) {
    const old = items.find(a => a.media?.id === m.id)
    onChange(list => old ? list.filter(a => a !== old) : [...list, { key: crypto.randomUUID(), name: m.originalName, kind: 'media', status: 'ready', done: 1, total: 1, pages: [], media: m }])
  }

  return <section className="grid min-w-0 max-w-full gap-3 overflow-x-hidden rounded-ui border border-ui-border p-3 sm:p-4" dir="rtl">
    <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">תמונות וקבצים מצורפים</h2>{items.length > 0 && <span className="text-xs text-ui-muted">{items.length} קבצים</span>}</div>
    <p className="text-xs text-ui-muted">הקבצים מועלים מיד. קובצי PDF מומרים לעמודי תמונה, כפי שיוצגו בטלוויזיה. הם יצורפו להודעה בשמירה.</p>
    <div className="flex flex-wrap gap-2">
      <label className={cn('cursor-pointer rounded-ui-sm bg-ui-primary px-4 py-2 text-sm text-white hover:bg-ui-primary-hover', disabled && 'pointer-events-none opacity-50')}>העלאת תמונות / PDF<input ref={fileRef} type="file" multiple disabled={disabled} accept={ACCEPT.join(',')} className="sr-only" onChange={e => addFiles(e.target.files)} /></label>
      <button type="button" disabled={disabled} className="rounded-ui-sm border border-ui-border-strong bg-ui-surface px-4 py-2 text-sm text-ui-ink-2 hover:bg-ui-subtle disabled:opacity-50" onClick={() => setPicker(!picker)}>{picker ? 'סגור גלריה' : 'בחירה מהגלריה'}</button>
    </div>
    {picker && <div className="grid max-h-64 min-w-0 grid-cols-2 gap-2 overflow-y-auto overscroll-contain rounded-ui border border-ui-border p-2 sm:grid-cols-3">{media.length === 0 ? <p className="text-sm">אין תמונות זמינות בגלריה</p> : media.map(m => <button type="button" key={m.id} disabled={disabled} onClick={() => toggle(m)} className={cn('relative min-w-0 rounded-ui-sm border-2 p-1', selected.has(m.id) ? 'border-ui-primary' : 'border-ui-border')}><img src={thumbnailImageUrl(m.url)} alt={m.originalName} loading="lazy" className="h-24 w-full object-contain" /><span className="block truncate text-xs">{m.originalName}</span>{selected.has(m.id) && <span className="absolute right-1 top-1 rounded-full bg-ui-primary px-1 text-white">✓</span>}</button>)}</div>}
    {error && <p role="alert" className="text-sm text-ui-danger">{error}</p>}
    {items.length > 0 && <ul className="grid min-w-0 gap-2">
      {items.map(item => {
        const thumbs = item.media ? [thumbnailImageUrl(item.media.url)] : item.pages.map(p => p.preview)
        const pct = item.total ? Math.round((item.done / item.total) * 100) : 0
        return <li key={item.key} className={cn('min-w-0 rounded-ui border p-2.5', item.status === 'error' ? 'border-red-200 bg-ui-danger-soft' : 'border-ui-border')}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              {item.kind === 'pdf' ? <FileText className="h-4 w-4 shrink-0 text-ui-muted" /> : null}
              <span className="truncate text-sm font-medium" title={item.name}>{item.name}</span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {item.status === 'error' && <button type="button" disabled={disabled} onClick={() => enqueue(item.key)} className="inline-flex items-center gap-1 rounded-ui-sm px-2 py-1 text-xs font-medium text-ui-ink-2 hover:bg-ui-subtle"><RotateCcw className="h-3.5 w-3.5" />נסה שוב</button>}
              <button type="button" disabled={disabled} onClick={() => remove(item)} aria-label={`הסרת ${item.name}`} className="inline-flex items-center gap-1 rounded-ui-sm px-2 py-1 text-xs text-ui-danger hover:bg-ui-danger-soft disabled:opacity-50"><X className="h-3.5 w-3.5" />הסר</button>
            </div>
          </div>
          <div role="status" className="mt-1.5 flex items-center gap-2 text-xs">
            {item.status === 'converting' && <><Loader2 className="h-3.5 w-3.5 animate-spin text-ui-primary" /><span>ממיר PDF לעמודים{item.total ? ` · ${item.done} מתוך ${item.total}` : '...'}</span></>}
            {item.status === 'uploading' && <><Loader2 className="h-3.5 w-3.5 animate-spin text-ui-primary" /><span>מעלה{item.total > 1 ? ` עמוד ${Math.min(item.done + 1, item.total)} מתוך ${item.total}` : '...'}</span></>}
            {item.status === 'ready' && <><CheckCircle2 className="h-3.5 w-3.5 text-ui-success" /><span className="text-ui-success">{item.media ? 'מהגלריה · מוכן' : item.kind === 'pdf' ? `${item.pages.length} עמודים מוכנים` : 'מוכן'}</span></>}
            {item.status === 'error' && <><AlertCircle className="h-3.5 w-3.5 text-ui-danger" /><span className="text-ui-danger">{item.error}{item.pages.length ? ` (${item.pages.length} מתוך ${item.total} עמודים הועלו)` : ''}</span></>}
          </div>
          {(item.status === 'converting' || item.status === 'uploading') && <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ui-subtle" aria-hidden="true"><div className="h-full bg-ui-primary transition-all" style={{ width: `${pct}%` }} /></div>}
          {thumbs.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">
            {thumbs.slice(0, 8).map((src, i) => <img key={i} src={src} alt={item.kind === 'pdf' ? `עמוד ${i + 1}` : item.name} className="h-20 w-auto max-w-[120px] rounded-ui-sm border border-ui-border bg-white object-contain" />)}
            {thumbs.length > 8 && <span className="grid h-20 place-items-center rounded-ui-sm border border-ui-border px-3 text-xs text-ui-muted">+{thumbs.length - 8}</span>}
          </div>}
        </li>
      })}
    </ul>}
  </section>
}
