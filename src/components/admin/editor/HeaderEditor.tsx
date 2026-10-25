'use client'
import { useState, useEffect } from 'react'
import { ISRAEL_WEATHER_CITIES } from '@/lib/israelWeatherCities'
import toast from 'react-hot-toast'
import { Switch } from '@/components/ui/Switch'
import type { ScreenLayout, DateType } from '@/types'

interface Props { layout: ScreenLayout; onChange: (p: Partial<ScreenLayout>) => void; schoolId: string; weatherCity?: string | null; onWeatherCityChange?: (city:string|null)=>void; logoUrl?: string | null; onLogoChange?: (url: string | null) => void }

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

export default function HeaderEditor({ layout, onChange, schoolId, logoUrl, onLogoChange, weatherCity, onWeatherCityChange }: Props) {
  const [uploading, setUploading] = useState(false)
  const displayCity=(value:string|null|undefined)=>value?.includes('|')?value.split('|').slice(1).join('|'):value??''
  const [cityInput, setCityInput] = useState(displayCity(weatherCity))
  const [selectedCity, setSelectedCity] = useState<string|null>(weatherCity ?? null)
  const [cityOpen, setCityOpen] = useState(false)
  useEffect(()=>{setCityInput(displayCity(weatherCity));setSelectedCity(weatherCity??null)},[weatherCity])
  const cityResults = cityInput.trim().length > 0
    ? ISRAEL_WEATHER_CITIES.filter(c=>c.name.includes(cityInput.trim())||c.english.toLowerCase().includes(cityInput.trim().toLowerCase())).slice(0,12)
    : []
  const selectCity=(c:typeof ISRAEL_WEATHER_CITIES[number])=>{
    setCityInput(c.name);setSelectedCity(`${c.latitude},${c.longitude}|${c.name}`);setCityOpen(false)
  }
  const [savingCity, setSavingCity] = useState(false)
  const saveCity = async () => {
    if (cityInput.trim() && (!selectedCity || displayCity(selectedCity)!==cityInput.trim())) {
      toast.error('יש לבחור יישוב מתוך הרשימה');return
    }
    setSavingCity(true)
    try {
      const response = await fetch(`/api/schools/${encodeURIComponent(schoolId)}/weather-city`, {method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({city:selectedCity ?? ''})})
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'שמירת העיר נכשלה')
      onWeatherCityChange?.(data.weatherCity)
      toast.success('עיר מזג האוויר נשמרה לכל מסכי בית הספר')
    } catch(e) {toast.error(e instanceof Error ? e.message : 'שגיאה בשמירת העיר')}
    finally {setSavingCity(false)}
  }
  const uploadLogo = async (file: File) => {
    if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 3 * 1024 * 1024) { toast.error('יש לבחור תמונת PNG/JPG/WebP עד 3MB'); return }
    setUploading(true)
    try {
      const body = new FormData(); body.append('file', file)
      const response = await fetch(`/api/schools/${encodeURIComponent(schoolId)}/logo`, { method: 'POST', body })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'העלאה נכשלה')
      onLogoChange?.(data.logoUrl)
      toast.success('הלוגו נשמר לבית הספר')
    } catch (error) { toast.error(error instanceof Error ? error.message : 'שגיאה בהעלאת הלוגו') }
    finally { setUploading(false) }
  }
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
          <label className="block text-xs font-medium text-gray-700">לוגו בית הספר (משותף לכל המסכים)</label>
          {logoUrl && <img src={logoUrl} alt="לוגו נוכחי" className="h-14 w-auto max-w-full object-contain" />}
          <input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={e=>{ const file=e.target.files?.[0]; if(file) void uploadLogo(file); e.currentTarget.value='' }} className="block w-full text-xs" />
          <p className="text-xs text-gray-500">PNG, JPG או WebP עד 3MB. הלוגו נשמר מיד ומשותף לכל המסכים.</p>
        </div>
        {layout.headerShowWeather && <div className="rounded-lg bg-blue-50 p-3 space-y-2">
          <label htmlFor="school-weather-city" className="block text-xs font-semibold text-gray-700">עיר בית הספר למזג האוויר (משותפת לכל המסכים)</label>
          <div className="flex gap-2">
            <div className="relative flex-1 min-w-0">
              <input id="school-weather-city" autoComplete="off" dir="rtl" value={cityInput}
                onFocus={()=>setCityOpen(true)}
                onChange={e=>{setCityInput(e.target.value);setSelectedCity(null);setCityOpen(true)}}
                placeholder="חפש יישוב בישראל..." maxLength={80}
                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
              {cityOpen && cityResults.length>0 && <div className="absolute z-50 top-full mt-1 w-full max-h-52 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                {cityResults.map(c=><button key={c.name} type="button" onClick={()=>selectCity(c)}
                  className="block w-full px-3 py-2 text-right text-sm hover:bg-blue-50">{c.name}</button>)}
              </div>}
              {cityOpen && cityInput.trim() && cityResults.length===0 && <div className="absolute z-50 top-full mt-1 w-full rounded-lg border bg-white px-3 py-2 text-xs text-gray-600">לא נמצא יישוב ברשימה</div>}
            </div>
            <button type="button" disabled={savingCity || (!!cityInput.trim() && (!selectedCity || displayCity(selectedCity)!==cityInput.trim()))} onClick={()=>void saveCity()} className="rounded-lg bg-blue-600 text-white px-3 py-1.5 text-xs disabled:opacity-50">{savingCity?'שומר...':'שמור עיר'}</button>
          </div>
          <p className="text-xs text-gray-500">בחר יישוב מתוך התוצאות ולחץ שמור. המיקום המדויק יישמר לכל המסכים. מתעדכן כל 15 דקות.</p>
        </div>}
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
