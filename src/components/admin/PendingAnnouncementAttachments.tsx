'use client'
import { useEffect, useMemo, useRef, useState } from 'react'

export type PendingMedia = { id:string; url:string; originalName:string }
export type PendingAttachment = { key:string; file?:File; media?:PendingMedia; preview:string }
type MediaResponse = {data?:PendingMedia[];error?:string}
export default function PendingAnnouncementAttachments({items,onChange}:{items:PendingAttachment[];onChange:(items:PendingAttachment[])=>void}){
  const [media,setMedia]=useState<PendingMedia[]>([])
  const [picker,setPicker]=useState(false)
  const [error,setError]=useState('')
  const fileRef=useRef<HTMLInputElement>(null)
  useEffect(()=>{fetch('/api/media',{cache:'no-store'}).then(async r=>{const d=await r.json() as MediaResponse;if(!r.ok)throw Error(d.error||'שגיאה בטעינת הגלריה');setMedia(d.data??[])}).catch(e=>setError(e.message))},[])
  const previewsRef=useRef<string[]>([])
  useEffect(()=>()=>{for(const url of previewsRef.current)URL.revokeObjectURL(url)},[])
  const selected=useMemo(()=>new Set(items.map(a=>a.media?.id).filter(Boolean)),[items])
  function addFiles(files:FileList|null){if(!files)return;const next:PendingAttachment[]=[];for(const file of Array.from(files)){
    if(!['image/jpeg','image/png','image/webp','image/gif','application/pdf'].includes(file.type)){setError(`סוג קובץ לא נתמך: ${file.name}`);continue}
    if(file.size>(file.type==='application/pdf'?20:10)*1024*1024){setError(`הקובץ גדול מדי: ${file.name}`);continue}
    const preview=file.type.startsWith('image/')?URL.createObjectURL(file):'';if(preview)previewsRef.current.push(preview);next.push({key:crypto.randomUUID(),file,preview})
  }onChange([...items,...next]);if(fileRef.current)fileRef.current.value=''}
  function toggle(m:PendingMedia){const old=items.find(a=>a.media?.id===m.id);onChange(old?items.filter(a=>a!==old):[...items,{key:crypto.randomUUID(),media:m,preview:m.url}])}
  return <section className="border rounded-xl p-3 sm:p-4 space-y-3 min-w-0 max-w-full overflow-x-hidden" dir="rtl">
    <h2 className="font-semibold">תמונות וקבצים מצורפים</h2>
    <p className="text-xs text-gray-600">ניתן לצרף לפני שמירת ההודעה. הקבצים יועלו כאשר תלחץ על ״שמור הודעה״.</p>
    <div className="flex gap-2 flex-wrap"><label className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-white text-sm">העלאת תמונות / PDF<input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" className="sr-only" onChange={e=>addFiles(e.target.files)}/></label><button type="button" className="border rounded-lg px-4 py-2 text-sm" onClick={()=>setPicker(!picker)}>{picker?'סגור גלריה':'בחירה מהגלריה'}</button></div>
    {picker&&<div className="grid grid-cols-2 sm:grid-cols-3 gap-2 min-w-0 max-h-64 overflow-y-auto overscroll-contain rounded-lg border p-2">{media.length===0?<p className="text-sm">אין תמונות זמינות בגלריה</p>:media.map(m=><button type="button" key={m.id} onClick={()=>toggle(m)} className={`relative rounded-lg border-2 p-1 min-w-0 ${selected.has(m.id)?'border-blue-600':'border-gray-200'}`}><img src={m.url} alt={m.originalName} loading="lazy" className="w-full h-24 object-contain"/><span className="block text-xs truncate">{m.originalName}</span>{selected.has(m.id)&&<span className="absolute top-1 right-1 bg-blue-600 text-white rounded-full px-1">✓</span>}</button>)}</div>}
    {error&&<p role="alert" className="text-red-600 text-sm">{error}</p>}
    {items.length>0&&<div className="grid grid-cols-2 sm:grid-cols-3 gap-2 min-w-0">{items.map(a=><div key={a.key} className="border rounded-lg p-2 min-w-0">{a.preview?<img src={a.preview} alt={a.file?.name||a.media?.originalName} className="w-full h-28 object-contain"/>:<div className="h-28 flex items-center justify-center bg-red-50 text-red-700">PDF</div>}<p className="truncate text-xs" title={a.file?.name||a.media?.originalName}>{a.file?.name||a.media?.originalName}</p><div className="flex justify-between text-xs mt-2"><span className="text-amber-700">ממתין לשמירה</span><button type="button" className="text-red-600" onClick={()=>onChange(items.filter(v=>v.key!==a.key))}>הסר</button></div></div>)}</div>}
  </section>
}
