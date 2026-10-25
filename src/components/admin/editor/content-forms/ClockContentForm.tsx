'use client'
// src/components/admin/editor/content-forms/ClockContentForm.tsx

import { Switch } from '@/components/ui/Switch'
import type { ClockSettings } from '@/types'

interface Props {
  settings: ClockSettings
  onChange: (s: ClockSettings) => void
}

export default function ClockContentForm({ settings, onChange }: Props) {
  const now   = new Date()
  const h24   = now.getHours().toString().padStart(2, '0')
  const h12   = (now.getHours() % 12 || 12).toString().padStart(2, '0')
  const ampm  = now.getHours() >= 12 ? 'PM' : 'AM'
  const mins  = now.getMinutes().toString().padStart(2, '0')
  const secs  = now.getSeconds().toString().padStart(2, '0')

  const preview = settings.hourFormat === '12'
    ? `${h12}:${mins}${settings.showSeconds ? `:${secs}` : ''} ${ampm}`
    : `${h24}:${mins}${settings.showSeconds ? `:${secs}` : ''}`

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-gray-500 mb-2">פורמט שעה</label>
        <div className="flex gap-2">
          {(['24', '12'] as const).map(fmt => (
            <button
              key={fmt}
              type="button"
              onClick={() => onChange({ ...settings, hourFormat: fmt })}
              className={`flex-1 py-2 text-xs rounded-lg border transition-colors ${
                settings.hourFormat === fmt
                  ? 'bg-blue-500 text-white border-blue-500'
                  : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {fmt === '24' ? '24 שעות (14:30)' : '12 שעות (2:30 PM)'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-700">הצג שניות</span>
        <Switch
          checked={settings.showSeconds}
          onCheckedChange={v => onChange({ ...settings, showSeconds: v })}
        />
      </div>

      <div className="rounded-xl bg-gray-900 flex items-center justify-center py-8">
        <span className="text-white font-light tabular-nums" style={{ fontSize: 40, letterSpacing: '-0.02em' }}>
          {preview}
        </span>
      </div>
    </div>
  )
}
