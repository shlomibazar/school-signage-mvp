'use client'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, Folder, FolderOpen, ImageIcon, Loader2, Upload } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { mediaThumbnailSrc } from '@/lib/mediaThumbnail'
import { MAX_BYTES } from '@/lib/uploadValidation'

// Image picker over the school's existing Media Library (same folders, upload endpoint and thumbnail
// route as the Media Library page). Nothing is fetched until it opens; the root shows folders only,
// and a folder's images load when it is opened, one page at a time, as small thumbnails.

export type PickedMedia = { id: string; url: string }
type Item = { id: string; url: string; originalName: string; mimeType?: string | null }
type FolderInfo = { id: string; name: string; fileCount?: number }
const UNFILED: FolderInfo = { id: 'none', name: 'ללא תיקייה' }
const PAGE = 48
const TTL = 60_000
const IMAGE_TYPES = 'image/jpeg,image/png,image/webp,image/gif,image/svg+xml'

// Short-lived cache shared by every picker on the page: reopening it or switching back to a folder
// does not refetch; an upload invalidates it.
let folderCache: { at: number; data: FolderInfo[] } | null = null
const pageCache = new Map<string, { at: number; items: Item[]; next: string | null }>()
const fresh = (at: number) => Date.now() - at < TTL
function invalidate() { folderCache = null; pageCache.clear() }

async function getJson(url: string, signal?: AbortSignal) {
  const r = await fetch(url, { signal })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || 'הטעינה נכשלה')
  return d
}

