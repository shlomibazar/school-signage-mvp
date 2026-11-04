'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Settings2 } from 'lucide-react'
import { Switch } from '@/components/ui/Switch'
import { confirmLeaveEditor } from '@/lib/unsavedChanges'
import { weatherCityName } from '@/lib/screenSettings'
import type { ScreenLayout, DateType } from '@/types'

// The school's logo and weather city are shared by all screens and edited in the school settings
// (/admin/settings#school); here they are shown read-only. Whether a screen shows them is a layout
// setting (headerShowLogo / headerShowWeather) and stays here.
interface Props { layout: ScreenLayout; onChange: (p: Partial<ScreenLayout>) => void; weatherCity?: string | null; logoUrl?: string | null }

const HEIGHT_OPTIONS = [
  { value: 60,  label: 'קטן (60px)' },
  { value: 80,  label: 'רגיל (80px)' },
  { value: 100, label: 'גדול (100px)' },
  { value: 120, label: 'גדול מאוד (120px)' },
]

const DATE_TYPE_OPTIONS: { value: DateType; label: string; example: string }[] = [
  { value: 'HEBREW',     label: 'עברי בלבד',       example: '15 בסיוון התשפ"ה' },
  { value: 'GREGORIAN',  label: 'לועזי בלבד',       example: 'יום שלישי, 15 ביוני' },
  { value: 'BOTH',       label: 'שניהם',            example: 'לועזי + עברי' },
]

export default function HeaderEditor({ layout, onChange, logoUrl, weatherCity }: Props) {
  const router = useRouter()
  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-3 py-2.5 bg-gray-50 text-xs font-medium text-gray-500 border-b border-gray-100">
        הגדרות כותרת עליונה
      </div>
      <div className="p-3 space-y-3">
        {/* Height */}
        <div>
          <label className="block text-xs text-gray-500 mb-2">גובה הכותרת</label>
          <div className="grid grid-cols-2 gap-1.5">
            {HEIGHT_OPTIONS.map(opt => (
              <button key={opt.value} type="button"
                onClick={() => onChange({ headerHeight: opt.value, headerTitleFontSize: Math.min(layout.headerTitleFontSize ?? 26, Math.min(64, Math.floor(opt.value * 0.6))) })}
                className={`py-1.5 text-xs rounded-lg border transition-colors ${
                  (layout.headerHeight ?? 80) === opt.value
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'}`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Main heading typography */}
        <div className="rounded-lg border border-gray-200 p-3 space-y-3">
          <label className="block text-xs font-semibold text-gray-700">עיצוב הכותרת הראשית (במרכז)</label>
          <div>
            <label className="block text-xs text-gray-500 mb-1">גודל גופן: {Math.min(layout.headerTitleFontSize ?? 26, Math.min(64, Math.floor((layout.headerHeight ?? 80) * 0.6)))}px</label>
            <input type="range" min={14} max={Math.min(64, Math.floor((layout.headerHeight ?? 80) * 0.6))} step={1} value={Math.min(layout.headerTitleFontSize ?? 26, Math.min(64, Math.floor((layout.headerHeight ?? 80) * 0.6)))}
              onChange={e=>onChange({headerTitleFontSize:Number(e.target.value)})} className="w-full" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">עובי גופן</label>
            <div className="grid grid-cols-3 gap-1.5">
              {[{value:400,label:'רגיל'},{value:600,label:'בינוני'},{value:700,label:'מודגש'}].map(opt=><button
                type="button" key={opt.value} onClick={()=>onChange({headerTitleFontWeight:opt.value})}
                className={`rounded-lg border px-2 py-1.5 text-xs ${(layout.headerTitleFontWeight ?? 700)===opt.value?'bg-blue-500 text-white border-blue-500':'bg-gray-50 text-gray-600 border-gray-200'}`}>
                {opt.label}</button>)}
            </div>
          </div>
        </div>

        {/* Date type */}
        {layout.headerShowDate && (
          <div>
            <label className="block text-xs text-gray-500 mb-2">סוג תאריך</label>
            <div className="space-y-1.5">
              {DATE_TYPE_OPTIONS.map(opt => (
                <button key={opt.value} type="button"
                  onClick={() => onChange({ headerDateType: opt.value })}
                  className={`w-full text-right px-3 py-2 text-xs rounded-lg border transition-colors ${
                    (layout.headerDateType ?? 'BOTH') === opt.value
                      ? 'bg-blue-50 border-blue-400 text-blue-700'
                      : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                  <div className="font-medium">{opt.label}</div>
                  <div className="text-[10px] opacity-60 mt-0.5">{opt.example}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Toggles */}
        <div className="space-y-2">
          {[
            { key: 'headerShowLogo',    label: 'הצג לוגו' },
            { key: 'headerShowTitle',   label: 'הצג שם המסך' },
            { key: 'headerShowClock',   label: 'הצג שעון' },
            { key: 'headerShowDate',    label: 'הצג תאריך' },
            { key: 'headerShowParasha', label: 'הצג פרשת השבוע ליד התאריך' },
            { key: 'headerShowWeather', label: 'הצג מזג אוויר בכותרת' },
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

        <div className="rounded-lg border border-gray-200 p-3 space-y-2">
          <div className="text-xs font-semibold text-gray-700">פרטי בית הספר (משותפים לכל המסכים)</div>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-gray-500">לוגו</span>
            {logoUrl ? <img src={logoUrl} alt="לוגו בית הספר" className="h-8 w-auto max-w-[96px] object-contain" /> : <span className="text-gray-400">לא הוגדר</span>}
          </div>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-gray-500">עיר למזג האוויר</span>
            <span className="truncate text-gray-700">{weatherCityName(weatherCity) || 'ברירת המחדל של המערכת'}</span>
          </div>
          <Link href="/admin/settings#school"
            onClick={e => { e.preventDefault(); void confirmLeaveEditor('יש שינויים שלא נשמרו בעורך. לעבור להגדרות בית הספר ולבטל אותם?').then(ok => { if (ok) router.push('/admin/settings#school') }) }}
            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">
            <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />ניהול בהגדרות בית הספר
          </Link>
        </div>
        {/* Scroll text */}
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">כותרת ראשית (אופציונלי)</label>
          <input type="text"
            value={layout.headerScrollText ?? ''}
            onChange={e => onChange({ headerScrollText: e.target.value || null })}
            placeholder="כותרת שתופיע במרכז הכותרת העליונה..."
            className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-gray-50"
          />
        </div>
      </div>
    </div>
  )
}
