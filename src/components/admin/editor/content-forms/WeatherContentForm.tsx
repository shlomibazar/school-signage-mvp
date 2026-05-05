'use client'
// src/components/admin/editor/content-forms/WeatherContentForm.tsx

import type { ContentItem } from '@/types'

interface Props {
  item:     Partial<ContentItem>
  onChange: (patch: Partial<ContentItem>) => void
}

export default function WeatherContentForm({ item, onChange }: Props) {
  return (
    <div className="space-y-3">
      {/* City */}
      <div>
        <label className="block text-xs text-gray-500 mb-1.5">עיר</label>
        <input
          type="text"
          value={item.weatherCity ?? ''}
          onChange={e => onChange({ weatherCity: e.target.value || null })}
          placeholder="לדוגמה: Tel Aviv"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-gray-50"
          dir="ltr"
        />
        <p className="text-[10px] text-gray-400 mt-1">שם העיר באנגלית כפי שמופיע ב-OpenWeatherMap</p>
      </div>

      {/* Units */}
      <div>
        <label className="block text-xs text-gray-500 mb-1.5">יחידות טמפרטורה</label>
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

      {/* Preview */}
      <div className="rounded-xl bg-gray-900 flex flex-col items-center justify-center py-6 gap-2">
        <div style={{ fontSize: 40 }}>🌤</div>
        <div className="text-white text-3xl font-light">24°</div>
        <div className="text-white/50 text-sm">
          {item.weatherCity ?? 'עיר לא הוגדרה'}
        </div>
        <p className="text-white/30 text-xs mt-2">
          נתוני מזג אויר אמיתיים ידרשו API Key ב-Phase 3
        </p>
      </div>
    </div>
  )
}
