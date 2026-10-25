'use client'
// src/components/admin/editor/content-forms/WeatherContentForm.tsx

import type { ContentItem } from '@/types'

interface Props {
  item:     Partial<ContentItem>
  onChange: (patch: Partial<ContentItem>) => void
}

const DISPLAY_MODES = [
  { value: 'full',    label: 'מלא — טמפרטורה + תיאור + עיר' },
  { value: 'compact', label: 'קומפקטי — טמפרטורה + עיר' },
  { value: 'minimal', label: 'מינימלי — טמפרטורה בלבד' },
]

export default function WeatherContentForm({ item, onChange }: Props) {
  const settings = (item.settings ?? {}) as Record<string, string>

  function patchSettings(key: string, value: string) {
    onChange({ settings: { ...settings, [key]: value } as any })
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-gray-500 mb-1.5">עיר / מיקום</label>
        <input
          type="text"
          value={item.weatherCity ?? ''}
          onChange={e => onChange({ weatherCity: e.target.value || null })}
          placeholder="לדוגמה: Tel Aviv"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-gray-50"
          dir="ltr"
        />
        <p className="text-[10px] text-gray-400 mt-1">שם העיר באנגלית (OpenWeatherMap)</p>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-2">יחידות טמפרטורה</label>
        <div className="flex gap-2">
          {[
            { value: 'metric',   label: '°C — צלזיוס' },
            { value: 'imperial', label: '°F — פרנהייט' },
          ].map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ weatherUnits: opt.value })}
              className={`flex-1 py-2 text-xs rounded-lg border transition-colors ${
                (item.weatherUnits ?? 'metric') === opt.value
                  ? 'bg-blue-500 text-white border-blue-500'
                  : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-2">מצב תצוגה</label>
        <div className="space-y-1.5">
          {DISPLAY_MODES.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => patchSettings('displayMode', opt.value)}
              className={`w-full text-right px-3 py-2 text-xs rounded-lg border transition-colors ${
                (settings.displayMode ?? 'full') === opt.value
                  ? 'bg-blue-50 border-blue-400 text-blue-700'
                  : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl bg-gray-900 flex flex-col items-center justify-center py-6 gap-2">
        <div style={{ fontSize: 40 }}>🌤</div>
        <div className="text-white font-light" style={{ fontSize: 36 }}>
          24°{(item.weatherUnits ?? 'metric') === 'metric' ? 'C' : 'F'}
        </div>
        {(settings.displayMode ?? 'full') !== 'minimal' && (
          <div className="text-white/60 text-sm">{item.weatherCity || 'עיר לא הוגדרה'}</div>
        )}
        {(settings.displayMode ?? 'full') === 'full' && (
          <div className="text-white/40 text-xs">שמיים מעוננים חלקית</div>
        )}
      </div>
    </div>
  )
}
