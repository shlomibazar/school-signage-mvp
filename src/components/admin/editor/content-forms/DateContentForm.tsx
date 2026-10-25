'use client'
// src/components/admin/editor/content-forms/DateContentForm.tsx

import { formatHebrewDate, formatGregorianDate } from '@/lib/utils'
import type { DateSettings } from '@/types'

interface Props {
  settings: DateSettings
  onChange: (s: DateSettings) => void
}

const FORMAT_OPTIONS: { value: DateSettings['dateFormat']; label: string }[] = [
  { value: 'full',      label: 'מלא — יום, יום בחודש, חודש, שנה' },
  { value: 'short',     label: 'קצר — יום/חודש/שנה' },
  { value: 'daymonth',  label: 'יום וחודש בלבד' },
]

function formatPreview(fmt: DateSettings['dateFormat'], locale: DateSettings['locale']): string {
  const now = new Date()
  if (locale === 'he') {
    if (fmt === 'full')     return formatGregorianDate(now)
    if (fmt === 'short')    return now.toLocaleDateString('he-IL')
    if (fmt === 'daymonth') return now.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })
  } else {
    if (fmt === 'full')     return now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    if (fmt === 'short')    return now.toLocaleDateString('en-US')
    if (fmt === 'daymonth') return now.toLocaleDateString('en-US', { day: 'numeric', month: 'long' })
  }
  return ''
}

export default function DateContentForm({ settings, onChange }: Props) {
  const now       = new Date()
  const preview   = formatPreview(settings.dateFormat, settings.locale)
  const hebrewPre = formatHebrewDate(now)

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-gray-500 mb-2">פורמט תאריך</label>
        <div className="space-y-1.5">
          {FORMAT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ ...settings, dateFormat: opt.value })}
              className={`w-full text-right px-3 py-2 text-xs rounded-lg border transition-colors ${
                settings.dateFormat === opt.value
                  ? 'bg-blue-50 border-blue-400 text-blue-700'
                  : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-2">שפת תאריך</label>
        <div className="flex gap-2">
          {([['he', 'עברית'], ['en', 'English']] as const).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => onChange({ ...settings, locale: val })}
              className={`flex-1 py-2 text-xs rounded-lg border transition-colors ${
                settings.locale === val
                  ? 'bg-blue-500 text-white border-blue-500'
                  : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl bg-gray-900 flex flex-col items-center justify-center py-6 gap-1.5">
        <div className="text-white font-medium text-center" style={{ fontSize: 18 }}>{preview}</div>
        <div className="text-white/40 text-xs">{hebrewPre}</div>
      </div>
    </div>
  )
}
