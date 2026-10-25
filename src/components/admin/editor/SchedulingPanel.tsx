'use client'
import { Switch } from '@/components/ui/Switch'

export interface SchedulingValues {
  active: boolean; startDate: string; endDate: string
  startTime: string; endTime: string; daysOfWeek: number[]
}
interface Props { values: SchedulingValues; onChange: (p: Partial<SchedulingValues>) => void }
const DAYS = ['א','ב','ג','ד','ה','ו','ש']

export default function SchedulingPanel({ values, onChange }: Props) {
  function toggleDay(d: number) {
    const next = values.daysOfWeek.includes(d)
      ? values.daysOfWeek.filter(x => x !== d)
      : [...values.daysOfWeek, d]
    onChange({ daysOfWeek: next })
  }
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2.5">
      <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">תזמון</p>
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-700">פעיל</span>
        <Switch checked={values.active} onCheckedChange={v => onChange({ active: v })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] text-gray-400 mb-1">מתאריך</label>
          <input type="date" value={values.startDate} onChange={e => onChange({ startDate: e.target.value })}
            className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white" dir="ltr"/>
        </div>
        <div>
          <label className="block text-[10px] text-gray-400 mb-1">עד תאריך</label>
          <input type="date" value={values.endDate} onChange={e => onChange({ endDate: e.target.value })}
            className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white" dir="ltr"/>
        </div>
        <div>
          <label className="block text-[10px] text-gray-400 mb-1">משעה</label>
          <input type="time" value={values.startTime} onChange={e => onChange({ startTime: e.target.value })}
            className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white" dir="ltr"/>
        </div>
        <div>
          <label className="block text-[10px] text-gray-400 mb-1">עד שעה</label>
          <input type="time" value={values.endTime} onChange={e => onChange({ endTime: e.target.value })}
            className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white" dir="ltr"/>
        </div>
      </div>
      <div>
        <label className="block text-[10px] text-gray-400 mb-1.5">ימי הצגה (ריק = כל הימים)</label>
        <div className="flex gap-1">
          {DAYS.map((d, i) => (
            <button key={i} type="button" onClick={() => toggleDay(i)}
              className={`flex-1 py-1 text-xs rounded-lg border transition-colors ${
                values.daysOfWeek.includes(i)
                  ? 'bg-blue-500 text-white border-blue-500'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
              {d}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
