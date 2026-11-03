'use client'
import { useState, useRef, useEffect } from 'react'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import type { Announcement } from '@/types'
import { cleanAnnouncementHtml } from '@/lib/announcementRichText'
import { pdfPages } from '@/lib/pdfPages'
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
  const [phase,setPhase]=useState<'saving'|'uploading'>('saving')
  const [status,setStatus]=useState('')
  const [success,setSuccess]=useState('')
  // Bumped after uploads so the saved-attachments list re-fetches the real records from the server.
  const [attachmentsVersion,setAttachmentsVersion]=useState(0)
  const [attachmentsBusy,setAttachmentsBusy]=useState(false)
  // Guards against a second submit before the disabled state renders (double click, Enter).
  const savingRef=useRef(false)
  // PDF pages already uploaded per pending item, so a retry after a partial failure does not duplicate them.
  const uploadedPagesRef=useRef<Record<string,number>>({})
  const saving=busy||attachmentsBusy
  async function save(e:React.FormEvent){
    e.preventDefault()
    if(savingRef.current||attachmentsBusy)return
    setError('');setSuccess('')
    const hasText = body.replace(/<[^>]*>/g, '').replace(/&nbsp;|\u00a0/g, ' ').trim().length > 0
    if (!hasText && pending.length === 0 && !savedId) {
      setError('יש להזין תוכן הודעה או לצרף תמונה / PDF')
      return
    }
    savingRef.current=true
    setBusy(true);setPhase('saving');setStatus('שומר את ההודעה...')
    try{
      const res=await fetch(savedId?`/api/announcements/${savedId}`:'/api/announcements',{method:savedId?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title,showTitle,body,hasPendingAttachments:pending.length>0,priority,active,attachmentDisplayMode,attachmentSlideSeconds,startAt:new Date(start).toISOString(),endAt:new Date(end).toISOString()})})
      if(!res.ok){const data=await res.json().catch(()=>null);throw Error(`שמירת ההודעה נכשלה (${res.status}): ${data?.error||data?.message||JSON.stringify(data?.details||data?.issues||'בדוק את השדות והתאריכים')}`)}
      const payload=await res.json()
      const id=savedId||payload?.data?.id
      if(!id)throw Error('ההודעה נשמרה אך לא התקבל מזהה. רענן את הדף ובדוק את הרשימה.')
      setSavedId(id)
      const queue=[...pending]
      let uploaded=0
      if(queue.length)setPhase('uploading')
      try{
        for(const [i,a] of queue.entries()){
          const name=a.file?.name||a.media?.originalName||'קובץ'
          if(a.file?.type==='application/pdf')setStatus(`ממיר PDF לעמודים: ${name}...`)
          const pages=a.file?await pdfPages(a.file):[null]
          for(let p=uploadedPagesRef.current[a.key]??0;p<pages.length;p++){
            const page=pages[p]
            const form=new FormData()
            if(page){
              form.append('file',page)
              if(a.file?.type==='application/pdf'){form.append('pdfPage','1');form.append('originalName',page.name)}
            } else if(a.media) form.append('mediaId',a.media.id)
            else continue
            setStatus(`מעלה קבצים... קובץ ${i+1} מתוך ${queue.length}${pages.length>1?` (עמוד ${p+1} מתוך ${pages.length})`:''}`)
            const r=await fetch(`/api/announcements/${id}/attachments`,{method:'POST',body:form})
            if(!r.ok){const d=await r.json().catch(()=>({}));throw Error(`ההודעה נשמרה, אך העלאת "${name}" נכשלה: ${d.error||r.status}. הקבצים שלא נשמרו ממתינים — לחץ "נסה שוב".`)}
            uploaded++
            uploadedPagesRef.current[a.key]=p+1
          }
          // Remove from pending only after every page of this item was persisted.
          delete uploadedPagesRef.current[a.key]
          setPending(list=>list.filter(x=>x.key!==a.key))
          setAttachmentsVersion(v=>v+1)
        }
      }finally{
        // Re-sync with the server after any upload attempt, including partial failures.
        if(queue.length)setAttachmentsVersion(v=>v+1)
      }
      const message=`ההודעה נשמרה${uploaded?` · ${uploaded} קבצים הועלו ונשמרו`:''}`
      setSuccess(message)
      toast.success(message)
      router.refresh()
    }catch(e){setError(e instanceof Error?e.message:'שגיאה');toast.error('לא ניתן להשלים את השמירה')}
    finally{savingRef.current=false;setBusy(false);setStatus('')}
  }
  const buttonLabel=busy?(phase==='uploading'?'מעלה קבצים...':'שומר...'):attachmentsBusy?'מעלה קבצים...':'שמור הודעה'
  return <form onSubmit={save} className="w-full max-w-2xl space-y-4 bg-white border rounded-2xl p-4 sm:p-6 min-w-0 overflow-x-hidden [overflow-anchor:none]" dir="rtl">
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <h1 className="text-xl font-bold">{initial?'עריכת הודעה':'הודעה חדשה'}</h1>
      <button type="submit" disabled={saving} aria-busy={saving} className="bg-blue-600 text-white rounded-lg px-5 py-2 disabled:opacity-50">{buttonLabel}</button>
    </div>
    <label className="block text-sm">כותרת<input required className="block w-full mt-1 border rounded-lg p-2" value={title} onChange={e=>setTitle(e.target.value)}/></label>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showTitle} onChange={e=>setShowTitle(e.target.checked)}/>הצג כותרת בטלוויזיה</label>
    <div className="space-y-2"><label className="block text-sm font-medium">תוכן ההודעה (לא חובה אם מצרפים תמונה או PDF)</label>
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
    {savedId&&<AnnouncementAttachments key={savedId} announcementId={savedId} refreshToken={attachmentsVersion} disabled={busy} onBusyChange={setAttachmentsBusy}/>}
    {/* Pending files stay visible until each one is confirmed saved (also after a failed upload). */}
    {(!savedId||pending.length>0)&&<PendingAnnouncementAttachments items={pending} onChange={setPending} disabled={busy}/>}
    <div aria-live="polite" className="space-y-2">
      {busy&&<div role="status" className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-medium text-blue-800">
        <span aria-hidden="true" className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"/>
        <span>{status||'שומר...'} נא לא לסגור את הדף.</span>
      </div>}
      {!busy&&success&&<div role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-medium text-green-800">✓ {success}</div>}
      {error&&<div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        <span>{error}</span>
        {pending.length>0&&<button type="submit" disabled={saving} className="rounded-lg bg-red-600 px-4 py-1.5 text-white disabled:opacity-50">נסה שוב</button>}
      </div>}
    </div>
    <div className="sticky bottom-0 z-20 flex gap-3 bg-white border-t py-3"><button type="submit" disabled={saving} aria-busy={saving} className="bg-blue-600 text-white rounded-lg px-5 py-2 disabled:opacity-50">{buttonLabel}</button><button type="button" disabled={busy} onClick={()=>router.push('/admin/announcements')} className="border rounded-lg px-5 py-2 disabled:opacity-50">ביטול</button></div>
  </form>
}
