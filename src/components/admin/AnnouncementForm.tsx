'use client'
import { useState, useRef, useEffect } from 'react'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import type { Announcement } from '@/types'
import { cleanAnnouncementHtml } from '@/lib/announcementRichText'
import AnnouncementAttachments from './AnnouncementAttachments'
import PendingAnnouncementAttachments, { type PendingAttachment } from './PendingAnnouncementAttachments'
const local=(v:string)=>{const d=new Date(v);return Number.isNaN(d.getTime())?'':`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`}
export default function AnnouncementForm({initial}:{initial?:Announcement}){
  const router=useRouter()
  const [title,setTitle]=useState(initial?.title??'')
  const [showTitle,setShowTitle]=useState(initial?.showTitle??true)
  const [body,setBody]=useState(initial?.body??'')
  const editorRef=useRef<HTMLDivElement>(null)
  useEffect(()=>{if(editorRef.current)editorRef.current.innerHTML=cleanAnnouncementHtml(initial?.body??'')},[initial?.id])
  const format=(cmd:string)=>{editorRef.current?.focus();document.execCommand(cmd,false);setBody(editorRef.current?.innerHTML||'')}
  const size=(delta:number)=>{
    const editor=editorRef.current
    const selection=window.getSelection()
    if(!editor || !selection || selection.rangeCount===0)return
    const range=selection.getRangeAt(0)
    if(!editor.contains(range.commonAncestorContainer))return
    if(range.collapsed){
      // No selected text: set the typing format for subsequent input.
      editor.focus()
      document.execCommand('fontSize',false,delta>0?'5':'3')
    }else{
      const anchor=range.startContainer.nodeType===Node.TEXT_NODE?range.startContainer.parentElement:range.startContainer as HTMLElement
      const base=anchor?parseFloat(window.getComputedStyle(anchor).fontSize):20
      const next=Math.max(12,Math.min(48,(Number.isFinite(base)?base:20)+(delta>0?2:-2)))
      const span=document.createElement('span')
      span.style.fontSize=`${next}px`
      span.appendChild(range.extractContents())
      range.insertNode(span)
      selection.removeAllRanges()
      const newRange=document.createRange()
      newRange.selectNodeContents(span)
      selection.addRange(newRange)
    }
    setBody(editor.innerHTML)
  }
  const [attachmentDisplayMode,setAttachmentDisplayMode]=useState<'together'|'slideshow'>(initial?.attachmentDisplayMode??'together')
  const [attachmentSlideSeconds,setAttachmentSlideSeconds]=useState(initial?.attachmentSlideSeconds??8)
  const [priority,setPriority]=useState(initial?.priority??'LOW')
  const [active,setActive]=useState(initial?.active??true)
  const [start,setStart]=useState(initial?local(initial.startAt):local(new Date().toISOString()))
  const [end,setEnd]=useState(initial?local(initial.endAt):'2099-12-31T23:59')
  const [savedId,setSavedId]=useState(initial?.id??'')
  const [pending,setPending]=useState<PendingAttachment[]>([])
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  async function save(e:React.FormEvent){
    e.preventDefault();setBusy(true);setError('')
    try{
      const res=await fetch(savedId?`/api/announcements/${savedId}`:'/api/announcements',{method:savedId?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,showTitle,body,priority,active,attachmentDisplayMode,attachmentSlideSeconds,startAt:new Date(start).toISOString(),endAt:new Date(end).toISOString()})})
      if(!res.ok)throw Error('שמירת ההודעה נכשלה. בדוק את השדות והתאריכים.')
      const payload=await res.json()
      const id=savedId||payload?.data?.id
      if(!id)throw Error('ההודעה נשמרה אך לא התקבל מזהה. רענן את הדף ובדוק את הרשימה.')
      setSavedId(id)
      let uploaded=0
      for(const a of pending){
        const form=new FormData()
        if(a.file)form.append('file',a.file)
        else if(a.media)form.append('mediaId',a.media.id)
        else continue
        const r=await fetch(`/api/announcements/${id}/attachments`,{method:'POST',body:form})
        if(!r.ok){const d=await r.json().catch(()=>({}));setPending(p=>p.slice(uploaded));throw Error(`ההודעה נשמרה, אך צירוף קובץ נכשל: ${d.error||r.status}. ניתן לנסות לשמור שוב.`)}
        uploaded++
      }
      setPending([])
      toast.success(`ההודעה נשמרה${uploaded?` עם ${uploaded} קבצים`:''}`)
      router.refresh()
    }catch(e){setError(e instanceof Error?e.message:'שגיאה');toast.error('לא ניתן להשלים את השמירה')}
    finally{setBusy(false)}
  }
  return <form onSubmit={save} className="w-full max-w-2xl space-y-4 bg-white border rounded-2xl p-4 sm:p-6 min-w-0 overflow-x-hidden [overflow-anchor:none]" dir="rtl">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-bold">{initial?'עריכת הודעה':'הודעה חדשה'}</h1>
      <button type="submit" disabled={busy} className="bg-blue-600 text-white rounded-lg px-5 py-2 disabled:opacity-50">{busy?'שומר...':'שמור הודעה'}</button>
    </div>
    <label className="block text-sm">כותרת<input required className="block w-full mt-1 border rounded-lg p-2" value={title} onChange={e=>setTitle(e.target.value)}/></label>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showTitle} onChange={e=>setShowTitle(e.target.checked)}/>הצג כותרת בטלוויזיה</label>
    <div className="space-y-2"><label className="block text-sm font-medium">תוכן ההודעה</label>
      <div className="flex flex-wrap gap-1 rounded-lg border p-2" role="toolbar" aria-label="עיצוב הודעה">
        {[['bold','מודגש','B'],['italic','נטוי','I'],['underline','קו תחתון','U'],['justifyRight','יישור לימין','⇥'],['justifyCenter','יישור למרכז','☷'],['justifyLeft','יישור לשמאל','⇤'],['insertUnorderedList','רשימה','•']].map(([cmd,label,symbol])=><button key={cmd} type="button" title={label} aria-label={label} onMouseDown={e=>e.preventDefault()} onClick={()=>format(cmd)} className="border rounded px-3 py-1 font-semibold hover:bg-gray-100">{symbol}</button>)}
        <button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>size(-2)} className="border rounded px-2 py-1" title="טקסט קטן">א−</button>
        <button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>size(2)} className="border rounded px-2 py-1" title="טקסט גדול">א+</button>
      </div>
      <div ref={editorRef} role="textbox" aria-label="תוכן ההודעה" aria-multiline="true" contentEditable suppressContentEditableWarning dir="rtl" onInput={e=>setBody(e.currentTarget.innerHTML)} className="min-h-[150px] w-full rounded-lg border p-3 focus:outline-blue-500 whitespace-pre-wrap" />
      <p className="text-xs text-gray-500">אפשר לסמן טקסט ולעצב רק את החלק שנבחר.</p>
    </div>
    <label className="block text-sm">עדיפות<select className="block w-full mt-1 border rounded-lg p-2" value={priority} onChange={e=>setPriority(e.target.value as Announcement['priority'])}><option value="LOW">רגיל</option><option value="MEDIUM">בינוני</option><option value="HIGH">דחוף</option><option value="EMERGENCY">חירום</option></select></label>
    <p className="text-xs text-gray-600 rounded-lg bg-slate-50 border p-3" role="status">{({
      LOW: 'רגיל: ההודעה מוצגת בצבעי העיצוב של המסך.',
      MEDIUM: 'בינוני: ההודעה מוצגת על רקע כתום עם טקסט לבן.',
      HIGH: 'דחוף: ההודעה מוצגת על רקע אדום עם טקסט לבן.',
      EMERGENCY: 'חירום: כרגע מוצג כמו דחוף (אדום). בחירה זו אינה מפעילה אוטומטית שכבת חירום על כל המסך.',
    } as Record<string,string>)[priority]}</p>
    <p className="text-xs text-gray-500">העדיפות משנה את צבע ההודעה, אך אינה משנה את זמן התצוגה או את סדר הסבב במסך.</p>
    <div className="grid grid-cols-2 gap-3"><label className="text-sm">התחלה<input required type="datetime-local" className="block w-full mt-1 border rounded-lg p-2" value={start} onChange={e=>setStart(e.target.value)}/></label><label className="text-sm">סיום<input required type="datetime-local" className="block w-full mt-1 border rounded-lg p-2" value={end} onChange={e=>setEnd(e.target.value)}/></label></div>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)}/>הודעה פעילה</label>
    <p className="text-xs text-gray-500">ההודעה לא תוצג עד שתיבחר בעורך הפריסה של המסך הרצוי.</p>
    <fieldset className="border rounded-lg p-3 space-y-2">
      <legend className="font-semibold px-1">אופן הצגת תמונות ועמודי PDF בטלוויזיה</legend>
      <label className="flex items-center gap-2 text-sm"><input type="radio" name="attachmentDisplayMode" checked={attachmentDisplayMode==='together'} onChange={()=>setAttachmentDisplayMode('together')}/>הצגה משותפת — כל התמונות יחד בהתאם למקום</label>
      <label className="flex items-center gap-2 text-sm"><input type="radio" name="attachmentDisplayMode" checked={attachmentDisplayMode==='slideshow'} onChange={()=>setAttachmentDisplayMode('slideshow')}/>מעבר אוטומטי — תמונה אחת בכל פעם</label>
      {attachmentDisplayMode==='slideshow'&&<label className="block text-sm">זמן מעבר (שניות)<input type="number" min={3} max={30} className="block mt-1 w-24 border rounded p-2" value={attachmentSlideSeconds} onChange={e=>setAttachmentSlideSeconds(Math.max(3,Math.min(30,Number(e.target.value)||8)))}/></label>}
    </fieldset>
    {savedId?<AnnouncementAttachments key={savedId} announcementId={savedId}/>:<PendingAnnouncementAttachments items={pending} onChange={setPending}/>}
    {error&&<p className="text-red-600 text-sm">{error}</p>}
    <div className="sticky bottom-0 z-20 flex gap-3 bg-white border-t py-3"><button type="submit" disabled={busy} className="bg-blue-600 text-white rounded-lg px-5 py-2">{busy?'שומר...':'שמור הודעה'}</button><button type="button" onClick={()=>router.push('/admin/announcements')} className="border rounded-lg px-5 py-2">ביטול</button></div>
  </form>
}