export default function MediaImagePicker({ open, onClose, onSelect, selectedUrl }: {
  open: boolean; onClose: () => void; onSelect: (media: PickedMedia) => void; selectedUrl?: string | null
}) {
  const [tab, setTab] = useState<'library' | 'upload'>('library')
  const [folders, setFolders] = useState<FolderInfo[] | null>(null)
  const [folder, setFolder] = useState<FolderInfo | null>(null)
  const [items, setItems] = useState<Item[] | null>(null)
  const [next, setNext] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [pick, setPick] = useState<PickedMedia | null>(null)
  const request = useRef<AbortController | null>(null)

  // Folders: once per opening (cached for a minute).
  useEffect(() => {
    if (!open) return
    setTab('library'); setFolder(null); setItems(null); setPick(null); setError('')
    if (folderCache && fresh(folderCache.at)) { setFolders(folderCache.data); return }
    const ctrl = new AbortController()
    getJson('/api/galleries', ctrl.signal)
      .then(d => { const data = ((d.data ?? []) as FolderInfo[]).map(({ id, name, fileCount }) => ({ id, name, fileCount })); folderCache = { at: Date.now(), data }; setFolders(data) })
      .catch(e => { if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : 'טעינת התיקיות נכשלה') })
    return () => ctrl.abort()
  }, [open])
  useEffect(() => () => request.current?.abort(), [])

  // One folder page. A newer request (another folder, or closing) aborts the previous one.
  const load = useCallback((f: FolderInfo, cursor: string | null) => {
    request.current?.abort()
    const ctrl = new AbortController(); request.current = ctrl
    setLoading(true); setError('')
    const url = `/api/media?type=image&take=${PAGE}&galleryId=${encodeURIComponent(f.id)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
    getJson(url, ctrl.signal).then(d => {
      if (ctrl.signal.aborted) return
      const page = ((d.data ?? []) as Item[]).map(({ id, url, originalName, mimeType }) => ({ id, url, originalName, mimeType }))
      setItems(prev => {
        const all = cursor && prev ? [...prev, ...page] : page
        pageCache.set(f.id, { at: Date.now(), items: all, next: d.nextCursor ?? null })
        return all
      })
      setNext(d.nextCursor ?? null)
    }).catch(e => { if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : 'טעינת התמונות נכשלה') })
      .finally(() => { if (request.current === ctrl) setLoading(false) })
  }, [])

  const openFolder = useCallback((f: FolderInfo | null) => {
    request.current?.abort(); setLoading(false); setError('')
    setFolder(f)
    if (!f) { setItems(null); return }
    const cached = pageCache.get(f.id)
    if (cached && fresh(cached.at)) { setItems(cached.items); setNext(cached.next); return }
    setItems(null); setNext(null); load(f, null)
  }, [load])

  const choose = useCallback((m: Item) => setPick({ id: m.id, url: m.url }), [])
  const current = pick?.url ?? selectedUrl ?? null
  const uploaded = (m: PickedMedia) => { invalidate(); onSelect(m); onClose() }

  return (
    <Modal open={open} onClose={onClose} title="בחירת תמונת רקע" size="xl">
      <div role="tablist" aria-label="מקור התמונה" className="mb-4 grid grid-cols-2 gap-1.5">
        {([['library', 'מספריית המדיה', FolderOpen], ['upload', 'העלאה מהמחשב', Upload]] as const).map(([t, label, Icon]) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={cn('ui-focus flex h-10 items-center justify-center gap-2 rounded-ui-sm border text-sm font-medium', tab === t ? 'border-ui-primary bg-ui-primary-soft text-ui-primary-ink' : 'border-ui-border text-ui-ink-2 hover:bg-ui-subtle')}>
            <Icon className="h-4 w-4" aria-hidden="true" />{label}
          </button>
        ))}
      </div>

      {tab === 'upload' ? <UploadPane folders={folders} defaultFolder={folder && folder.id !== 'none' ? folder.id : ''} onUploaded={uploaded} /> : (
        <div className="grid gap-3">
          <nav aria-label="מיקום בספרייה" className="flex min-h-8 items-center gap-1 text-sm">
            <button type="button" onClick={() => openFolder(null)} disabled={!folder} className={cn('ui-focus rounded px-1.5 py-0.5', folder ? 'text-ui-primary hover:bg-ui-subtle' : 'font-semibold text-ui-ink')}>ספריית מדיה</button>
            {folder && <><ChevronLeft className="h-4 w-4 text-ui-muted" aria-hidden="true" /><span className="truncate font-semibold text-ui-ink" aria-current="page">{folder.name}</span></>}
          </nav>
          {error && <p role="alert" className="rounded-ui-sm bg-ui-danger-soft px-3 py-2 text-sm text-ui-danger">{error}</p>}

          {!folder ? (
            folders === null ? (!error && <Pending text="טוען תיקיות…" />) : (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[...folders, UNFILED].map(f => (
                  <li key={f.id}>
                    <button type="button" onClick={() => openFolder(f)} className="ui-focus flex w-full items-center gap-2.5 rounded-ui-sm border border-ui-border px-3 py-2.5 text-right hover:bg-ui-subtle">
                      <Folder className="h-5 w-5 shrink-0 text-ui-primary" aria-hidden="true" />
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-ui-ink">{f.name}</span>
                        {f.fileCount !== undefined && <span className="block text-xs text-ui-muted">{f.fileCount} קבצים</span>}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : items === null ? (!error && <Pending text="טוען תמונות…" />) : items.length === 0 ? (
            <p className="py-6 text-center text-sm text-ui-muted">אין תמונות בתיקייה הזו.</p>
          ) : (
            <>
              <div role="listbox" aria-label={`תמונות בתיקייה ${folder.name}`} className="grid max-h-[46dvh] grid-cols-3 gap-2 overflow-y-auto p-0.5 sm:grid-cols-4">
                {items.map(m => <Thumb key={m.id} item={m} selected={current === m.url} onPick={choose} />)}
              </div>
              {next && <Button type="button" variant="secondary" size="sm" loading={loading} onClick={() => load(folder, next)} className="justify-self-center">טעינת תמונות נוספות</Button>}
            </>
          )}

          <div className="flex items-center justify-between gap-2 border-t border-ui-border pt-3">
            <span className="flex min-w-0 items-center gap-1.5 text-xs text-ui-muted"><ImageIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{pick ? 'נבחרה תמונה חדשה' : 'בחרו תמונה מתוך תיקייה'}</span>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>ביטול</Button>
              <Button type="button" variant="primary" disabled={!pick} onClick={() => { if (pick) { onSelect(pick); onClose() } }}>אישור</Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

function Pending({ text }: { text: string }) {
  return <p className="flex items-center justify-center gap-2 py-6 text-sm text-ui-muted"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{text}</p>
}

const Thumb = memo(function Thumb({ item, selected, onPick }: { item: Item; selected: boolean; onPick: (m: Item) => void }) {
  const svg = item.mimeType === 'image/svg+xml'
  return (
    <button type="button" role="option" aria-selected={selected} onClick={() => onPick(item)} title={item.originalName}
      className={cn('ui-focus relative aspect-video overflow-hidden rounded-ui-sm border-2 bg-ui-subtle', selected ? 'border-ui-primary ring-2 ring-ui-primary/30' : 'border-transparent hover:border-ui-border-strong')}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={mediaThumbnailSrc(item)} alt={item.originalName} loading="lazy" decoding="async" draggable={false} className={cn('h-full w-full', svg ? 'object-contain p-1' : 'object-cover')} />
      {selected && <span className="absolute left-1 top-1 rounded-full bg-ui-primary px-1.5 text-[11px] font-semibold text-white">נבחרה</span>}
    </button>
  )
})

// Upload one image into a folder of the library through the existing upload endpoint, with progress.
// The stored image is selected right away.
function UploadPane({ folders, defaultFolder, onUploaded }: { folders: FolderInfo[] | null; defaultFolder: string; onUploaded: (m: PickedMedia) => void }) {
  const [target, setTarget] = useState(defaultFolder)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState('')
  const xhr = useRef<XMLHttpRequest | null>(null)
  useEffect(() => () => xhr.current?.abort(), [])

  function upload(file: File | undefined) {
    if (!file) return
    setError('')
    if (!IMAGE_TYPES.split(',').includes(file.type)) { setError('אפשר להעלות תמונות בלבד (JPG, PNG, WebP, GIF, SVG).'); return }
    if (file.size > MAX_BYTES.image) { setError('התמונה גדולה מדי (עד 10MB).'); return }
    const fd = new FormData()
    fd.append('file', file)
    if (target) fd.append('galleryId', target)
    const req = new XMLHttpRequest(); xhr.current = req
    req.open('POST', '/api/media')
    req.upload.onprogress = e => { if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100)) }
    req.onload = () => {
      setProgress(null)
      let d: { data?: PickedMedia[]; results?: { ok: boolean; error?: string }[]; error?: string } = {}
      try { d = JSON.parse(req.responseText) } catch {}
      const stored = d.data?.[0]
      if (req.status === 201 && stored) { onUploaded({ id: stored.id, url: stored.url }); return }
      setError(d.results?.find(r => !r.ok)?.error || (req.status === 413 ? 'הקובץ גדול מדי' : d.error) || 'ההעלאה נכשלה')
    }
    req.onerror = () => { setProgress(null); setError('ההעלאה נכשלה. בדקו את החיבור ונסו שוב.') }
    setProgress(0)
    req.send(fd)
  }

  const busy = progress !== null
  return (
    <div className="grid gap-3">
      <label className="grid gap-1"><span className="text-xs font-medium text-ui-ink-2">תיקייה בספריית המדיה</span>
        <select value={target} onChange={e => setTarget(e.target.value)} disabled={busy} className="ui-focus h-9 rounded-ui-sm border border-ui-border-strong bg-ui-surface px-2 text-sm">
          <option value="">ללא תיקייה</option>
          {(folders ?? []).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </label>
      <label className={cn('flex cursor-pointer flex-col items-center justify-center gap-2 rounded-ui-lg border-2 border-dashed border-ui-border-strong px-4 py-8 text-center hover:bg-ui-subtle', busy && 'pointer-events-none opacity-70')}>
        <Upload className="h-6 w-6 text-ui-primary" aria-hidden="true" />
        <span className="text-sm font-medium text-ui-ink">בחירת תמונה מהמחשב</span>
        <span className="text-xs text-ui-muted">JPG, PNG, WebP, GIF או SVG, עד 10MB. התמונה תישמר בספריית המדיה ותיבחר כרקע.</span>
        <input type="file" accept={IMAGE_TYPES} className="sr-only" disabled={busy} onChange={e => { upload(e.target.files?.[0]); e.target.value = '' }} />
      </label>
      {busy && (
        <div className="grid gap-1" aria-live="polite">
          <div className="h-2 overflow-hidden rounded-full bg-ui-subtle"><div className="h-full bg-ui-primary transition-[width]" style={{ width: `${progress}%` }} /></div>
          <span className="text-xs text-ui-muted">{progress! < 100 ? `מעלה… ${progress}%` : 'שומר בספריית המדיה…'}</span>
        </div>
      )}
      {error && <p role="alert" className="rounded-ui-sm bg-ui-danger-soft px-3 py-2 text-sm text-ui-danger">{error}</p>}
    </div>
  )
}
