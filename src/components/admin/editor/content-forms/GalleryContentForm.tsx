'use client'
import { useState, useEffect, useRef } from 'react'
import { Upload, Trash2, Check, Loader2, X, Film } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/Switch'
import type { ContentItem, GallerySettings, MediaLibraryImage } from '@/types'
interface Props { item:Partial<ContentItem>; settings:GallerySettings; onChange:(p:Partial<ContentItem>)=>void; onSettings:(s:GallerySettings)=>void }
const TRANSITIONS=[{value:'fade',label:'המסה'},{value:'slide',label:'הזזה'},{value:'instant',label:'מיידי'}]
export default function GalleryContentForm({item,settings,onChange,onSettings}:Props){
  const [images,setImages]=useState<MediaLibraryImage[]>([])
  const [folders,setFolders]=useState<{id:string;name:string;fileCount:number}[]>([])
  const [loading,setLoading]=useState(true)
  const [uploading,setUploading]=useState(false)
  const [selected,setSelected]=useState<Set<string>>(new Set(settings.imageIds??[]))
  const fileRef=useRef<HTMLInputElement>(null)
  useEffect(()=>{let c=false;async function load(){setLoading(true);try{const [r,g]=await Promise.all([fetch('/api/media'),fetch('/api/galleries')]);const [d,gd]=await Promise.all([r.json(),g.json()]);if(!c){setImages(d.data??[]);setFolders(gd.data??[])}}catch{}finally{if(!c)setLoading(false)}};load();return()=>{c=true}},[])
  function toggleImage(id:string){setSelected(prev=>{const next=new Set(prev);if(next.has(id))next.delete(id);else next.add(id);onSettings({...settings,imageIds:Array.from(next)});return next})}
  async function handleUpload(e:React.ChangeEvent<HTMLInputElement>){const files=Array.from(e.target.files??[]);if(!files.length)return;setUploading(true);try{for(const f of files){const fd=new FormData();fd.append('file',f);const r=await fetch('/api/media',{method:'POST',body:fd});const d=await r.json();if(r.ok&&Array.isArray(d.data)){setImages(p=>[...d.data,...p]);const uploaded=d.data.map((x:MediaLibraryImage)=>x.id);onSettings({...settings,imageIds:[...(settings.imageIds??[]),...uploaded]});setSelected(p=>new Set([...p,...uploaded]))}}}finally{setUploading(false);if(fileRef.current)fileRef.current.value=''}}
  async function handleDelete(id:string,e:React.MouseEvent){e.stopPropagation();await fetch('/api/media/'+id,{method:'DELETE'});setImages(p=>p.filter(img=>img.id!==id));if(selected.has(id)){setSelected(p=>{const n=new Set(p);n.delete(id);onSettings({...settings,imageIds:Array.from(n)});return n})}}
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
        <p className="text-[11px] text-blue-700">בחר תיקייה אחת או יותר. התמונות מכל התיקיות יוצגו יחד. תיקיות חדשות לא יתווספו מעצמן.</p>
        {folders.length===0?<p className="text-xs text-gray-500">אין תיקיות. צור תיקייה בספריית המדיה.</p>:folders.map(f=><label key={f.id} className="flex items-center gap-2 text-xs cursor-pointer py-1"><input type="checkbox" checked={(settings.folderIds??[]).includes(f.id)} onChange={e=>{const ids=settings.folderIds??[];onSettings({...settings,folderIds:e.target.checked?[...ids,f.id]:ids.filter(id=>id!==f.id),imageIds:[]})}}/><span>{f.name}</span><span className="text-gray-500">({f.fileCount})</span></label>)}
        <p className="text-[11px] text-gray-500">ללא בחירת תיקייה, אפשר לבחור תמונות ידנית למטה.</p>
      </div>
      <div onClick={()=>fileRef.current?.click()} className="flex items-center justify-center gap-2 py-3 border border-dashed border-blue-300 rounded-xl text-blue-600 text-xs cursor-pointer hover:bg-blue-50 transition-colors">
        {uploading?<><Loader2 className="w-4 h-4 animate-spin"/>מעלה...</>:<><Upload className="w-4 h-4"/>העלאת תמונות וסרטונים</>}
      </div>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml,video/mp4,video/webm" multiple className="hidden" onChange={handleUpload}/>
      {(settings.folderIds??[]).length===0&&selected.size>0&&<div className="flex items-center justify-between text-xs bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
        <span className="text-blue-700 font-medium">{selected.size} פריטים נבחרו</span>
        <button onClick={()=>{setSelected(new Set());onSettings({...settings,imageIds:[]})}} className="text-blue-400 hover:text-blue-600"><X className="w-3.5 h-3.5"/></button>
      </div>}
      {(settings.folderIds??[]).length===0&&(loading?<div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-400"/></div>
      :images.length===0?<div className="text-center py-8 text-xs text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">אין פריטים — העלה תמונה או סרטון</div>
      :<div className="grid grid-cols-3 gap-1.5 max-h-52 overflow-y-auto">
        {images.map(img=>{const isSel=selected.has(img.id);return(
          <div key={img.id} onClick={()=>toggleImage(img.id)} className={cn('relative aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition-all group',isSel?'border-blue-500 ring-2 ring-blue-300':'border-transparent hover:border-gray-300')}>
            {img.mimeType?.startsWith('video/')?<div className="w-full h-full bg-gray-900 flex items-center justify-center text-white"><Film className="w-7 h-7"/></div>:<img src={img.url} alt={img.originalName} className="w-full h-full object-cover"/>}
            {isSel&&<div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center"><Check className="w-5 h-5 text-white drop-shadow"/></div>}
            <button onClick={e=>handleDelete(img.id,e)} className="absolute top-1 right-1 p-1 bg-black/60 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"><Trash2 className="w-3 h-3"/></button>
          </div>
        )})}
      </div>)}
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
