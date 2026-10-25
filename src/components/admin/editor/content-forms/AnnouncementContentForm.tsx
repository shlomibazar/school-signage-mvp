'use client'
import { useEffect, useState } from 'react'
import type { AnnouncementContentSettings } from '@/types'
interface Entry { id:string; title:string; body:string; active:boolean; startAt:string; endAt:string; priority:string }
export default function AnnouncementContentForm({settings,onSettings}:{settings:AnnouncementContentSettings;onSettings:(s:AnnouncementContentSettings)=>void}) {
  const [all,setAll]=useState<Entry[]>([])
  const [error,setError]=useState('')
  useEffect(()=>{fetch('/api/announcements',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('שגיאה בטעינת הודעות');return r.json()}).then(d=>setAll(d.data??[])).catch(e=>setError(e.message))},[])
  const ids=settings.selectedAnnouncementIds??[]
  const patch=(v:Partial<AnnouncementContentSettings>)=>onSettings({...settings,...v})
  return <div className="space-y-4" dir="rtl">
    <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 text-xs text-blue-800">ההודעות מנוהלות בתפריט הודעות. כאן בוחרים אילו הודעות יופיעו במסך הנוכחי. הודעות שלא נבחרו לא יוצגו.</div>
    <div className="space-y-2"><label className="text-sm font-semibold">בחירת הודעות למסך</label>
      {error&&<p className="text-red-600 text-xs">{error}</p>}
      {!error&&all.length===0&&<p className="text-xs text-gray-500">אין הודעות במאגר. צור הודעה דרך תפריט הודעות.</p>}
      {all.map(a=><label key={a.id} className="flex items-start gap-2 border rounded-lg p-2.5 cursor-pointer hover:bg-gray-50">
        <input type="checkbox" className="mt-1" checked={ids.includes(a.id)} onChange={e=>patch({selectedAnnouncementIds:e.target.checked?[...ids,a.id]:ids.filter(id=>id!==a.id)})}/>
        <span className="min-w-0"><span className="block text-sm font-medium">{a.title}</span><span className="block text-xs text-gray-500 truncate">{a.body}</span><span className="text-[11px] text-gray-400">{a.active?'פעילה':'כבויה'} · {new Date(a.startAt).toLocaleDateString('he-IL')} – {new Date(a.endAt).toLocaleDateString('he-IL')}</span></span>
      </label>)}
      <p className="text-xs text-gray-500">נבחרו {ids.length} הודעות. רק הודעות פעילות ובתוקף יוצגו בפועל.</p>
    </div>
    <div className="rounded-xl border p-3 space-y-2">
      <label className="flex justify-between text-sm">הצג כותרת לאזור<input type="checkbox" checked={settings.showSectionTitle??true} onChange={e=>patch({showSectionTitle:e.target.checked})}/></label>
      {(settings.showSectionTitle??true)&&<input className="w-full border rounded-lg p-2 text-sm" value={settings.sectionTitle??'הודעות כלליות'} onChange={e=>patch({sectionTitle:e.target.value})} placeholder="כותרת האזור"/>}
      <label className="flex justify-between items-center text-sm">זמן מעבר (שניות)<input className="w-20 border rounded-lg p-2" type="number" min={5} max={120} value={settings.rotationSecs??10} onChange={e=>patch({rotationSecs:Number(e.target.value)})}/></label>
    </div>
    <a className="text-blue-600 underline text-sm" href="/admin/announcements">לניהול ויצירת הודעות ↗</a>
  </div>
}
