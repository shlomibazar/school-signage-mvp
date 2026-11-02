'use client'

import { useState } from 'react'
import type { ScreenSchedule } from '@/lib/screenSchedule'

type Row = { id: string; name: string; school: { name: string }; schedule: ScreenSchedule }
const week = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']

export default function ScreenOperatingSettings({ screens, canEdit }: { screens: Row[]; canEdit: boolean }) {
  const [rows, setRows] = useState(screens)
  const [selected, setSelected] = useState(screens[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const row = rows.find(s => s.id === selected)
  const schedule = row?.schedule
  function change(patch: Partial<ScreenSchedule>) {
    setMessage('')
    setRows(previous => previous.map(s => s.id === selected ? { ...s, schedule: { ...s.schedule, ...patch } } : s))
  }
  async function save() {
    if (!row || !canEdit) return
    setBusy(true); setMessage('')
    try {
      const response = await fetch(`/api/screens/${encodeURIComponent(row.id)}/schedule`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(row.schedule),
      })
      if (!response.ok) throw new Error('שמירת ההגדרות נכשלה')
      setMessage('נשמר בהצלחה. במסך פתוח, השינוי יופיע לאחר בדיקת העדכונים הבאה.')
    } catch { setMessage('השמירה נכשלה. בדקו שהעדכון למסד הנתונים הותקן.') }
    finally { setBusy(false) }
  }
  return <div className="space-y-4" dir="rtl">
    <p className="text-sm text-gray-500">בחרו מסך והגדירו מתי התוכן יוצג. מחוץ לשעות הפעילות תופיע תצוגה שחורה וחסכונית.</p>
    <label className="block text-sm font-medium text-gray-700">מסך להגדרה
      <select value={selected} onChange={e => { setSelected(e.target.value); setMessage('') }} className="mt-1 w-full rounded-lg border border-gray-300 p-2 bg-white">
        {rows.map(s => <option key={s.id} value={s.id}>{s.name} — {s.school.name}</option>)}
      </select>
    </label>
    {!row || !schedule ? <p className="text-sm text-gray-500">לא נמצאו מסכים.</p> : <>
      <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={schedule.enabled} disabled={!canEdit} onChange={e => change({ enabled: e.target.checked })}/> הפעל שעות פעילות</label>
      {schedule.enabled && <>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">שעת התחלה<input type="time" value={schedule.startTime} disabled={!canEdit} onChange={e => change({ startTime: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 p-2"/></label>
          <label className="text-sm">שעת סיום<input type="time" value={schedule.endTime} disabled={!canEdit} onChange={e => change({ endTime: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 p-2"/></label>
        </div>
        <div><div className="text-sm font-medium mb-2">ימי פעילות</div><div className="flex flex-wrap gap-2">{week.map((day, i) => <label key={day} className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"><input type="checkbox" disabled={!canEdit} checked={schedule.days.includes(i)} onChange={e => change({ days: e.target.checked ? [...schedule.days, i].sort() : schedule.days.filter(d => d !== i) })}/>{day}</label>)}</div></div>
        <label className="block text-sm font-medium">תצוגה מחוץ לשעות הפעילות
          <select value={schedule.standbyMode} disabled={!canEdit} onChange={e => change({ standbyMode: e.target.value as ScreenSchedule['standbyMode'] })} className="mt-1 w-full rounded-lg border border-gray-300 p-2 bg-white">
            <option value="clock">שעון בלבד</option><option value="message">שעון + נתראה בקרוב</option><option value="logo">שעון + נתראה בקרוב + לוגו בית הספר</option>
          </select>
        </label>
        <p className="text-xs text-gray-500">אם שעת הסיום מוקדמת משעת ההתחלה, הפעילות תימשך אל היום הבא. שעות זהות מציינות יום פעילות מלא.</p>
      </>}
      <button type="button" disabled={!canEdit || busy || schedule.days.length === 0} onClick={save} className="rounded-lg bg-blue-700 text-white px-5 py-2 text-sm disabled:opacity-50">{busy ? 'שומר...' : 'שמור שעות פעילות'}</button>
      {message && <p role="status" className="text-sm text-gray-600">{message}</p>}
    </>}
  </div>
}
