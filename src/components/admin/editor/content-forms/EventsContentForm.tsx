'use client'
// src/components/admin/editor/content-forms/EventsContentForm.tsx

import type { EventSettings } from '@/types'

interface Props {
  settings:   EventSettings
  onSettings: (s: EventSettings) => void
}

export default function EventsContentForm({ settings, onSettings }: Props) {
  function patch(key: keyof EventSettings, value: string) {
    onSettings({ ...settings, [key]: value })
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-gray-500 mb-1.5">שם האירוע</label>
        <input
          type="text"
          value={settings.eventTitle ?? ''}
          onChange={e => patch('eventTitle', e.target.value)}
          placeholder="לדוגמה: יום ספורט בית ספרי"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-gray-50"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">תאריך</label>
          <input
            type="date"
            value={settings.eventDate ?? ''}
            onChange={e => patch('eventDate', e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-gray-50"
            dir="ltr"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">שעה</label>
          <input
            type="time"
            value={settings.eventTime ?? ''}
            onChange={e => patch('eventTime', e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-gray-50"
            dir="ltr"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1.5">מיקום</label>
        <input
          type="text"
          value={settings.location ?? ''}
          onChange={e => patch('location', e.target.value)}
          placeholder="לדוגמה: חדר האוכל / חצר בית הספר"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-gray-50"
        />
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1.5">תיאור</label>
        <textarea
          rows={3}
          value={settings.description ?? ''}
          onChange={e => patch('description', e.target.value)}
          placeholder="פרטים נוספים על האירוע..."
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400 bg-gray-50"
        />
      </div>

      {/* Preview */}
      <div className="rounded-xl bg-gray-900 p-4">
        <div className="flex items-start gap-3">
          <div className="text-2xl">🗓</div>
          <div className="flex-1">
            <div className="text-white font-semibold text-sm">
              {settings.eventTitle || 'שם האירוע'}
            </div>
            <div className="flex flex-wrap gap-3 mt-1.5">
              {settings.eventDate && (
                <span className="text-white/60 text-xs">
                  📅 {new Date(settings.eventDate).toLocaleDateString('he-IL', {
                    weekday: 'long', day: 'numeric', month: 'long',
                  })}
                </span>
              )}
              {settings.eventTime && (
                <span className="text-white/60 text-xs">🕐 {settings.eventTime}</span>
              )}
              {settings.location && (
                <span className="text-white/60 text-xs">📍 {settings.location}</span>
              )}
            </div>
            {settings.description && (
              <div className="text-white/50 text-xs mt-2 leading-relaxed">
                {settings.description}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
