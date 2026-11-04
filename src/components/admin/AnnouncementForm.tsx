'use client'
import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import { ArrowRight, Info, CheckCircle2, AlertCircle } from 'lucide-react'
import type { Announcement } from '@/types'
import { cleanAnnouncementHtml } from '@/lib/announcementRichText'
import { presetEnd, presetFor, toLocalInput, type SchedulePreset } from '@/lib/announcementStatus'
import AnnouncementAttachments from './AnnouncementAttachments'
import PendingAnnouncementAttachments, { type PreparedItem, preparedBusy, preparedPayload, preparedTokens, discardPrepared, markExpired, UPLOAD_MAX_AGE_MS } from './PendingAnnouncementAttachments'
import AnnouncementDeleteButton from './AnnouncementDeleteButton'
import WhereToDisplay, { type ScreenOption } from './announcements/WhereToDisplay'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Field, Input, Select, Checkbox } from '@/components/ui/Field'
import { PageHeader } from '@/components/ui/Display'
import { cn } from '@/lib/utils'

const PRESETS: { id: SchedulePreset; label: string }[] = [
  { id: 'none', label: 'ללא תאריך סיום' },
  { id: 'week', label: 'שבוע' },
  { id: 'month', label: 'חודש' },
  { id: 'custom', label: 'תאריכים מותאמים' },
]
const fmtDate = (local: string) => { const d = new Date(local); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' }) }

export default function AnnouncementForm({initial}:{initial?:Announcement}){
  const router=useRouter()
  const [title,setTitle]=useState(initial?.title??'')
  const [showTitle,setShowTitle]=useState(initial?.showTitle??true)
  const [body,setBody]=useState(initial?.body??'')
  const editorRef=useRef<HTMLDivElement>(null)
  // Fill the editor once per announcement; re-running on body changes would overwrite what the user types.
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Scheduling. New announcements start now with no end date. An existing schedule is kept
  // exactly (the original values are sent) unless the user changes it here.
  const [preset,setPreset]=useState<SchedulePreset>(initial?presetFor(initial.endAt):'none')
  const [start,setStart]=useState(initial?toLocalInput(initial.startAt):toLocalInput(new Date()))
  const [end,setEnd]=useState(initial?toLocalInput(initial.endAt):'')
  const [scheduleTouched,setScheduleTouched]=useState(false)
  const effectiveEnd=preset==='custom'?end:presetEnd(preset,start)??''
  const choosePreset=(p:SchedulePreset)=>{setScheduleTouched(true);if(p==='custom'&&!end)setEnd(presetEnd('week',start)??'');setPreset(p)}

  // Where to display. For an existing announcement the current assignments are loaded first;
  // until then nothing about assignments is sent, so a save can never clear them by accident.
  const [regionIds,setRegionIds]=useState<string[]>([])
  const [regionsReady,setRegionsReady]=useState(false)
  const [screens,setScreens]=useState<ScreenOption[]>([])
  const [savedId,setSavedId]=useState(initial?.id??'')
  const shownOn=useMemo(()=>screens.flatMap(s=>s.regions.filter(r=>savedId&&r.announcementIds.includes(savedId)).map(r=>s.regions.length>1?`${s.name} · ${r.title}`:s.name)),[screens,savedId])
  const sharedScreens=new Set(screens.filter(s=>s.regions.some(r=>savedId&&r.announcementIds.includes(savedId))).map(s=>s.id)).size
  const selectedScreens=screens.filter(s=>s.regions.some(r=>regionIds.includes(r.id))).length

  // New announcement: files are uploaded (and PDFs converted) as soon as they are chosen; saving
  // attaches them. Existing announcement: files go straight to it (AnnouncementAttachments).
  const [prepared,setPrepared]=useState<PreparedItem[]>([])
  const updatePrepared=useCallback((update:(items:PreparedItem[])=>PreparedItem[])=>setPrepared(update),[])
  const preparing=preparedBusy(prepared)
  const failedUploads=prepared.filter(i=>i.status==='error').length
  // Uploads not saved with an announcement are discarded when the form is cancelled or left.
  const savedRef=useRef(false)
  const preparedRef=useRef(prepared)
  preparedRef.current=prepared
  useEffect(()=>{
    if(initial)return
    // Never while a save is in flight: if the page is left mid-save, the save may still succeed
    // with these files (anything left over is removed by the server-side sweep).
    const discard=()=>{if(!savedRef.current&&!savingRef.current)discardPrepared(preparedTokens(preparedRef.current))}
    const warn=(e:BeforeUnloadEvent)=>{if(!savedRef.current&&preparedRef.current.length){e.preventDefault();e.returnValue=''}}
    window.addEventListener('pagehide',discard)
    window.addEventListener('beforeunload',warn)
    return()=>{window.removeEventListener('pagehide',discard);window.removeEventListener('beforeunload',warn);discard()}
  },[initial])
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  const [success,setSuccess]=useState('')
  const [attachmentsBusy,setAttachmentsBusy]=useState(false)
  // Guards against a second submit before the disabled state renders (double click, Enter).
  const savingRef=useRef(false)
  const saving=busy||attachmentsBusy
  async function save(e:React.FormEvent){
    e.preventDefault()
    if(savingRef.current||attachmentsBusy)return
    setError('');setSuccess('')
    if(preparing){setError('הקבצים עדיין מועלים. ההודעה תישמר אחרי שההעלאה תסתיים — נסו שוב בעוד רגע.');return}
    if(failedUploads){setError('העלאת חלק מהקבצים נכשלה או שתוקפה פג. לחצו ״נסה שוב״ / ״העלה שוב״ או הסירו אותם לפני השמירה.');return}
    // Uploads are valid for 24 hours: a form left open longer asks for those files again.
    if(!savedId&&prepared.some(i=>i.pages.some(p=>Date.now()-p.uploadedAt>UPLOAD_MAX_AGE_MS))){
      setPrepared(list=>markExpired(list,new Set()))
      setError('תוקף ההעלאה של חלק מהקבצים פג. לחצו ״העלה שוב״ ליד כל קובץ מסומן ושמרו שוב. ההודעה לא נשמרה.')
      return
    }
    const hasText = body.replace(/<[^>]*>/g, '').replace(/&nbsp;| /g, ' ').trim().length > 0
    if (!hasText && prepared.length === 0 && !savedId) {
      setError('יש להזין תוכן הודעה או לצרף תמונה / PDF')
      return
    }
    if (!effectiveEnd || new Date(effectiveEnd) < new Date(start)) { setError('תאריך הסיום חייב להיות אחרי תאריך ההתחלה'); return }
    savingRef.current=true
    setBusy(true)
    try{
      const keepSchedule=initial&&!scheduleTouched
      const res=await fetch(savedId?`/api/announcements/${savedId}`:'/api/announcements',{method:savedId?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        title,showTitle,body,priority,active,attachmentDisplayMode,attachmentSlideSeconds,
        startAt:keepSchedule?new Date(initial.startAt).toISOString():new Date(start).toISOString(),
        endAt:keepSchedule?new Date(initial.endAt).toISOString():new Date(effectiveEnd).toISOString(),
        ...(regionsReady?{regionIds}:{}),
        ...(!savedId?{attachments:preparedPayload(prepared)}:{}),
      })})
      if(!res.ok){const data=await res.json().catch(()=>null)
        if(data?.code==='UPLOAD_EXPIRED'&&Array.isArray(data.invalidTokens)){
          // Nothing was saved. The files stay in the form, marked, with "upload again".
          setPrepared(list=>markExpired(list,new Set(data.invalidTokens)))
          throw Error('תוקף ההעלאה של חלק מהקבצים פג. לחצו ״העלה שוב״ ליד כל קובץ מסומן ושמרו שוב. ההודעה לא נשמרה.')
        }
        throw Error(`שמירת ההודעה נכשלה (${res.status}): ${data?.error&&typeof data.error==='string'?data.error:'בדקו את השדות והתאריכים'}`)
      }
      const payload=await res.json()
      const id=savedId||payload?.data?.id
      if(!id)throw Error('ההודעה נשמרה אך לא התקבל מזהה. רענן את הדף ובדוק את הרשימה.')
      savedRef.current=true
      setSavedId(id)
      const files=preparedPayload(prepared).length
      const message=!regionsReady?'ההודעה נשמרה'
        :selectedScreens?`ההודעה נשמרה ומוצגת ב${selectedScreens===1?'מסך אחד':`-${selectedScreens} מסכים`}`
        :'ההודעה נשמרה. היא לא מוצגת באף מסך עד לשיוכה.'
      const full=`${message}${!initial&&files?` · ${files} קבצים צורפו`:''}`
      setSuccess(full)
      toast.success(full)
      // A new announcement is done once it is saved: back to the list, where it shows with its status.
      if(!initial){router.push('/admin/announcements');router.refresh();return}
      setScheduleTouched(false)
      // Reload the assignments from the server so counts and "shown on" reflect the saved state.
      setRegionsReady(false);setReloadKey(k=>k+1)
      router.refresh()
    }catch(e){setError(e instanceof Error?e.message:'שגיאה');toast.error('לא ניתן להשלים את השמירה')}
    finally{savingRef.current=false;setBusy(false)}
  }
  const [reloadKey,setReloadKey]=useState(0)
  const primaryLabel=busy?'שומר...':attachmentsBusy?'מעלה קבצים...':preparing?'ממתין לסיום ההעלאה...':initial?'שמירת שינויים':'שמירת הודעה'

  return <form onSubmit={save} className="mx-auto w-full max-w-6xl min-w-0 [overflow-anchor:none]" dir="rtl">
    <PageHeader title={initial?'עריכת הודעה':'הודעה חדשה'} description={initial?undefined:'כתבו את ההודעה, בחרו מתי ואיפה להציג אותה ופרסמו. אין צורך להיכנס לעורך המסך.'}
      actions={<ButtonLink href="/admin/announcements" variant="ghost" size="sm" icon={<ArrowRight className="h-4 w-4" />}>לכל ההודעות</ButtonLink>} />
    {initial&&sharedScreens>1&&<div role="note" className="mb-4 flex items-start gap-2 rounded-ui border border-ui-primary-line bg-ui-primary-soft px-4 py-3 text-sm text-ui-primary-ink"><Info className="mt-0.5 h-4 w-4 shrink-0" />ההודעה מוצגת ב-{sharedScreens} מסכים. שינויים בתוכן יופיעו בכולם.</div>}
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="grid min-w-0 gap-4">
        <Card>
          <CardHeader title="תוכן ההודעה" />
          <CardBody className="grid gap-4">
            <Field label="כותרת" htmlFor="ann-title"><Input id="ann-title" required value={title} onChange={e=>setTitle(e.target.value)} placeholder="למשל: ערב הורים ביום שלישי" /></Field>
            <div className="grid gap-1.5">
              <span className="text-[13px] font-semibold text-ui-ink-2">תוכן <span className="font-normal text-ui-muted">(לא חובה אם מצרפים תמונה או PDF)</span></span>
              <div className="rounded-ui-sm border border-ui-border-strong focus-within:border-ui-primary">
                <div className="flex flex-wrap gap-1 border-b border-ui-border p-1.5" role="toolbar" aria-label="עיצוב הודעה">
                  {[['bold','מודגש','B'],['italic','נטוי','I'],['underline','קו תחתון','U'],['justifyRight','יישור לימין','⇥'],['justifyCenter','יישור למרכז','☷'],['justifyLeft','יישור לשמאל','⇤'],['insertUnorderedList','רשימה','•']].map(([cmd,label,symbol])=><button key={cmd} type="button" title={label} aria-label={label} onMouseDown={e=>e.preventDefault()} onClick={()=>format(cmd)} className="ui-focus rounded-ui-sm px-2.5 py-1 text-sm font-semibold text-ui-ink-2 hover:bg-ui-subtle">{symbol}</button>)}
                  <button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>size(-2)} className="ui-focus rounded-ui-sm px-2.5 py-1 text-sm text-ui-ink-2 hover:bg-ui-subtle" title="טקסט קטן">א−</button>
                  <button type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>size(2)} className="ui-focus rounded-ui-sm px-2.5 py-1 text-sm text-ui-ink-2 hover:bg-ui-subtle" title="טקסט גדול">א+</button>
                </div>
                <div ref={editorRef} role="textbox" aria-label="תוכן ההודעה" aria-multiline="true" contentEditable suppressContentEditableWarning dir="rtl" onInput={e=>setBody(e.currentTarget.innerHTML)} className="min-h-[140px] w-full p-3 text-sm leading-relaxed focus:outline-none [&_ul]:list-disc [&_ul]:pr-6"/>
              </div>
              <p className="text-xs text-ui-muted">אפשר לסמן חלק מהטקסט ולעצב רק אותו.</p>
            </div>
            {savedId&&<AnnouncementAttachments key={savedId} announcementId={savedId} disabled={busy} onBusyChange={setAttachmentsBusy}/>}
            {/* Pending files stay visible until each one is confirmed saved (also after a failed upload). */}
            {!initial&&!savedId&&<PendingAnnouncementAttachments items={prepared} onChange={updatePrepared} disabled={busy}/>}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="מתי להציג" />
          <CardBody className="grid gap-3">
            <div role="radiogroup" aria-label="משך התצוגה" className="flex flex-wrap gap-2">
              {PRESETS.map(p=><button key={p.id} type="button" role="radio" aria-checked={preset===p.id} onClick={()=>choosePreset(p.id)} className={cn('ui-focus rounded-ui-sm border px-3.5 py-2 text-sm transition-colors', preset===p.id?'border-ui-primary bg-ui-primary-soft font-semibold text-ui-primary-ink':'border-ui-border-strong bg-ui-surface text-ui-ink-2 hover:bg-ui-subtle')}>{p.label}</button>)}
            </div>
            {preset==='custom'
              ? <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="מתחילה" htmlFor="ann-start"><Input id="ann-start" type="datetime-local" required value={start} onChange={e=>{setStart(e.target.value);setScheduleTouched(true)}} /></Field>
                  <Field label="מסתיימת" htmlFor="ann-end"><Input id="ann-end" type="datetime-local" required value={end} onChange={e=>{setEnd(e.target.value);setScheduleTouched(true)}} /></Field>
                </div>
              : <p className="text-sm text-ui-muted">{preset==='none'?`מוצגת מ-${fmtDate(start)} ועד שתכבו או תמחקו אותה.`:`מוצגת מ-${fmtDate(start)} עד ${fmtDate(effectiveEnd)}.`}</p>}
          </CardBody>
        </Card>

        <details className="group rounded-ui-lg border border-ui-border bg-ui-surface shadow-ui">
          <summary className="ui-focus flex cursor-pointer list-none items-center justify-between rounded-ui-lg px-5 py-3.5 text-[15px] font-semibold text-ui-ink">אפשרויות נוספות <span className="text-sm font-normal text-ui-muted">עדיפות, הצגת כותרת, מצב ותצוגת קבצים</span></summary>
          <div className="grid gap-4 border-t border-ui-border px-5 py-4">
            <Checkbox label="הצגת הכותרת בטלוויזיה" checked={showTitle} onChange={e=>setShowTitle(e.target.checked)} />
            <Checkbox label="ההודעה פעילה" description="הודעה כבויה לא מוצגת באף מסך, גם אם היא משויכת." checked={active} onChange={e=>setActive(e.target.checked)} />
            <Field label="עדיפות" htmlFor="ann-priority" hint={({LOW:'מוצגת בצבעי העיצוב של המסך.',MEDIUM:'מוצגת על רקע כתום.',HIGH:'מוצגת על רקע אדום.',EMERGENCY:'מוצגת כמו דחוף (אדום).'} as Record<string,string>)[priority]}>
              <Select id="ann-priority" value={priority} onChange={e=>setPriority(e.target.value as Announcement['priority'])}>
                <option value="LOW">רגיל</option><option value="MEDIUM">בינוני</option><option value="HIGH">דחוף</option>
                {/* Emergency has no special display yet; it stays selectable only for records that already use it. */}
                {initial?.priority==='EMERGENCY'&&<option value="EMERGENCY">חירום</option>}
              </Select>
            </Field>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-[13px] font-semibold text-ui-ink-2">הצגת תמונות ועמודי PDF בטלוויזיה</legend>
              <label className="flex items-center gap-2 text-sm"><input type="radio" className="accent-[var(--ui-primary)]" name="attachmentDisplayMode" checked={attachmentDisplayMode==='together'} onChange={()=>setAttachmentDisplayMode('together')}/>כולן יחד, לפי המקום</label>
              <label className="flex items-center gap-2 text-sm"><input type="radio" className="accent-[var(--ui-primary)]" name="attachmentDisplayMode" checked={attachmentDisplayMode==='slideshow'} onChange={()=>setAttachmentDisplayMode('slideshow')}/>אחת בכל פעם, במעבר אוטומטי</label>
              {attachmentDisplayMode==='slideshow'&&<Field label="זמן מעבר (שניות)" htmlFor="ann-slide" className="max-w-[160px]"><Input id="ann-slide" type="number" min={3} max={30} value={attachmentSlideSeconds} onChange={e=>setAttachmentSlideSeconds(Number(e.target.value))}/></Field>}
            </fieldset>
          </div>
        </details>
      </div>

      <div className="grid min-w-0 gap-4">
        <WhereToDisplay key={reloadKey} announcementId={savedId||undefined} value={regionIds} disabled={busy}
          onChange={setRegionIds} onLoaded={(list,current)=>{setScreens(list);setRegionIds(current);setRegionsReady(true)}} />
      </div>
    </div>

    <div aria-live="polite" className="mt-4 grid gap-2">
      {busy&&<div role="status" className="flex items-center gap-3 rounded-ui border border-ui-primary-line bg-ui-primary-soft p-3 text-sm font-medium text-ui-primary-ink">
        <span aria-hidden="true" className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-ui-primary border-t-transparent"/>
        <span>שומר את ההודעה... נא לא לסגור את הדף.</span>
      </div>}
      {!busy&&success&&<div role="status" className="flex items-center gap-2 rounded-ui border border-green-200 bg-ui-success-soft p-3 text-sm font-medium text-ui-success"><CheckCircle2 className="h-4 w-4" />{success}</div>}
      {error&&<div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-ui border border-red-200 bg-ui-danger-soft p-3 text-sm text-ui-danger">
        <span className="flex items-center gap-2"><AlertCircle className="h-4 w-4 shrink-0" />{error}</span>
      </div>}
    </div>
    {/* Cancel discards uploads made for a new announcement that was not saved (the unmount cleanup). */}
    <div className="sticky bottom-0 z-20 -mx-3 mt-4 flex flex-wrap items-center gap-2 border-t border-ui-border bg-ui-surface px-3 py-3 sm:-mx-4 sm:px-4 lg:-mx-6 lg:px-6">
      <Button type="submit" variant="primary" loading={saving||preparing} disabled={saving||preparing}>{primaryLabel}</Button>
      <Button variant="secondary" disabled={busy} onClick={()=>router.push('/admin/announcements')}>ביטול</Button>
      <span className="text-xs text-ui-muted">{selectedScreens?`ההודעה תוצג ב${selectedScreens===1?'מסך אחד':`-${selectedScreens} מסכים`}. השינויים יופיעו במסכים תוך דקה.`:'ההודעה תישמר אך לא תוצג באף מסך עד לשיוכה.'}</span>
      {savedId&&initial&&<div className="ms-auto"><AnnouncementDeleteButton id={savedId} title={title||initial.title} shownOn={shownOn} redirectTo="/admin/announcements" size="md" /></div>}
    </div>
  </form>
}
