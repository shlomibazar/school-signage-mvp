'use client'
import { Switch } from '@/components/ui/Switch'
import type { ScreenLayout } from '@/types'

interface Props { layout: ScreenLayout; onChange: (p: Partial<ScreenLayout>) => void }

const HEIGHT_OPTIONS = [
  { value: 40, label: 'קטן (40px)' },
  { value: 48, label: 'רגיל (48px)' },
  { value: 60, label: 'גדול (60px)' },
  { value: 72, label: 'גדול מאוד (72px)' },
]

export default function FooterEditor({ layout, onChange }: Props) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-3 py-2.5 bg-gray-50 text-xs font-medium text-gray-500 border-b border-gray-100">
        הגדרות כותרת תחתונה
      </div>
      <div className="p-3 space-y-3">
        {/* Height */}
        <div>
          <label className="block text-xs text-gray-500 mb-2">גובה הכותרת התחתונה</label>
          <div className="grid grid-cols-2 gap-1.5">
            {HEIGHT_OPTIONS.map(opt => (
              <button key={opt.value} type="button"
                onClick={() => onChange({ footerHeight: opt.value })}
                className={`py-1.5 text-xs rounded-lg border transition-colors ${
                  (layout.footerHeight ?? 48) === opt.value
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'}`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3 space-y-3">
          <div className="text-sm font-semibold text-gray-800">📰 פס חדשות תחתון</div>
          <p className="text-xs text-gray-500">RSS באזור הראשי ממשיך לעבוד כרשימה עצמאית. כאן אפשר להציג כותרות בפס התחתון.</p>
          <label className="block text-xs text-gray-600">תוכן הפס</label>
          <select className="w-full rounded-lg border border-gray-200 bg-white p-2 text-sm" value={layout.footerFeedMode ?? 'manual'} onChange={e=>onChange({footerFeedMode:e.target.value as 'manual'|'rss'|'both'})}>
            <option value="manual">הודעות בית הספר בלבד</option><option value="rss">RSS בלבד</option><option value="both">שילוב RSS והודעות בית הספר</option>
          </select>
          {(layout.footerFeedMode === 'rss' || layout.footerFeedMode === 'both') && <>
            <label className="block text-xs text-gray-600">כתובת פיד RSS</label>
            <input dir="ltr" type="url" placeholder="https://example.com/feed.xml" value={layout.footerRssUrl ?? ''} onChange={e=>onChange({footerRssUrl:e.target.value || null})} className="w-full rounded-lg border border-gray-200 bg-white p-2 text-xs"/>
            <label className="block text-xs text-gray-600">רענון בדקות
              <input type="number" min={5} max={60} value={layout.footerRssRefreshMinutes ?? 15} onChange={e=>onChange({footerRssRefreshMinutes:Math.max(5,Math.min(60,Number(e.target.value)||5))})} className="mt-1 w-full rounded-lg border border-gray-200 p-2"/>
            </label>
            <p className="text-xs text-gray-500">כל כותרות הפיד הזמינות יופיעו בגלילה, ללא הגבלת כמות ידנית.</p>
          </>}
          <label className="block text-xs text-gray-600">מהירות גלילה</label>
          <select className="w-full rounded-lg border border-gray-200 bg-white p-2 text-sm" value={layout.footerTickerSpeed ?? 'normal'} onChange={e=>onChange({footerTickerSpeed:e.target.value as 'slow'|'normal'|'fast'})}>
            <option value="slow">איטית</option><option value="normal">רגילה</option><option value="fast">מהירה</option>
          </select>
        </div>
        {/* Ticker text */}
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">הודעות בית הספר בגלילה</label>
          <textarea rows={2}
            value={layout.footerTicker ?? ''}
            onChange={e => onChange({ footerTicker: e.target.value || null })}
            placeholder="הודעה שתגלול בחלק התחתון של המסך..."
            className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400 bg-gray-50"
          />
        </div>

        {/* Toggles */}
        <div className="space-y-2">
          {[
            { key: 'footerShowSchoolName', label: 'הצג שם המסך' },
            { key: 'footerShowClock',      label: 'הצג שעון' },
            { key: 'footerShowBirthdays',  label: '🎂 הצג ימי הולדת בגלילה' },
          ].map(item => (
            <div key={item.key} className="flex items-center justify-between">
              <span className="text-xs text-gray-700">{item.label}</span>
              <Switch
                checked={!!layout[item.key as keyof ScreenLayout]}
                onCheckedChange={v => onChange({ [item.key]: v })}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
