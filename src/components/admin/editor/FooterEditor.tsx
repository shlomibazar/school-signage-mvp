'use client'
// src/components/admin/editor/FooterEditor.tsx

import { Switch } from '@/components/ui/Switch'
import type { ScreenLayout } from '@/types'

interface Props {
  layout:   ScreenLayout
  onChange: (patch: Partial<ScreenLayout>) => void
}

export default function FooterEditor({ layout, onChange }: Props) {
  const toggle = (key: keyof ScreenLayout) =>
    onChange({ [key]: !layout[key] })

  if (!layout.footerEnabled) {
    return (
      <div className="bg-white border border-gray-100 rounded-xl p-4 text-center text-sm text-gray-400">
        הכותרת התחתונה כבויה
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-3 py-2.5 bg-gray-50 text-xs font-medium text-gray-500 border-b border-gray-100">
        אפשרויות כותרת תחתונה
      </div>
      <div className="divide-y divide-gray-50">
        <Row label="שם בית הספר" checked={layout.footerShowSchoolName} onChange={() => toggle('footerShowSchoolName')} />
        <Row label="שעון"         checked={layout.footerShowClock}       onChange={() => toggle('footerShowClock')} />
      </div>

      {/* Ticker text */}
      <div className="p-3 border-t border-gray-50">
        <label className="block text-xs text-gray-500 mb-1.5">טקסט גלילה (טיקר)</label>
        <textarea
          value={layout.footerTicker ?? ''}
          onChange={e => onChange({ footerTicker: e.target.value || null })}
          placeholder="הודעה גוללת בתחתית המסך..."
          rows={3}
          className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400 bg-gray-50"
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
