'use client'
import { useEffect, useRef, useState } from 'react'
import type { AnnouncementContentSettings } from '@/types'
import { MoreOptions } from '../Collapsible'
interface Entry { id:string; title:string; body:string; active:boolean; startAt:string; endAt:string; priority:string }
export default function AnnouncementContentForm({settings,onSettings}:{settings:AnnouncementContentSettings;onSettings:(s:AnnouncementContentSettings)=>void}) {
  const [all,setAll]=useState<Entry[]>([])
  const [error,setError]=useState('')
  const ids=settings.selectedAnnouncementIds??[]
  // Reload the list when the region holds an announcement it does not know yet (e.g. one assigned
  // from the Announcements page while this editor was open, returned by the save).
  const [loaded,setLoaded]=useState(false)
  const unknownKey=loaded?ids.filter(id=>!all.some(a=>a.id===id)).join(','):''
  const askedFor=useRef('')
  const [reloads,setReloads]=useState(0)
  useEffect(()=>{fetch('/api/announcements',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('שגיאה בטעינת הודעות');return r.json()}).then(d=>{setAll(d.data??[]);setLoaded(true)}).catch(e=>setError(e.message))},[reloads])
  // One reload per new set of unknown ids (ids of deleted announcements stay unknown).
  useEffect(()=>{if(unknownKey&&unknownKey!==askedFor.current){askedFor.current=unknownKey;setReloads(n=>n+1)}},[unknownKey])
  const patch=(v:Partial<AnnouncementContentSettings>)=>onSettings({...settings,...v})
  return <div className="space-y-4" dir="rtl">
    <p className="text-xs text-gray-500">סמנו אילו הודעות יוצגו באזור הזה. יצירה ועריכה של הודעות (כולל תמונות וקובצי PDF) נעשות בעמוד ״הודעות״.</p>
    <div className="space-y-2"><label className="text-sm font-semibold">בחירת הודעות למסך</label>
      {error&&<p className="text-red-600 text-xs">{error}</p>}
      {!error&&!loaded&&<p className="text-xs text-gray-500">טוען הודעות…</p>}
      {!error&&loaded&&all.length===0&&<p className="text-xs text-gray-500">אין עדיין הודעות. צרו הודעה בעמוד ״הודעות״ והיא תופיע כאן לבחירה.</p>}
      {all.map(a=><label key={a.id} className="flex items-start gap-2 border rounded-lg p-2.5 cursor-pointer hover:bg-gray-50">
        <input type="checkbox" className="mt-1" checked={ids.includes(a.id)} onChange={e=>patch({selectedAnnouncementIds:e.target.checked?[...ids,a.id]:ids.filter(id=>id!==a.id)})}/>
        <span className="min-w-0"><span className="block text-sm font-medium">{a.title}</span><span className="block text-xs text-gray-500 truncate">{a.body.replace(/<[^>]*>/g," ").replace(/&nbsp;/g," ")}</span><span className="text-[11px] text-gray-400">{a.active?'פעילה':'כבויה'} · {new Date(a.startAt).toLocaleDateString('he-IL')} – {new Date(a.endAt).toLocaleDateString('he-IL')}</span></span>
      </label>)}
      <p className="text-xs text-gray-500">נבחרו {ids.length} הודעות. רק הודעות פעילות ובתוקף יוצגו בפועל.</p>
    </div>
    <div className="rounded-xl border p-3 space-y-2">
      <label className="flex justify-between text-sm">הצג כותרת לאזור<input type="checkbox" checked={settings.showSectionTitle??true} onChange={e=>patch({showSectionTitle:e.target.checked})}/></label>
      {(settings.showSectionTitle??true)&&<input className="w-full border rounded-lg p-2 text-sm" value={settings.sectionTitle??'הודעות כלליות'} onChange={e=>patch({sectionTitle:e.target.value})} placeholder="כותרת האזור"/>}
    </div>
    <MoreOptions summary={`מעבר בין הודעות כל ${settings.rotationSecs??10} שניות`}>
      <label className="flex justify-between items-center text-sm">זמן מעבר בין הודעות (שניות)<input className="w-20 border rounded-lg p-2" type="number" min={5} max={120} value={settings.rotationSecs??10} onChange={e=>patch({rotationSecs:Number(e.target.value)})}/></label>
    </MoreOptions>
    <a className="text-blue-600 underline text-sm" href="/admin/announcements">ליצירת הודעה חדשה ולניהול ההודעות ↗</a>
  </div>
}
