'use client'
// src/components/admin/editor/content-forms/TimetableContentForm.tsx

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { TimetableSettings } from '@/types'

interface Props {
  settings:   TimetableSettings
  onSettings: (s: TimetableSettings) => void
}

export default function TimetableContentForm({ settings, onSettings }: Props) {
  const [newItem, setNewItem] = useState('')
  const [expanded, setExpanded] = useState(false)

  const items = settings.items ?? []

  function addItem() {
    const trimmed = newItem.trim()
    if (!trimmed) return
    onSettings({ ...settings, items: [...items, trimmed] })
    setNewItem('')
  }

  function removeItem(index: number) {
    onSettings({ ...settings, items: items.filter((_, i) => i !== index) })
  }

  function updateItem(index: number, value: string) {
    const next = [...items]
    next[index] = value
    onSettings({ ...settings, items: next })
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 space-y-2" dir="rtl">
        <label className="block text-sm font-semibold text-blue-900">תצוגת שינויי מערכת</label>
        <select value={settings.displayMode ?? 'list'} onChange={e => onSettings({...settings,displayMode:e.target.value as TimetableSettings['displayMode']})} className="w-full border border-blue-200 rounded-lg p-2 text-sm bg-white">
          <option value="list">רשימה ידנית רגילה</option><option value="long">הודעות ידניות – עמודים מתחלפים</option><option value="webtop-list">Webtop – רשימת שינויים אוטומטית</option><option value="webtop-grid">Webtop – טבלת כל הכיתות מתחלפת</option>
        </select>
        {settings.displayMode === 'long' && <>
          <p className="text-xs text-blue-800">כל שורה בטקסט החופשי היא שינוי נפרד. הודעות ארוכות מתחלקות לעמודים.</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">שניות לעמוד<input type="number" min={5} max={120} value={settings.pageSeconds??12} onChange={e=>onSettings({...settings,pageSeconds:Math.max(5,Math.min(120,Number(e.target.value)||12))})} className="w-full border rounded-lg p-2 mt-1"/></label>
            <label className="text-xs">שורות לעמוד<input type="number" min={1} max={12} value={settings.linesPerPage??4} onChange={e=>onSettings({...settings,linesPerPage:Math.max(1,Math.min(12,Number(e.target.value)||4))})} className="w-full border rounded-lg p-2 mt-1"/></label>
          </div>
        </>}
      </div>
      {(settings.displayMode==='webtop-list'||settings.displayMode==='webtop-grid') && <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3 space-y-3" dir="rtl">
        <p className="text-sm font-semibold text-cyan-900">סנכרון חי מ־Webtop (לא מקובץ JSON)</p>
        <label className="block text-xs">סמל מוסד<input className="w-full mt-1 p-2 border rounded-lg" inputMode="numeric" value={settings.institutionCode??''} placeholder="540062" onChange={e=>onSettings({...settings,institutionCode:e.target.value.replace(/\D/g,'').slice(0,10)})}/></label>
        <div className="text-xs font-medium">שכבות להצגה</div>
        <div className="grid grid-cols-3 gap-2">{[7,8,9,10,11,12].map((grade,i)=><label key={grade} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={(settings.grades??[7,8,9,10,11,12]).includes(grade)} onChange={e=>onSettings({...settings,grades:e.target.checked?[...new Set([...(settings.grades??[7,8,9,10,11,12]),grade])].sort((a,b)=>a-b):(settings.grades??[7,8,9,10,11,12]).filter(g=>g!==grade)})}/>{['ז׳','ח׳','ט׳','י׳','י״א','י״ב'][i]}</label>)}</div>
        <div className="rounded-lg border border-cyan-200 bg-white p-3 space-y-2">
          <div className="font-semibold text-xs">סוגי נתונים להצגה (בשתי התצוגות)</div>
          <div className="grid grid-cols-2 gap-2">{([['showChanges','שינויי מערכת'],['showExams','מבחנים'],['showEvents','אירועים'],['showMessages','הודעות כלליות']] as const).map(([key,label])=><label key={key} className="text-xs flex gap-2 items-center"><input type="checkbox" checked={settings[key]!==false} onChange={e=>onSettings({...settings,[key]:e.target.checked})}/>{label}</label>)}</div>
        </div>
        <div className="rounded-lg border border-cyan-200 bg-white p-3 space-y-2">
          <div className="font-semibold text-xs">תאריך ושעות</div>
          <select className="w-full border rounded-lg p-2 text-xs" value={settings.dateMode??'today'} onChange={e=>onSettings({...settings,dateMode:e.target.value as TimetableSettings['dateMode']})}><option value="today">היום</option><option value="tomorrow">מחר</option><option value="specific">תאריך מסוים</option></select>
          {settings.dateMode==='specific'&&<input type="date" className="w-full border rounded-lg p-2 text-xs" value={settings.specificDate??''} onChange={e=>onSettings({...settings,specificDate:e.target.value})}/>}
          <div className="grid grid-cols-2 gap-2"><label className="text-xs">משיעור<input type="number" min={1} max={24} className="w-full border rounded-lg p-2" value={settings.hourFrom??1} onChange={e=>onSettings({...settings,hourFrom:Math.max(1,Math.min(24,Number(e.target.value)||1))})}/></label><label className="text-xs">עד שיעור<input type="number" min={1} max={24} className="w-full border rounded-lg p-2" value={settings.hourTo??12} onChange={e=>onSettings({...settings,hourTo:Math.max(1,Math.min(24,Number(e.target.value)||12))})}/></label></div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs">רענון (שניות)<input className="w-full mt-1 p-2 border rounded-lg" type="number" min={30} max={600} value={settings.refreshSeconds??60} onChange={e=>onSettings({...settings,refreshSeconds:Math.max(30,Math.min(600,Number(e.target.value)||60))})}/></label>
          <label className="text-xs">זמן לכל עמוד (שניות)<input className="w-full mt-1 p-2 border rounded-lg" type="number" min={5} max={120} value={settings.pageSeconds??12} onChange={e=>onSettings({...settings,pageSeconds:Math.max(5,Math.min(120,Number(e.target.value)||12))})}/></label>
        </div>
        {settings.displayMode==='webtop-grid'&&<div className="space-y-3 rounded-lg border border-cyan-200 p-2">
          <label className="block text-xs">כיתות בעמוד (0 = אוטומטי לפי רוחב)<input className="w-full mt-1 p-2 border rounded-lg" type="number" min={0} max={20} value={settings.columnsPerPage??0} onChange={e=>onSettings({...settings,columnsPerPage:Math.max(0,Math.min(20,Number(e.target.value)||0))})}/></label>
          <label className="block text-xs">רוחב מינימלי לכיתה במצב אוטומטי (פיקסלים)<input className="w-full mt-1 p-2 border rounded-lg" type="number" min={90} max={400} value={settings.minColumnWidth??140} onChange={e=>onSettings({...settings,minColumnWidth:Math.max(90,Math.min(400,Number(e.target.value)||140))})}/></label>
          <div className="grid grid-cols-2 gap-2">{([['headerFontSize','גופן כותרת כיתה',22],['bodyFontSize','גופן שיעורים ושינויים',16],['detailFontSize','גופן מורים וחדרים',12],['scrollSpeed','מהירות גלילה (פיקסלים/שנייה)',35]] as const).map(([key,label,def])=><label key={key} className="text-xs">{label}<input type="number" min={key==='scrollSpeed'?5:8} max={key==='scrollSpeed'?150:48} value={settings[key]??def} onChange={e=>onSettings({...settings,[key]:Math.max(key==='scrollSpeed'?5:8,Math.min(key==='scrollSpeed'?150:48,Number(e.target.value)||def))})} className="w-full mt-1 p-2 border rounded-lg"/></label>)}</div>
          <label className="flex gap-2 items-center text-xs"><input type="checkbox" checked={settings.showEmptyHours!==false} onChange={e=>onSettings({...settings,showEmptyHours:e.target.checked})}/>הצג גם שעות ללא נתונים</label>
          <label className="flex gap-2 items-center text-xs"><input type="checkbox" checked={settings.showStudyGroup===true} onChange={e=>onSettings({...settings,showStudyGroup:e.target.checked})}/>הצג שם קבוצת לימוד (אם קיים)</label>
          <label className="block text-xs">השהיה לפני גלילה (שניות)<input className="w-full border rounded-lg p-2 mt-1" type="number" min={0} max={30} value={settings.scrollDelaySeconds??2} onChange={e=>onSettings({...settings,scrollDelaySeconds:Math.max(0,Math.min(30,Number(e.target.value)||0))})}/></label>
          <p className="text-xs text-cyan-800">כאשר התוכן ארוך, הטבלה גוללת עד סוף השעות ורק אז עוברת לכיתות הבאות.</p>
        </div>}
        <p className="text-xs text-cyan-800">הטבלה מתאימה את מספר הכיתות לרוחב האזור ומחליפה עמודים עד להצגת כל הכיתות שנבחרו.</p>
      </div>}
      <div>
        <label className="block text-xs text-gray-500 mb-1.5">כותרת</label>
        <input
          type="text"
          value={settings.title ?? ''}
          onChange={e => onSettings({ ...settings, title: e.target.value })}
          placeholder="לדוגמה: תפריט היום / לוח השיעורים"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-gray-50"
        />
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1.5">טקסט חופשי (אופציונלי)</label>
        {settings.displayMode === 'long' && <button type="button" onClick={()=>setExpanded(true)} className="text-blue-600 text-xs mb-2 underline">פתח עורך רחב להודעות ארוכות ↗</button>}
        <textarea
          rows={settings.displayMode === 'long' ? 12 : 3}
          value={settings.menuText ?? ''}
          onChange={e => onSettings({ ...settings, menuText: e.target.value })}
          placeholder="תוכן חופשי — ניתן לכתוב את התפריט בשורות..."
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400 bg-gray-50"
        />
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1.5">
          פריטים מובנים (שורה אחת לפריט)
        </label>

        {/* Existing items */}
        <div className="space-y-1.5 mb-2">
          {items.map((it, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-4 shrink-0 text-left">{idx + 1}.</span>
              <input
                type="text"
                value={it}
                onChange={e => updateItem(idx, e.target.value)}
                className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-gray-50"
              />
              <button
                type="button"
                onClick={() => removeItem(idx)}
                className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        {/* Add item */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newItem}
            onChange={e => setNewItem(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addItem()}
            placeholder="פריט חדש... (Enter להוספה)"
            className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-gray-50"
          />
          <button
            type="button"
            onClick={addItem}
            disabled={!newItem.trim()}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-500 text-white text-xs rounded-lg hover:bg-blue-600 disabled:opacity-40 transition-colors shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            הוסף
          </button>
        </div>
      </div>

      {expanded && <div className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-4" dir="rtl" role="dialog" aria-modal="true" aria-label="עריכת הודעות ארוכות">
        <div className="bg-white rounded-2xl p-5 w-full max-w-5xl h-[85vh] flex flex-col gap-3 shadow-2xl">
          <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold">עריכת שינויי מערכת והודעות ארוכות</h2><button type="button" onClick={()=>setExpanded(false)} className="rounded-lg bg-blue-600 text-white px-5 py-2">סגור וחזור לעורך</button></div>
          <p className="text-sm text-gray-500">כל שורה היא הודעה נפרדת. מומלץ: כיתה | שיעור | מקצוע – תיאור השינוי. השינויים נשמרים בעורך; יש ללחוץ גם על ״שמור פריסה״.</p>
          <textarea autoFocus className="w-full flex-1 min-h-0 resize-none border border-gray-300 rounded-xl p-4 leading-7 text-base font-medium focus:outline-blue-500" value={settings.menuText??''} onChange={e=>onSettings({...settings,menuText:e.target.value})}/>
          <div className="text-xs text-gray-500">{(settings.menuText??'').split(/\r?\n/).filter(x=>x.trim()).length} הודעות</div>
        </div>
      </div>}
      {/* Preview */}
      <div className="rounded-xl bg-gray-900 p-4">
        <div className="text-white font-semibold text-sm mb-3">
          {settings.title || 'כותרת'}
        </div>
        {settings.menuText && (
          <div className="text-white/70 text-xs leading-relaxed mb-3 whitespace-pre-line">
            {settings.menuText}
          </div>
        )}
        {items.length > 0 && (
          <ul className="space-y-1.5">
            {items.map((it, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-blue-400 text-xs shrink-0 mt-0.5">•</span>
                <span className="text-white/70 text-xs">{it}</span>
              </li>
            ))}
          </ul>
        )}
        {!settings.menuText && items.length === 0 && (
          <div className="text-white/30 text-xs">הוסף פריטים לתצוגה מקדימה</div>
        )}
      </div>
    </div>
  )
}
