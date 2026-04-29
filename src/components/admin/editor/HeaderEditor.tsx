'use client'
// src/components/admin/editor/HeaderEditor.tsx

import { Switch } from '@/components/ui/Switch'
import type { ScreenLayout } from '@/types'

interface Props {
  layout:   ScreenLayout
  onChange: (patch: Partial<ScreenLayout>) => void
}

export default function HeaderEditor({ layout, onChange }: Props) {
  const toggle = (key: keyof ScreenLayout) =>
    onChange({ [key]: !layout[key] })

  if (!layout.headerEnabled) {
    return (
      <div className="bg-white border border-gray-100 rounded-xl p-4 text-center text-sm text-gray-400">
        הכותרת העליונה כבויה
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-3 py-2.5 bg-gray-50 text-xs font-medium text-gray-500 border-b border-gray-100">
        אפשרויות כותרת עליונה
      </div>
      <div className="divide-y divide-gray-50">
        <Row label="לוגו" checked={layout.headerShowLogo}    onChange={() => toggle('headerShowLogo')} />
        <Row label="שם המסך" checked={layout.headerShowTitle}  onChange={() => toggle('headerShowTitle')} />
        <Row label="שעון"    checked={layout.headerShowClock}  onChange={() => toggle('headerShowClock')} />
        <Row label="תאריך לועזי" checked={layout.headerShowDate}   onChange={() => toggle('headerShowDate')} />
        <Row label="תאריך עברי"  checked={layout.headerShowHebDate} onChange={() => toggle('headerShowHebDate')} />
        <Row label="מזג אויר"    checked={layout.headerShowWeather} onChange={() => toggle('headerShowWeather')} />
      </div>

      {/* Scroll text */}
      <div className="p-3 border-t border-gray-50">
        <label className="block text-xs text-gray-500 mb-1.5">טקסט גלילה בכותרת</label>
        <input
          type="text"
          value={layout.headerScrollText ?? ''}
          onChange={e => onChange({ headerScrollText: e.target.value || null })}
          placeholder="השאר ריק לביטול"
          className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-gray-50"
        />
      </div>
    </div>
  )
}

function Row({
  label,
  checked,
  onChange,
}: {
  label:    string
  checked:  boolean
  onChange: () => void
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5">
      <span className="text-xs text-gray-700">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}
