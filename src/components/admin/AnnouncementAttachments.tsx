'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { pdfPages } from '@/lib/pdfPages'
import { thumbnailImageUrl } from '@/lib/imageDelivery'

type Attachment = {id:string;kind:string;url:string;originalName:string}
type Media = {id:string;originalName:string;url:string}
// refreshToken: bump to re-fetch saved attachments (e.g. after the form uploaded pending files).
// disabled: locks the controls while the parent form is saving. onBusyChange: reports own uploads to the form.
export default function AnnouncementAttachments({announcementId,refreshToken=0,disabled=false,onBusyChange}:{announcementId:string;refreshToken?:number;disabled?:boolean;onBusyChange?:(busy:boolean)=>void}) {
  const [items,setItems] = useState<Attachment[]>([])
  const [media,setMedia] = useState<Media[]>([])
  const [selected,setSelected] = useState<string[]>([])
  const [picker,setPicker] = useState(false)
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const [notice,setNotice] = useState('')
  const inputRef=useRef<HTMLInputElement>(null)
  const endpoint=`/api/announcements/${announcementId}/attachments`
  const reload=useCallback(async()=>{
    const response=await fetch(endpoint,{cache:'no-store'})
    const payload=await response.json().catch(()=>({}))
    if(!response.ok)throw new Error(payload.error||`שגיאה בטעינת קבצים (${response.status})`)
    setItems(payload.data??[])
  },[endpoint])
  const locked=busy||disabled
  useEffect(()=>{onBusyChange?.(busy)},[busy,onBusyChange])
  useEffect(()=>()=>onBusyChange?.(false),[onBusyChange])
  useEffect(()=>{void reload().catch(e=>setError(e.message))},[reload,refreshToken])
  useEffect(()=>{
    fetch('/api/media',{cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||'שגיאה בטעינת הגלריה');return d}).then(d=>setMedia(d.data??[])).catch(e=>setError(e.message))
  },[])
  const post=async(form:FormData)=>{
    const response=await fetch(endpoint,{method:'POST',body:form})
    const data=await response.json().catch(()=>({}))
    if(!response.ok)throw new Error(data.error||`הצירוף נכשל (${response.status})`)
    return data
  }
  async function upload(files:FileList|null){
    if(!files?.length)return
    setBusy(true);setError('');setNotice('')
    let success=0
    try{
      for(const file of Array.from(files)){
        const pages=await pdfPages(file)
        for(const page of pages){
          const form=new FormData();form.append('file',page)
          if(file.type==='application/pdf') {form.append('pdfPage','1');form.append('originalName',page.name)}
          await post(form);success++
        }
      }
      await reload()
      setNotice(`${success} קבצים צורפו ונשמרו בהודעה`)
      toast.success(`${success} קבצים צורפו בהצלחה`)
    }catch(e){setError(`${e instanceof Error?e.message:'ההעלאה נכשלה'}${success?` (${success} קבצים נשמרו)` : ''}`)}
    finally{setBusy(false);if(inputRef.current)inputRef.current.value=''}
  }
  async function attachSelected(){
    if(!selected.length)return
    setBusy(true);setError('');setNotice('')
    let success=0
    try{
      for(const mediaId of selected){const form=new FormData();form.append('mediaId',mediaId);await post(form);success++}
      await reload();setSelected([]);setPicker(false)
      setNotice(`${success} תמונות מהגלריה צורפו ונשמרו בהודעה`)
      toast.success('התמונות צורפו בהצלחה')
    }catch(e){setError(`${e instanceof Error?e.message:'הצירוף נכשל'}${success?` (${success} תמונות נשמרו)` : ''}`)}
    finally{setBusy(false)}
  }
  async function remove(id:string){
    if(!confirm('להסיר את הקובץ מההודעה?'))return
    setBusy(true);setError('');setNotice('')
    try{
      const r=await fetch(`${endpoint}?attachmentId=${encodeURIComponent(id)}`,{method:'DELETE'})
      const data=await r.json().catch(()=>({}))
      if(!r.ok)throw new Error(data.error||'ההסרה נכשלה')
      await reload();setNotice('הקובץ הוסר מההודעה')
    }catch(e){setError(e instanceof Error?e.message:'ההסרה נכשלה')}
    finally{setBusy(false)}
  }
  return <section className="border rounded-xl p-3 sm:p-4 space-y-4 min-w-0 max-w-full overflow-x-hidden" dir="rtl">
    <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">תמונות וקבצים מצורפים</h2><span className="text-xs text-gray-500">{items.length} קבצים שמורים</span></div>
    <p className="text-xs text-gray-500">תמונות נשמרות מיד עם הצירוף ויוצגו בהודעה במסך שההודעה משויכת אליו. קובצי PDF מומרים לעמודי תמונה ומוצגים בטלוויזיה לפי סדר העמודים.</p>
    <div className="flex flex-wrap gap-2">
      <label className={`inline-flex cursor-pointer items-center rounded-lg bg-blue-600 px-4 py-2 text-white text-sm ${locked?'opacity-50 pointer-events-none':''}`}>
        העלאת תמונות / PDF<input ref={inputRef} type="file" multiple disabled={locked} accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" className="sr-only" onChange={e=>void upload(e.target.files)}/>
      </label>
      <button type="button" disabled={locked} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50" onClick={()=>setPicker(v=>!v)}>{picker?'סגור גלריה':'בחירה מהגלריה'}</button>
    </div>
    {picker&&<div className="rounded-xl border bg-slate-50 p-3 space-y-3">
      <div className="flex justify-between items-center gap-2"><p className="text-sm">בחר תמונות בלחיצה על התמונה ({selected.length} נבחרו)</p><button type="button" className="text-xs text-blue-700" onClick={()=>setSelected([])}>נקה בחירה</button></div>
      {media.length===0?<p className="text-sm text-gray-500">לא נמצאו תמונות בגלריה</p>:<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-64 overflow-y-auto overscroll-contain">
        {media.map(m=>{const active=selected.includes(m.id);return <button key={m.id} type="button" disabled={locked} aria-pressed={active} title={m.originalName} className={`relative rounded-lg overflow-hidden border-2 text-right bg-white ${active?'border-blue-600 ring-2 ring-blue-200':'border-transparent'}`} onClick={()=>setSelected(v=>active?v.filter(id=>id!==m.id):[...v,m.id])}>
          <img src={thumbnailImageUrl(m.url)} alt={m.originalName} loading="lazy" className="w-full h-24 object-contain bg-gray-100"/><span className="block truncate text-xs p-1">{m.originalName}</span>{active&&<span className="absolute top-1 right-1 bg-blue-600 text-white rounded-full px-1.5 text-xs">✓</span>}
        </button>})}
      </div>}
      <button type="button" disabled={locked||selected.length===0} onClick={()=>void attachSelected()} className="rounded-lg bg-blue-600 text-white px-4 py-2 text-sm disabled:opacity-50">צרף {selected.length} תמונות להודעה</button>
    </div>}
    {busy&&<div role="status" className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-medium text-blue-800"><span aria-hidden="true" className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"/>מעלה קבצים... נא להמתין.</div>}
    {error&&<p role="alert" className="text-sm text-red-700 bg-red-50 p-2 rounded">{error}</p>}
    {notice&&<p role="status" className="text-sm text-green-700 bg-green-50 p-2 rounded">✓ {notice}</p>}
    {items.length>0&&<div className="grid grid-cols-2 sm:grid-cols-3 gap-3 min-w-0 max-h-[360px] overflow-y-auto overscroll-contain">
      {items.map(a=><div key={a.id} className="border rounded-lg p-2 space-y-2 min-w-0">
        {a.kind==='IMAGE'||a.kind==='PDF_PAGE'?<img src={thumbnailImageUrl(a.url)} alt={a.originalName} className="w-full h-28 object-contain bg-gray-50 rounded"/>:<div className="h-28 bg-red-50 rounded flex items-center justify-center text-red-700 font-semibold">PDF</div>}
        <div className="text-xs truncate" title={a.originalName}>{a.originalName}</div>
        <div className="flex justify-between items-center"><span className="text-xs text-green-700">✓ נשמר</span><button type="button" disabled={locked} className="text-red-600 text-xs disabled:opacity-50" onClick={()=>void remove(a.id)}>הסר</button></div>
      </div>)}
    </div>}
  </section>
}
