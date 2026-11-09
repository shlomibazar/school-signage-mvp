'use client'
import { useState, useEffect } from 'react'
import { Loader2, Folder, Check, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/Switch'
import { MoreOptions } from '../Collapsible'
import { galleryChangeSeconds, GALLERY_CHANGE_MIN, GALLERY_CHANGE_MAX } from '@/lib/galleryTiming'
import type { ContentItem, GallerySettings } from '@/types'
interface Props { item:Partial<ContentItem>; settings:GallerySettings; onChange:(p:Partial<ContentItem>)=>void; onSettings:(s:GallerySettings)=>void }
const TRANSITIONS=[{value:'fade',label:'המסה'},{value:'slide',label:'הזזה'},{value:'instant',label:'מיידי'}]
const MODES=[{value:'slideshow',label:'מצגת',hint:'תמונה אחת בכל פעם'},{value:'mosaic',label:'פסיפס',hint:'כמה תמונות יחד'},{value:'collage',label:"קולאז'",hint:'כמה תמונות בגדלים שונים'}] as const
const pill=(on:boolean)=>cn('ui-focus rounded-ui-sm border px-2 py-1.5 text-xs transition-colors',on?'border-ui-primary bg-ui-primary-soft font-medium text-ui-primary-ink':'border-ui-border bg-ui-surface text-ui-ink-2 hover:bg-ui-subtle')

// "גלריית תמונות": folders of the Media Library (live contents), how they are shown and how long each
// image or set stays on screen. The images themselves are managed in the Media Library.
export default function GalleryContentForm({item,settings,onChange,onSettings}:Props){
  const [folders,setFolders]=useState<{id:string;name:string;fileCount:number}[]>([])
  const [loading,setLoading]=useState(true)
  const [loadError,setLoadError]=useState(false)
  useEffect(()=>{
    let cancelled=false
    async function loadFolders(){
      try {
        const response=await fetch('/api/galleries')
        if(!response.ok) throw new Error('Failed to load galleries')
        const result=await response.json()
        if(!cancelled) setFolders(Array.isArray(result.data)?result.data:[])
      } catch {
        if(!cancelled) setLoadError(true)
      } finally {
        if(!cancelled) setLoading(false)
      }
    }
    loadFolders()
    return ()=>{cancelled=true}
  },[])
  const folderIds=settings.folderIds??[]
  const legacyImageCount=(settings.imageIds??[]).length
  const mode=settings.displayMode??'slideshow'
  const seconds=galleryChangeSeconds(settings,item.slideDuration)
  function toggleFolder(id:string){
    const next=folderIds.includes(id)?folderIds.filter(folderId=>folderId!==id):[...new Set([...folderIds,id])]
    // Existing manual selections remain intact until a folder is explicitly chosen.
    // Once folders are selected, the public display uses their live contents.
    onSettings({...settings,folderIds:next,imageIds:next.length?[]:settings.imageIds??[]})
  }
  // One interval for every mode. slideDuration follows it so older readers of the item agree.
  function setSeconds(v:number){
    const n=Math.max(GALLERY_CHANGE_MIN,Math.min(GALLERY_CHANGE_MAX,Math.round(v)||GALLERY_CHANGE_MIN))
    onSettings({...settings,changeSeconds:n}); onChange({slideDuration:n})
  }
  const label='mb-1.5 block text-xs font-medium text-ui-ink-2'
  return(
    <div className="space-y-3">
      {/* The old "הצג גלריה במסך" switch only hid this region's content. It is no longer offered; a
          gallery saved hidden says so and can be shown again. */}
      {settings.showGallery===false&&(
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-ui-sm border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <span className="inline-flex items-center gap-1.5"><EyeOff className="h-4 w-4" aria-hidden="true"/>הגלריה הוסתרה בעבר ולא מוצגת במסך.</span>
          <button type="button" onClick={()=>onSettings({...settings,showGallery:true})} className="ui-focus rounded font-medium underline underline-offset-2">הצגת הגלריה</button>
        </div>
      )}

      <section aria-labelledby="gallery-folders">
        <p id="gallery-folders" className={label}>תיקיות מספריית המדיה</p>
        {loading ? <div className="flex items-center gap-2 py-2 text-xs text-ui-muted"><Loader2 className="h-4 w-4 animate-spin"/>טוען תיקיות…</div>
          : loadError ? <p role="alert" className="text-xs text-ui-danger">לא ניתן לטעון את התיקיות. רעננו את העמוד ונסו שוב.</p>
          : folders.length===0 ? <p className="text-xs text-ui-muted">אין עדיין תיקיות. צרו תיקייה בעמוד ״ספריית מדיה״ והעלו אליה תמונות.</p>
          : <div className="grid max-h-56 grid-cols-2 gap-1.5 overflow-y-auto p-0.5">
              {folders.map(f=>{const on=folderIds.includes(f.id);return(
                <button key={f.id} type="button" role="checkbox" aria-checked={on} onClick={()=>toggleFolder(f.id)}
                  className={cn('ui-focus flex items-center gap-2 rounded-ui-sm border px-2.5 py-2 text-right',on?'border-ui-primary bg-ui-primary-soft':'border-ui-border hover:bg-ui-subtle')}>
                  <span className={cn('grid h-5 w-5 shrink-0 place-items-center rounded border',on?'border-ui-primary bg-ui-primary text-white':'border-ui-border-strong bg-ui-surface')}>{on?<Check className="h-3.5 w-3.5" aria-hidden="true"/>:<Folder className="h-3 w-3 text-ui-muted" aria-hidden="true"/>}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-[13px] text-ui-ink">{f.name}</span><span className="block text-[11px] text-ui-muted">{f.fileCount} קבצים</span></span>
                </button>)})}
            </div>}
        {folderIds.length===0 && legacyImageCount>0 && <p className="mt-1.5 text-xs text-amber-700">בגלריה זו מוגדרות {legacyImageCount} תמונות שנבחרו בעבר. הן ימשיכו לפעול עד שתבחרו תיקייה ותשמרו.</p>}
        {folderIds.length===0 && legacyImageCount===0 && !loading && folders.length>0 && <p className="mt-1.5 text-xs text-amber-700">בחרו לפחות תיקייה אחת. כל התמונות בה יוצגו, כולל תמונות שיתווספו בעתיד.</p>}
      </section>

      <div>
        <p className={label}>מצב תצוגה</p>
        <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="מצב תצוגה">
          {MODES.map(o=><button key={o.value} type="button" role="radio" aria-checked={mode===o.value} title={o.hint} onClick={()=>onSettings({...settings,displayMode:o.value})} className={pill(mode===o.value)}>{o.label}</button>)}
        </div>
        {mode!=='slideshow'&&<div className="mt-2 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="תמונות בכל סט">{([4,6,9] as const).map(n=><button key={n} type="button" role="radio" aria-checked={(settings.mosaicCount??6)===n} onClick={()=>onSettings({...settings,mosaicCount:n})} className={pill((settings.mosaicCount??6)===n)}>{n} תמונות</button>)}</div>}
      </div>

      <label className="block">
        <span className={label}>זמן החלפת תמונות</span>
        <span className="flex items-center gap-2">
          <input type="number" min={GALLERY_CHANGE_MIN} max={GALLERY_CHANGE_MAX} value={seconds} onChange={e=>setSeconds(Number(e.target.value))} className="ui-focus h-9 w-24 rounded-ui-sm border border-ui-border-strong bg-ui-surface px-2 text-sm" dir="ltr"/>
          <span className="text-xs text-ui-muted">שניות {mode==='slideshow'?'לכל תמונה':'לכל סט תמונות'} ({GALLERY_CHANGE_MIN}–{GALLERY_CHANGE_MAX})</span>
        </span>
      </label>

      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] text-ui-ink">הצג כותרת גלריה</span>
        <Switch checked={settings.showSectionTitle!==false} onCheckedChange={v=>onSettings({...settings,showSectionTitle:v})} aria-label="הצג כותרת גלריה"/>
      </div>
      {settings.showSectionTitle!==false&&<input type="text" maxLength={100} aria-label="טקסט הכותרת" value={settings.sectionTitle??'גלריית תמונות'} onChange={e=>onSettings({...settings,sectionTitle:e.target.value})} className="ui-focus h-9 w-full rounded-ui-sm border border-ui-border-strong bg-ui-surface px-3 text-sm" placeholder="גלריית תמונות"/>}

      <MoreOptions>
        <div><p className={label}>התאמת תמונה לאזור</p>
          <div className="grid grid-cols-2 gap-1.5">
            {([{value:'cover',label:'מילוי האזור'},{value:'contain',label:'תמונה מלאה'}] as const).map(opt=>{const on=(settings.imageFit??(mode==='slideshow'?'contain':'cover'))===opt.value;return(
              <button key={opt.value} type="button" aria-pressed={on} onClick={()=>onSettings({...settings,imageFit:opt.value})} className={pill(on)}>{opt.label}</button>)})}
          </div>
          <p className="mt-1 text-[11px] text-ui-muted">בפסיפס ובקולאז׳ ברירת המחדל היא מילוי; במצגת התמונה מוצגת בשלמותה.</p>
        </div>
        <div><p className={label}>סגנון מעבר</p><div className="grid grid-cols-3 gap-1.5">{TRANSITIONS.map(t=><button key={t.value} type="button" aria-pressed={(item.transitionStyle??'fade')===t.value} onClick={()=>onChange({transitionStyle:t.value})} className={pill((item.transitionStyle??'fade')===t.value)}>{t.label}</button>)}</div></div>
        <label className="block"><span className={label}>סדר הצגה</span><select value={settings.imageOrder??'random'} onChange={e=>onSettings({...settings,imageOrder:e.target.value as GallerySettings['imageOrder']})} className="ui-focus h-9 w-full rounded-ui-sm border border-ui-border-strong bg-ui-surface px-2 text-xs"><option value="random">אקראי ללא חזרה בסבב</option><option value="newest">מהחדש לישן</option><option value="oldest">מהישן לחדש</option><option value="name">לפי שם קובץ</option></select></label>
        <div className="flex items-center justify-between gap-3"><span className="text-[13px] text-ui-ink">הצג כיתובים</span><Switch checked={settings.showCaptions??true} onCheckedChange={v=>onSettings({...settings,showCaptions:v})} aria-label="הצג כיתובים"/></div>
        {settings.showSectionTitle!==false&&<div><p className={label}>גודל הכותרת</p><div className="grid grid-cols-3 gap-1.5">{([{value:'normal',label:'רגיל'},{value:'large',label:'גדול'},{value:'xlarge',label:'גדול מאוד'}] as const).map(o=><button key={o.value} type="button" aria-pressed={(settings.sectionTitleSize??'normal')===o.value} onClick={()=>onSettings({...settings,sectionTitleSize:o.value})} className={pill((settings.sectionTitleSize??'normal')===o.value)}>{o.label}</button>)}</div></div>}
      </MoreOptions>
      <p className="text-[11px] text-ui-muted">ניהול והעלאת תמונות נעשים בעמוד ״ספריית מדיה״.</p>
    </div>
  )
}
