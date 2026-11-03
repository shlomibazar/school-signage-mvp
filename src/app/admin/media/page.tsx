'use client'
import { useState, useEffect, useRef, useCallback, memo } from 'react'
import toast from 'react-hot-toast'
import { Upload, Trash2, Loader2, ImageIcon, Edit2, Check, X, Plus, FolderOpen, Folder } from 'lucide-react'
import type { MediaLibraryImage, Gallery } from '@/types'

function fmtBytes(b:number){if(b<1024)return b+' B';if(b<1048576)return(b/1024).toFixed(1)+' KB';return(b/1048576).toFixed(1)+' MB'}

// Clicks on controls inside a card (delete, caption edit) must not change the selection.
const CONTROL_SELECTOR='button,input,select,textarea,a,label'
const isControl=(target:EventTarget|null)=>target instanceof Element&&!!target.closest(CONTROL_SELECTOR)

// Stable function identity that always calls the latest implementation, so memoized cards
// are not re-rendered just because the parent re-rendered.
function useStableCallback<A extends unknown[],R>(fn:(...args:A)=>R){
  const ref=useRef(fn)
  ref.current=fn
  return useCallback((...args:A)=>ref.current(...args),[])
}

type CardProps={
  img:MediaLibraryImage
  isSelected:boolean
  isEditing:boolean
  editCaption:string
  onSelect:(id:string,e:React.MouseEvent)=>void
  onDelete:(id:string)=>void
  onStartEdit:(img:MediaLibraryImage)=>void
  onCaptionChange:(value:string)=>void
  onSaveCaption:(id:string)=>void
  onCancelEdit:()=>void
}
const MediaCard=memo(function MediaCard({img,isSelected,isEditing,editCaption,onSelect,onDelete,onStartEdit,onCaptionChange,onSaveCaption,onCancelEdit}:CardProps){
  const [broken,setBroken]=useState(false)
  const isVideo=img.mimeType?.startsWith('video/')
  // SVGs are not rasterized by the thumbnail route; show the original through <img>, where
  // browsers never run scripts or load external resources from SVG.
  const src=img.mimeType==='image/svg+xml'?img.url:`/api/media/thumbnail/${encodeURIComponent(img.id)}`
  return <div data-media-id={img.id} onClick={e=>{if(!isControl(e.target))onSelect(img.id,e)}}
    style={{contentVisibility:'auto',containIntrinsicSize:'auto 180px'}}
    className={`group relative bg-white border-2 rounded-xl overflow-hidden cursor-pointer transition-colors ${isSelected?"border-blue-500 ring-2 ring-blue-200":"border-gray-100 hover:border-gray-300"}`}>
    <div className="aspect-square bg-gray-50">
      {isVideo?<video src={img.url} muted preload="metadata" className="w-full h-full object-cover"/>
        :broken?<div className="w-full h-full flex items-center justify-center text-gray-300" title={img.originalName}><ImageIcon className="w-8 h-8"/></div>
        :<img src={src} alt={img.originalName} loading="lazy" decoding="async" draggable={false} onError={()=>setBroken(true)} className={`w-full h-full ${img.mimeType==='image/svg+xml'?'object-contain p-2':'object-cover'}`}/>}
    </div>
    <div className="p-1.5">
      {isEditing ? (
        <div className="flex items-center gap-1">
          <input autoFocus type="text" value={editCaption} onChange={e => onCaptionChange(e.target.value)}
            onKeyDown={e => { if(e.key==='Enter')onSaveCaption(img.id); if(e.key==='Escape')onCancelEdit() }}
            placeholder="כיתוב..." className="flex-1 text-[10px] border border-gray-200 rounded px-1 py-0.5 focus:outline-none min-w-0"/>
          <button onClick={() => onSaveCaption(img.id)} className="text-green-500"><Check className="w-3 h-3"/></button>
          <button onClick={onCancelEdit} className="text-gray-400"><X className="w-3 h-3"/></button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-1">
          <p className="text-[10px] text-gray-500 truncate">{fmtBytes(img.size)}</p>
          <button onClick={() => onStartEdit(img)} className="text-gray-300 hover:text-gray-600 shrink-0"><Edit2 className="w-3 h-3"/></button>
        </div>
      )}
    </div>
    <button onClick={() => onDelete(img.id)}
      title="מחק תמונה" className="absolute top-1 right-1 p-1 bg-black/60 rounded-full text-white opacity-80 hover:opacity-100 transition-opacity hover:bg-red-600">
      <Trash2 className="w-3 h-3"/>
    </button>
  </div>
})

