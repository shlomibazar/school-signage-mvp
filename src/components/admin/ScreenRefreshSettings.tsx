'use client'

import { useState } from 'react'

type ScreenRow = { id: string; name: string; refreshSecs: number; school: { name: string } }
const choices = [300, 600, 900]
export default function ScreenRefreshSettings({ screens, canEdit }: { screens: ScreenRow[]; canEdit: boolean }) {
  const [rows, setRows] = useState(screens)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<Record<string, string>>({})
  async function save(id: string, שניות: number) {
    setBusy(id)
    setMessage(prev => ({ ...prev, [id]: '' }))
    try {
      const response = await fetch(`/api/screens/${encodeURIComponent(id)}/refresh`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshSecs: שניות }),
      })
      if (!response.ok) throw new Error('שמירת ההגדרה נכשלה')
      setRows(prev => prev.map(row => row.id === id ? { ...row, refreshSecs: שניות } : row))
      setMessage(prev => ({ ...prev, [id]: 'נשמר בהצלחה' }))
    } catch {
      setMessage(prev => ({ ...prev, [id]: 'לא ניתן לשמור. נסו שוב.' }))
    } finally { setBusy(null) }
  }
  return <div dir="rtl" className="space-y-4">
    <div><h2 className="text-base font-semibold text-gray-900">תדירות רענון התוכן</h2><p className="text-sm text-gray-500 mt-1">בחרו באיזו תדירות כל מסך ציבורי יטען מחדש את התוכן. הגדרה זו אינה משנה את זמני המעבר בגלריות.</p></div>
    {screens.length === 0 && <p className="text-sm text-gray-500">לא נמצאו מסכים.</p>}
    {rows.map(row => <div key={row.id} className="border-t border-gray-100 pt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div><div className="font-medium text-sm text-gray-800">{row.name}</div><div className="text-xs text-gray-500">{row.school.name}</div></div>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label={`תדירות רענון עבור ${row.name}`} disabled={!canEdit || busy === row.id} value={choices.includes(row.refreshSecs) ? row.refreshSecs : 'legacy'} onChange={e => save(row.id, Number(e.target.value))} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
          {!choices.includes(row.refreshSecs) && <option value="legacy" disabled>תדירות נוכחית: {row.refreshSecs} שניות</option>}
          <option value={300}>כל 5 דקות</option><option value={600}>כל 10 דקות</option><option value={900}>כל 15 דקות</option>
        </select>
        {busy === row.id && <span className="text-xs text-gray-500">שומר...</span>}
        {message[row.id] && <span role="status" className="text-xs text-gray-600">{message[row.id]}</span>}
      </div>
    </div>)}
    <p className="text-xs text-gray-500">מסכים קיימים ישמרו על התדירות הנוכחית עד לשינוי כאן. מסכים חדשים יוגדרו ל־10 דקות כברירת מחדל. במסך פתוח, השינוי ייכנס לתוקף לאחר הרענון המתוזמן הבא או לאחר פתיחה מחדש.</p>
  </div>
}
