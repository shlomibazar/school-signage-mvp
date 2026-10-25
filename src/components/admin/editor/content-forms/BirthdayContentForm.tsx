'use client'
// src/components/admin/editor/content-forms/BirthdayContentForm.tsx

import type { BirthdaySettings } from '@/types'

interface Props {
  settings:   BirthdaySettings
  onSettings: (s: BirthdaySettings) => void
}

export default function BirthdayContentForm({ settings, onSettings }: Props) {
  function patch(key: keyof BirthdaySettings, value: string) {
    onSettings({ ...settings, [key]: value })
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs text-gray-500 mb-1.5">שם</label>
        <input
          type="text"
          value={settings.personName ?? ''}
          onChange={e => patch('personName', e.target.value)}
          placeholder="שם התלמיד / ה"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-gray-50"
        />
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1.5">כיתה / שכבה</label>
        <input
          type="text"
          value={settings.grade ?? ''}
          onChange={e => patch('grade', e.target.value)}
          placeholder='לדוגמה: ז׳3 או "צוות מורים"'
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-gray-50"
        />
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1.5">תאריך יום הולדת</label>
        <input
          type="date"
          value={settings.birthDate ?? ''}
          onChange={e => patch('birthDate', e.target.value)}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-gray-50"
          dir="ltr"
        />
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1.5">ברכה</label>
        <textarea
          rows={2}
          value={settings.greetingText ?? ''}
          onChange={e => patch('greetingText', e.target.value)}
          placeholder="יום הולדת שמח! 🎂"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400 bg-gray-50"
        />
      </div>

      {/* Preview */}
      <div className="rounded-xl bg-gradient-to-br from-purple-900 to-pink-900 p-5 text-center">
        <div className="text-4xl mb-2">🎂</div>
        <div className="text-white font-bold text-lg">
          {settings.personName || 'שם התלמיד/ה'}
        </div>
        {settings.grade && (
          <div className="text-white/60 text-sm mt-0.5">{settings.grade}</div>
        )}
        <div className="text-white/80 text-sm mt-3 leading-relaxed">
          {settings.greetingText || 'יום הולדת שמח! 🎉'}
        </div>
      </div>
    </div>
  )
}