export default function MediaPage() {
  const [galleries,    setGalleries]    = useState<Gallery[]>([])
  const [images,       setImages]       = useState<MediaLibraryImage[]>([])
  const [activeGallery,setActiveGallery]= useState<string|null>(null) // null = all
  const [loading,      setLoading]      = useState(true)
  const [uploading,    setUploading]    = useState(false)
  const [editId,       setEditId]       = useState<string|null>(null)
  const [editCaption,  setEditCaption]  = useState('')
  const [newFolderName,setNewFolderName]= useState('')
  const [creatingFolder,setCreatingFolder]= useState(false)
  const [editFolderId, setEditFolderId] = useState<string|null>(null)
  const [editFolderName,setEditFolderName]= useState('')
  const [selected,setSelected] = useState<Set<string>>(new Set())
  const [anchor,setAnchor] = useState<string|null>(null)
  const [destination,setDestination] = useState('')
  const [busy,setBusy] = useState(false)
  const drag = useRef<{x:number;y:number;add:boolean}|null>(null)
  // The rubber-band rectangle lives in a ref and is drawn by mutating the overlay's style,
  // so mouse moves never re-render the grid.
  const rectRef = useRef<{x:number;y:number;w:number;h:number}|null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<number|null>(null)
  // A drag that ends over a card is followed by a click on it; ignore that one click.
  const suppressClickRef = useRef(false)
  const gridRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadGalleries(); loadImages(null) }, [])
  useEffect(() => () => { if (frameRef.current !== null) cancelAnimationFrame(frameRef.current) }, [])

  // Keep the selection limited to items that are still in the current view
  // (covers single delete, folder delete, bulk move out of a folder, reloads).
  useEffect(() => {
    const visible = new Set(images.map(i => i.id))
    setSelected(prev => {
      let changed = false
      for (const id of prev) if (!visible.has(id)) { changed = true; break }
      return changed ? new Set([...prev].filter(id => visible.has(id))) : prev
    })
    setAnchor(prev => prev && !visible.has(prev) ? null : prev)
  }, [images])

  async function loadGalleries() {
    const r = await fetch('/api/galleries')
    const d = await r.json()
    setGalleries(d.data ?? [])
  }

  async function loadImages(galleryId: string|null) {
    setLoading(true)
    try {
      const url = galleryId ? `/api/media?galleryId=${galleryId}` : '/api/media'
      const r = await fetch(url)
      const d = await r.json()
      setImages(d.data ?? [])
    } finally { setLoading(false) }
  }

  async function switchGallery(id: string|null) {
    setSelected(new Set()); setAnchor(null)
    setActiveGallery(id)
    await loadImages(id)
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setUploading(true)
    try {
      const fd = new FormData()
      files.forEach(f => fd.append('file', f))
      if (activeGallery) fd.append('galleryId', activeGallery)
      const r = await fetch('/api/media', { method: 'POST', body: fd })
      const d = await r.json().catch(() => ({})) as { data?: MediaLibraryImage[]; results?: { name: string; ok: boolean; error?: string }[]; error?: string }
      const failed = (d.results ?? []).filter(x => !x.ok)
      const stored = d.data ?? []
      if (stored.length) {
        setImages(prev => [...stored, ...prev])
        await loadGalleries() // refresh counts
        toast.success(failed.length ? `${stored.length} מתוך ${files.length} קבצים הועלו` : stored.length === 1 ? 'הקובץ הועלה בהצלחה' : `${stored.length} קבצים הועלו בהצלחה`)
      }
      // Every rejected file is named with its reason; nothing is reported as uploaded unless it was stored.
      if (failed.length) toast.error(failed.map(x => `${x.name}: ${x.error}`).join('\n'), { duration: 8000, style: { whiteSpace: 'pre-line' } })
      else if (!stored.length) toast.error(r.status === 413 ? 'הקבצים גדולים מדי' : d.error || 'העלאת הקבצים נכשלה')
    } catch { toast.error('העלאת הקבצים נכשלה') } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleDelete = useStableCallback(async (id: string) => {
    if (!confirm('למחוק תמונה זו?')) return
    const res = await fetch('/api/media/' + id, { method: 'DELETE' })
    if (!res.ok) { toast.error('מחיקת התמונה נכשלה'); return }
    toast.success('התמונה נמחקה בהצלחה')
    setImages(prev => prev.filter(img => img.id !== id))
    await loadGalleries()
  })

  const selectImage = useStableCallback((id:string,e:React.MouseEvent) => {
    if(suppressClickRef.current){suppressClickRef.current=false;return}
    if(e.shiftKey && anchor){const a=images.findIndex(i=>i.id===anchor),b=images.findIndex(i=>i.id===id);if(a>=0&&b>=0){setSelected(prev=>new Set([...prev,...images.slice(Math.min(a,b),Math.max(a,b)+1).map(i=>i.id)]));return}}
    if(e.ctrlKey||e.metaKey){setSelected(prev=>{const n=new Set(prev);n.has(id)?n.delete(id):n.add(id);return n})}
    else setSelected(new Set([id]));
    setAnchor(id)
  })
  const startEdit = useStableCallback((img:MediaLibraryImage) => { setEditId(img.id); setEditCaption(img.caption ?? '') })
  const cancelEdit = useStableCallback(() => setEditId(null))
  const changeCaption = useStableCallback((value:string) => setEditCaption(value))

  function drawRectangle(){
    frameRef.current=null
    const el=overlayRef.current,rect=rectRef.current
    if(!el)return
    if(!rect){el.style.display='none';return}
    el.style.display='block';el.style.left=`${rect.x}px`;el.style.top=`${rect.y}px`;el.style.width=`${rect.w}px`;el.style.height=`${rect.h}px`
  }
  function scheduleDraw(){if(frameRef.current===null)frameRef.current=requestAnimationFrame(drawRectangle)}
  function beginDrag(e:React.MouseEvent<HTMLDivElement>){
    // Starts anywhere in the grid area, including the empty padding around the cards.
    if(e.button!==0||!gridRef.current||isControl(e.target))return
    suppressClickRef.current=false
    const r=gridRef.current.getBoundingClientRect()
    drag.current={x:e.clientX-r.left,y:e.clientY-r.top,add:e.ctrlKey||e.metaKey}
    rectRef.current={x:drag.current.x,y:drag.current.y,w:0,h:0}
  }
  function moveDrag(e:React.MouseEvent<HTMLDivElement>){
    if(!drag.current||!gridRef.current)return
    const r=gridRef.current.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,d=drag.current
    rectRef.current={x:Math.min(x,d.x),y:Math.min(y,d.y),w:Math.abs(x-d.x),h:Math.abs(y-d.y)}
    scheduleDraw()
  }
  function endDrag(){
    const d=drag.current,rect=rectRef.current,grid=gridRef.current
    drag.current=null;rectRef.current=null;scheduleDraw()
    if(!d||!rect||!grid||(rect.w<5&&rect.h<5))return
    const root=grid.getBoundingClientRect()
    const ids:string[]=[]
    // One DOM query for all cards instead of one lookup per image.
    grid.querySelectorAll<HTMLElement>('[data-media-id]').forEach(el=>{
      const b=el.getBoundingClientRect(),x=b.left-root.left,y=b.top-root.top
      if(x<rect.x+rect.w&&x+b.width>rect.x&&y<rect.y+rect.h&&y+b.height>rect.y)ids.push(el.dataset.mediaId!)
    })
    suppressClickRef.current=true
    // Clear the flag if no click follows (mouse released outside a card).
    setTimeout(()=>{suppressClickRef.current=false},0)
    setSelected(prev=>new Set([...(d.add?prev:[]),...ids]))
  }
  async function bulkAction(action:'delete'|'move'){
    const ids=[...selected];if(!ids.length)return;
    if(action==='delete'&&!confirm(`למחוק ${ids.length} פריטים?`))return;
    if(action==='move'&&!destination){toast.error('יש לבחור תיקיית יעד');return}
    setBusy(true)
    try{const r=await fetch('/api/media/bulk',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids,action,galleryId:destination})});if(!r.ok)throw Error();await loadImages(activeGallery);await loadGalleries();setSelected(new Set());toast.success('הפעולה הושלמה')}catch{toast.error('הפעולה נכשלה')}finally{setBusy(false)}
  }

  const saveCaption = useStableCallback(async (id: string) => {
    const r = await fetch('/api/media/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ caption: editCaption }) })
    if (r.ok) setImages(prev => prev.map(img => img.id === id ? { ...img, caption: editCaption } : img))
    if (r.ok) toast.success('הכיתוב נשמר בהצלחה'); else toast.error('שמירת הכיתוב נכשלה')
    setEditId(null)
  })

  async function createFolder() {
    if (!newFolderName.trim()) return
    const r = await fetch('/api/galleries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newFolderName.trim() }) })
    const d = await r.json()
    if (r.ok) { setGalleries(prev => [d.data, ...prev]); setNewFolderName(''); setCreatingFolder(false); toast.success('התיקייה נוצרה בהצלחה') } else toast.error('יצירת התיקייה נכשלה')
  }

  async function saveFolder(id: string) {
    const r = await fetch('/api/galleries/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: editFolderName }) })
    const d = await r.json()
    if (r.ok) setGalleries(prev => prev.map(g => g.id === id ? { ...g, name: d.data.name } : g))
    if (r.ok) toast.success('שם התיקייה נשמר'); else toast.error('שמירת שם התיקייה נכשלה')
    setEditFolderId(null)
  }

  async function deleteFolder(id: string) {
    const folder = galleries.find(g => g.id === id)
    if (!confirm(`למחוק לצמיתות את התיקייה \"${folder?.name ?? ''}\" ואת כל ${folder?.fileCount ?? ''} התמונות שבתוכה? פעולה זו אינה ניתנת לביטול.`)) return
    const res = await fetch('/api/galleries/' + id, { method: 'DELETE' })
    if (!res.ok) { toast.error('מחיקת התיקייה נכשלה'); return }
    toast.success('התיקייה וכל התמונות שבתוכה נמחקו')
    setGalleries(prev => prev.filter(g => g.id !== id))
    if (activeGallery === id) { setActiveGallery(null); await loadImages(null) } else await loadImages(activeGallery)
  }

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">ספריית מדיה</h1>
          <p className="text-sm text-gray-500 mt-0.5">{images.length} תמונות</p>
        </div>
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {uploading ? <><Loader2 className="w-4 h-4 animate-spin"/>מעלה...</> : <><Upload className="w-4 h-4"/>העלאת תמונות וסרטונים</>}
        </button>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml,video/mp4,video/webm" multiple className="hidden" onChange={handleUpload}/>
      </div>

      <div className="flex gap-6">
        {/* Sidebar: folders */}
        <div className="w-52 shrink-0 space-y-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">תיקיות</span>
            <button onClick={() => setCreatingFolder(v => !v)} className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
              <Plus className="w-3.5 h-3.5"/>
            </button>
          </div>

          {creatingFolder && (
            <div className="flex items-center gap-1 mb-2">
              <input autoFocus type="text" value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') setCreatingFolder(false) }}
                placeholder="שם תיקייה..." className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 min-w-0"/>
              <button onClick={createFolder} className="p-1.5 bg-blue-500 text-white rounded-lg"><Check className="w-3 h-3"/></button>
              <button onClick={() => setCreatingFolder(false)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg"><X className="w-3 h-3"/></button>
            </div>
          )}

          {/* All images */}
          <button onClick={() => switchGallery(null)}
            className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm transition-colors ${activeGallery === null ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
            <ImageIcon className="w-4 h-4 shrink-0"/>
            <span className="flex-1 text-right truncate">כל התמונות</span>
          </button>

          {galleries.map(g => (
            <div key={g.id} className="group relative">
              {editFolderId === g.id ? (
                <div className="flex items-center gap-1 px-1">
                  <input autoFocus type="text" value={editFolderName} onChange={e => setEditFolderName(e.target.value)}
                    onKeyDown={e => { if(e.key==='Enter')saveFolder(g.id); if(e.key==='Escape')setEditFolderId(null) }}
                    className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 min-w-0"/>
                  <button onClick={() => saveFolder(g.id)} className="p-1 bg-blue-500 text-white rounded"><Check className="w-3 h-3"/></button>
                  <button onClick={() => setEditFolderId(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded"><X className="w-3 h-3"/></button>
                </div>
              ) : (
                <button onClick={() => switchGallery(g.id)}
                  className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm transition-colors ${activeGallery === g.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}>
                  {activeGallery === g.id ? <FolderOpen className="w-4 h-4 shrink-0 text-blue-500"/> : <Folder className="w-4 h-4 shrink-0 text-amber-500"/>}
                  <span className="flex-1 text-right truncate">{g.name}</span>
                  <span className="text-[10px] text-gray-400 shrink-0">{g.fileCount ?? 0}</span>
                </button>
              )}
              {editFolderId !== g.id && (
                <div className="absolute left-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 bg-white/90 rounded-md">
                  <button onClick={() => { setEditFolderId(g.id); setEditFolderName(g.name) }} className="p-1 text-gray-300 hover:text-blue-500 rounded"><Edit2 className="w-3 h-3"/></button>
                  <button onClick={() => deleteFolder(g.id)} className="p-1 text-gray-300 hover:text-red-500 rounded"><Trash2 className="w-3 h-3"/></button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Main: images grid */}
        <div className="flex-1 min-w-0">
          <div onClick={() => fileRef.current?.click()}
            className="mb-4 flex items-center justify-center gap-3 py-6 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400 text-sm cursor-pointer hover:border-blue-300 hover:text-blue-500 transition-colors">
            <Upload className="w-5 h-5"/>
            {activeGallery ? `העלה לתיקייה "${galleries.find(g=>g.id===activeGallery)?.name}"` : 'העלה תמונות וסרטונים · ניתן לבחור כמה קבצים'}
          </div>

          {selected.size>0&&<div className="flex flex-wrap items-center gap-2 mb-3 p-2 rounded-xl bg-blue-50 text-sm" dir="rtl"><span>{selected.size} נבחרו</span><button onClick={()=>setSelected(new Set())} className="px-2 py-1 bg-white rounded">בטל בחירה</button><select value={destination} onChange={e=>setDestination(e.target.value)} className="p-1 border rounded"><option value="">בחר תיקיית יעד</option>{galleries.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select><button disabled={busy||!destination} onClick={()=>bulkAction('move')} className="px-2 py-1 bg-blue-600 text-white rounded disabled:opacity-50">העבר לתיקייה</button><button disabled={busy} onClick={()=>bulkAction('delete')} className="px-2 py-1 bg-red-600 text-white rounded">מחק נבחרים</button></div>}
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400"/></div>
          ) : images.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <ImageIcon className="w-12 h-12 text-gray-200 mb-3"/>
              <p className="text-gray-500 text-sm">אין קבצים {activeGallery ? 'בתיקייה זו' : 'עדיין'}</p>
            </div>
          ) : (
            <div ref={gridRef} onMouseDown={beginDrag} onMouseMove={moveDrag} onMouseUp={endDrag} onMouseLeave={endDrag} className="relative min-h-[640px] px-12 py-14 select-none">
              <div ref={overlayRef} className="absolute z-20 pointer-events-none border border-blue-500 bg-blue-400/20" style={{display:'none'}}/>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
              {images.map(img => (
                <MediaCard key={img.id} img={img} isSelected={selected.has(img.id)} isEditing={editId===img.id}
                  editCaption={editId===img.id?editCaption:''} onSelect={selectImage} onDelete={handleDelete}
                  onStartEdit={startEdit} onCaptionChange={changeCaption} onSaveCaption={saveCaption} onCancelEdit={cancelEdit}/>
              ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
