'use client'
import { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { Upload, Trash2, Loader2, ImageIcon, Edit2, Check, X, Plus, FolderOpen, Folder } from 'lucide-react'
import type { MediaLibraryImage, Gallery } from '@/types'

function fmtBytes(b:number){if(b<1024)return b+' B';if(b<1048576)return(b/1024).toFixed(1)+' KB';return(b/1048576).toFixed(1)+' MB'}

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
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadGalleries(); loadImages(null) }, [])

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
      const d = await r.json()
      if (r.ok) {
        setImages(prev => [...(d.data ?? []), ...prev])
        await loadGalleries() // refresh counts
        toast.success('הקבצים הועלו בהצלחה')
      } else { toast.error('העלאת התמונות נכשלה') }
    } catch { toast.error('העלאת התמונות נכשלה') } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('למחוק תמונה זו?')) return
    const res = await fetch('/api/media/' + id, { method: 'DELETE' })
    if (!res.ok) { toast.error('מחיקת התמונה נכשלה'); return }
    toast.success('התמונה נמחקה בהצלחה')
    setImages(prev => prev.filter(img => img.id !== id))
    await loadGalleries()
  }

  async function saveCaption(id: string) {
    const r = await fetch('/api/media/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ caption: editCaption }) })
    if (r.ok) setImages(prev => prev.map(img => img.id === id ? { ...img, caption: editCaption } : img))
    if (r.ok) toast.success('הכיתוב נשמר בהצלחה'); else toast.error('שמירת הכיתוב נכשלה')
    setEditId(null)
  }

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

          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400"/></div>
          ) : images.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <ImageIcon className="w-12 h-12 text-gray-200 mb-3"/>
              <p className="text-gray-500 text-sm">אין קבצים {activeGallery ? 'בתיקייה זו' : 'עדיין'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
              {images.map(img => (
                <div key={img.id} className="group relative bg-white border border-gray-100 rounded-xl overflow-hidden hover:border-gray-300 transition-colors">
                  <div className="aspect-square bg-gray-50">
                    {img.mimeType?.startsWith('video/')?<video src={img.url} muted preload="metadata" className="w-full h-full object-cover"/>:<img src={img.url} alt={img.originalName} className="w-full h-full object-cover"/>}
                  </div>
                  <div className="p-1.5">
                    {editId === img.id ? (
                      <div className="flex items-center gap-1">
                        <input autoFocus type="text" value={editCaption} onChange={e => setEditCaption(e.target.value)}
                          onKeyDown={e => { if(e.key==='Enter')saveCaption(img.id); if(e.key==='Escape')setEditId(null) }}
                          placeholder="כיתוב..." className="flex-1 text-[10px] border border-gray-200 rounded px-1 py-0.5 focus:outline-none min-w-0"/>
                        <button onClick={() => saveCaption(img.id)} className="text-green-500"><Check className="w-3 h-3"/></button>
                        <button onClick={() => setEditId(null)} className="text-gray-400"><X className="w-3 h-3"/></button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-[10px] text-gray-500 truncate">{fmtBytes(img.size)}</p>
                        <button onClick={() => { setEditId(img.id); setEditCaption(img.caption ?? '') }} className="text-gray-300 hover:text-gray-600 shrink-0"><Edit2 className="w-3 h-3"/></button>
                      </div>
                    )}
                  </div>
                  <button onClick={() => handleDelete(img.id)}
                    title="מחק תמונה" className="absolute top-1 right-1 p-1 bg-black/60 rounded-full text-white opacity-80 hover:opacity-100 transition-opacity hover:bg-red-600">
                    <Trash2 className="w-3 h-3"/>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
