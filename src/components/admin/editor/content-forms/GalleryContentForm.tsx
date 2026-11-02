'use client'
import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/Switch'
import type { ContentItem, GallerySettings } from '@/types'
interface Props { item:Partial<ContentItem>; settings:GallerySettings; onChange:(p:Partial<ContentItem>)=>void; onSettings:(s:GallerySettings)=>void }
const TRANSITIONS=[{value:'fade',label:'המסה'},{value:'slide',label:'הזזה'},{value:'instant',label:'מיידי'}]
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
  function toggleFolder(id:string,checked:boolean){
    const next=checked?[...new Set([...folderIds,id])]:folderIds.filter(folderId=>folderId!==id)
    // Existing manual selections remain intact until a folder is explicitly chosen.
    // Once folders are selected, the public display uses their live contents.
    onSettings({...settings,folderIds:next,imageIds:next.length?[]:settings.imageIds??[]})
  }
  return(
    <div className="space-y-3">
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-3" dir="rtl">
        <p className="text-xs font-semibold text-gray-700">תצוגת גלריה וכותרת</p>
        <div className="flex items-center justify-between"><span className="text-xs text-gray-700">הצג גלריה במסך</span><Switch checked={settings.showGallery!==false} onCheckedChange={v=>onSettings({...settings,showGallery:v})}/></div>
        <div className="flex items-center justify-between"><span className="text-xs text-gray-700">הצג כותרת גלריה</span><Switch checked={settings.showSectionTitle!==false} onCheckedChange={v=>onSettings({...settings,showSectionTitle:v})}/></div>
        {settings.showSectionTitle!==false&&<>
          <label className="block text-xs text-gray-600">טקסט הכותרת
            <input type="text" maxLength={100} value={settings.sectionTitle??'גלריית תמונות'} onChange={e=>onSettings({...settings,sectionTitle:e.target.value})} className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" placeholder="גלריית תמונות" />
          </label>
          <div><p className="text-xs text-gray-600 mb-1">גודל הכותרת</p><div className="grid grid-cols-3 gap-1.5">{([{value:'normal',label:'רגיל'},{value:'large',label:'גדול'},{value:'xlarge',label:'גדול מאוד'}] as const).map(o=><button key={o.value} type="button" onClick={()=>onSettings({...settings,sectionTitleSize:o.value})} className={cn('rounded-lg border px-2 py-2 text-xs',(settings.sectionTitleSize??'normal')===o.value?'bg-blue-500 border-blue-500 text-white':'bg-white border-gray-200 text-gray-700')}>{o.label}</button>)}</div></div>
        </>}
        <p className="text-[11px] text-gray-500">ההגדרות חלות גם על התצוגה המקדימה וגם על המסך הציבורי.</p>
      </div>
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 space-y-2" dir="rtl">
        <p className="text-xs font-semibold text-blue-900">בחירת תיקיות לגלריה</p>
        <p className="text-[11px] text-blue-700">בחר תיקייה אחת או יותר. כל התמונות בתיקיות שנבחרו יוצגו אוטומטית, כולל תמונות שתוסיף אליהן בעתיד.</p>
        {loading ? <div className="flex items-center gap-2 text-xs text-gray-500"><Loader2 className="w-4 h-4 animate-spin"/>טוען תיקיות...</div>
          : loadError ? <p className="text-xs text-red-600">לא ניתן לטעון את התיקיות. רענן את העמוד ונסה שוב.</p>
          : folders.length===0 ? <p className="text-xs text-gray-500">אין תיקיות. צור תיקייה בספריית המדיה והוסף אליה תמונות.</p>
          : folders.map(f=><label key={f.id} className="flex items-center gap-2 text-xs cursor-pointer py-1"><input type="checkbox" checked={folderIds.includes(f.id)} onChange={e=>toggleFolder(f.id,e.target.checked)}/><span>{f.name}</span><span className="text-gray-500">({f.fileCount})</span></label>)}
        {folderIds.length===0 && legacyImageCount>0 && <p className="text-[11px] text-amber-700">בגלריה זו מוגדרות {legacyImageCount} תמונות שנבחרו בעבר. הן ימשיכו לפעול עד שתבחר תיקייה ותשמור את הפריסה.</p>}
        {folderIds.length===0 && legacyImageCount===0 && <p className="text-[11px] text-amber-700">לא נבחרה תיקייה. בחר לפחות תיקייה אחת כדי להגדיר במפורש את התמונות שיוצגו.</p>}
        <p className="text-[11px] text-gray-500">ניהול והעלאת תמונות מתבצעים דרך ספריית המדיה. אין צורך לבחור תמונות בנפרד בעורך.</p>
      </div>
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2.5">
        <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">הגדרות גלריה</p>
        <div><label className="block text-xs text-gray-500 mb-1">מצב תצוגה</label><div className="grid grid-cols-3 gap-1">{([{value:'slideshow',label:'מצגת'},{value:'mosaic',label:'פסיפס'},{value:'collage',label:"קולאז'"}] as const).map(o=><button key={o.value} type="button" onClick={()=>onSettings({...settings,displayMode:o.value})} className={cn('rounded-lg border p-2 text-xs',(settings.displayMode??'slideshow')===o.value?'bg-blue-500 text-white':'bg-white text-gray-700')}>{o.label}</button>)}</div></div>
        {(settings.displayMode??'slideshow')!=='slideshow'&&<div><label className="block text-xs text-gray-500 mb-1">תמונות בכל סט</label><div className="grid grid-cols-3 gap-1">{([4,6,9] as const).map(n=><button key={n} type="button" onClick={()=>onSettings({...settings,mosaicCount:n})} className={cn('rounded-lg border p-2 text-xs',(settings.mosaicCount??6)===n?'bg-blue-500 text-white':'bg-white text-gray-700')}>{n} תמונות</button>)}</div></div>}
        <div><label className="block text-xs text-gray-500 mb-1">סדר הצגה</label><select value={settings.imageOrder??'random'} onChange={e=>onSettings({...settings,imageOrder:e.target.value as GallerySettings['imageOrder']})} className="w-full border rounded-lg p-2 text-xs bg-white"><option value="random">אקראי ללא חזרה בסבב</option><option value="newest">מהחדש לישן</option><option value="oldest">מהישן לחדש</option><option value="name">לפי שם קובץ</option></select></div>
        <div><label className="block text-xs text-gray-500 mb-1.5">זמן מעבר בין קבוצות תמונות (5–60 שניות)</label><input type="number" min={5} max={60} value={settings.groupDuration??15} onChange={e=>onSettings({...settings,groupDuration:Math.max(5,Math.min(60,Number(e.target.value)||15))})} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white" dir="ltr"/></div>
        <div><label className="block text-xs text-gray-500 mb-1.5">משך שקופית (שניות)</label><input type="number" min={2} max={60} value={item.slideDuration??8} onChange={e=>onChange({slideDuration:Math.max(2,Math.min(60,Number(e.target.value)))})} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white" dir="ltr"/></div>
        <div><label className="block text-xs text-gray-500 mb-1.5">סגנון מעבר</label><div className="grid grid-cols-2 gap-1.5">{TRANSITIONS.map(t=><button key={t.value} type="button" onClick={()=>onChange({transitionStyle:t.value})} className={cn('flex-1 py-1.5 text-xs rounded-lg border transition-colors',(item.transitionStyle??'fade')===t.value?'bg-blue-500 text-white border-blue-500':'bg-white text-gray-600 border-gray-200 hover:border-gray-300')}>{t.label}</button>)}</div></div>
        <div><label className="block text-xs text-gray-500 mb-1.5">התאמת תמונה למסך</label>
          <div className="flex gap-1.5">
            {([{value:'cover',label:'מילוי המסך'},{value:'contain',label:'תמונה מלאה'}] as const).map(opt=>
              <button key={opt.value} type="button" onClick={()=>onSettings({...settings,imageFit:opt.value})}
                className={cn('flex-1 py-1.5 text-xs rounded-lg border', (settings.imageFit??((settings.displayMode??'slideshow')==='slideshow'?'contain':'cover'))===opt.value?'bg-blue-500 text-white border-blue-500':'bg-white text-gray-600 border-gray-200')}>
                {opt.label}
              </button>)}
          </div>
          <p className="text-[10px] text-gray-400 mt-1">בפסיפס וקולאז׳ ברירת המחדל היא מילוי ללא רווחים; במצגת התמונה מוצגת בשלמותה. ניתן לשנות לכל גלריה.</p>
        </div>
        <div className="flex items-center justify-between"><span className="text-xs text-gray-700">הצג כיתובים</span><Switch checked={settings.showCaptions??true} onCheckedChange={v=>onSettings({...settings,showCaptions:v})}/></div>
        <div className="flex items-center justify-between"><span className="text-xs text-gray-700">הצג נקודות ניווט</span><Switch checked={settings.showDots??true} onCheckedChange={v=>onSettings({...settings,showDots:v})}/></div>
      </div>
    </div>
  )
}
