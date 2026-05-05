'use client'
// src/components/admin/editor/SchedulingPanel.tsx

import { Switch } from '@/components/ui/Switch'
import { cn } from '@/lib/utils'

export interface SchedulingValues {
  startDate:  string
  endDate:    string
  startTime:  string
  endTime:    string
  daysOfWeek: number[]
  active:     boolean
}

interface Props {
  values:   SchedulingValues
  onChange: (patch: Partial<SchedulingValues>) => void
}

const DAY_LABELS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'] // Sun–Sat in Hebrew

export default function SchedulingPanel({ values, onChange }: Props) {
  function toggleDay(day: number) {
    const current = values.daysOfWeek
    const next    = current.includes(day)
      ? current.filter(d => d !== day)
      : [...current, day].sort()
    onChange({ daysOfWeek: next })
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-3 py-2.5 bg-gray-50 text-xs font-medium text-gray-500 border-b border-gray-100">
        תזמון תוכן
      </div>

      <div className="p-3 space-y-3">
        {/* Active toggle */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-700">תוכן פעיל</span>
          <Switch
            checked={values.active}
            onCheckedChange={v => onChange({ active: v })}
          />
        </div>

        {/* Date range */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] text-gray-400 mb-1">תאריך התחלה</label>
            <input
              type="date"
              value={values.startDate}
              onChange={e => onChange({ startDate: e.target.value })}
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-gray-50 text-gray-700"
              dir="ltr"
            />
          </div>
          <div>
            <label className="block text-[10px] text-gray-400 mb-1">תאריך סיום</label>
            <input
              type="date"
              value={values.endDate}
              onChange={e => onChange({ endDate: e.target.value })}
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-gray-50 text-gray-700"
              dir="ltr"
            />
          </div>
        </div>

        {/* Time range */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] text-gray-400 mb-1">שעת התחלה</label>
            <input
              type="time"
              value={values.startTime}
              onChange={e => onChange({ startTime: e.target.value })}
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-gray-50 text-gray-700"
              dir="ltr"
            />
          </div>
          <div>
            <label className="block text-[10px] text-gray-400 mb-1">שעת סיום</label>
            <input
              type="time"
              value={values.endTime}
              onChange={e => onChange({ endTime: e.target.value })}
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-gray-50 text-gray-700"
              dir="ltr"
            />
          </div>
        </div>

        {/* Days of week */}
        <div>
          <label className="block text-[10px] text-gray-400 mb-1.5">
            ימי הצגה (ריק = כל הימים)
          </label>
          <div className="flex gap-1">
            {DAY_LABELS.map((label, dayIndex) => {
              const selected = values.daysOfWeek.includes(dayIndex)
              return (
                <button
                  key={dayIndex}
                  type="button"
                  onClick={() => toggleDay(dayIndex)}
                  className={cn(
                    'flex-1 py-1.5 rounded-md text-[11px] font-medium border transition-colors',
                    selected
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300',
                  )}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
