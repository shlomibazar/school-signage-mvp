'use client'
// src/components/admin/editor/content-forms/RssContentForm.tsx

import type { ContentItem, RssSettings } from '@/types'

interface Props {
  item:     Partial<ContentItem>
  settings: RssSettings
  onChange: (patch: Partial<ContentItem>) => void
  onSettings: (s: RssSettings) => void
}

export default function RssContentForm({ item, settings, onChange, onSettings }: Props) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-gray-500 mb-1.5">כתובת RSS Feed</label>
        <input
          type="url"
          value={item.rssUrl ?? ''}
          onChange={e => onChange({ rssUrl: e.target.value || null })}
          placeholder="https://example.com/feed.xml"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-gray-50 font-mono"
          dir="ltr"
        />
      </div>

      <div>
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">רענון (דקות)</label>
          <input
            type="number"
            min={5}
            max={60}
            step={5}
            value={settings.refreshInterval ?? 15}
            onChange={e => onSettings({ ...settings, refreshInterval: Number(e.target.value) })}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-gray-50"
            dir="ltr"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-2">סגנון תצוגה</label>
        <div className="flex gap-2">
          {[
            { value: 'list',   label: 'רשימה' },
            { value: 'ticker', label: 'גלילה (ticker)' },
          ].map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSettings({ ...settings, displayStyle: opt.value as RssSettings['displayStyle'] })}
              className={`flex-1 py-2 text-xs rounded-lg border transition-colors ${
                (settings.displayStyle ?? 'list') === opt.value
                  ? 'bg-blue-500 text-white border-blue-500'
                  : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl bg-gray-900 p-4">
        <p className="text-white/40 text-xs mb-3">תצוגה מקדימה</p>
        {settings.displayStyle === 'ticker' ? (
          <div className="text-white/70 text-sm border-t border-white/10 pt-2 truncate">
            📰 כותרת ראשונה • כותרת שנייה • כותרת שלישית
          </div>
        ) : (
          <ul className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-blue-400 text-xs mt-0.5">•</span>
                <span className="text-white/70 text-xs">כותרת פריט {i + 1} מה-Feed</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
