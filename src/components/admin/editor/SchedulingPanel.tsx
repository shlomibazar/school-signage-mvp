'use client'
import { useId, useState } from 'react'
import { CalendarClock, ChevronDown } from 'lucide-react'
import { Switch } from '@/components/ui/Switch'
import { cn } from '@/lib/utils'

export interface SchedulingValues {
  active: boolean; startDate: string; endDate: string
  startTime: string; endTime: string; daysOfWeek: number[]
}
interface Props { values: SchedulingValues; onChange: (p: Partial<SchedulingValues>) => void }
const DAYS = ['א','ב','ג','ד','ה','ו','ש']

const fmtDate = (d: string) => { const [y, m, day] = d.split('-'); return y && m && day ? `${Number(day)}.${Number(m)}.${y.slice(2)}` : d }

/** One line describing when the content is shown ("מוצג תמיד" when nothing limits it). */
export function scheduleSummary(v: SchedulingValues): string {
  if (!v.active) return 'כבוי — התוכן לא מוצג'
  const parts: string[] = []
  if (v.startDate || v.endDate) parts.push(v.startDate && v.endDate ? `${fmtDate(v.startDate)}–${fmtDate(v.endDate)}` : v.startDate ? `מ־${fmtDate(v.startDate)}` : `עד ${fmtDate(v.endDate)}`)
  if (v.startTime || v.endTime) parts.push(`${v.startTime || '00:00'}–${v.endTime || '23:59'}`)
  if (v.daysOfWeek.length && v.daysOfWeek.length < 7) parts.push(`ימים ${[...v.daysOfWeek].sort().map(d => DAYS[d]).join(',')}`)
  return parts.length ? parts.join(' · ') : 'מוצג תמיד'
}

// Scheduling of a region's content, closed by default: only a one-line summary until opened.
// Opening or closing never changes the values (an active schedule stays active while closed).
export default function SchedulingPanel({ values, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const summary = scheduleSummary(values)
  const limited = summary !== 'מוצג תמיד'
  function toggleDay(d: number) {
    const next = values.daysOfWeek.includes(d)
      ? values.daysOfWeek.filter(x => x !== d)
      : [...values.daysOfWeek, d]
    onChange({ daysOfWeek: next })
  }
  const input = 'ui-focus w-full rounded-ui-sm border border-ui-border-strong bg-ui-surface px-2 py-1.5 text-xs'
  return (
    <div className="rounded-ui border border-ui-border">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-controls={id}
        className="ui-focus flex w-full items-center gap-2 rounded-ui px-3 py-2 text-right hover:bg-ui-subtle">
        <CalendarClock className="h-4 w-4 shrink-0 text-ui-muted" aria-hidden="true" />
        <span className="text-[13px] font-medium text-ui-ink-2">תזמון</span>
        <span className={cn('min-w-0 flex-1 truncate text-xs', !values.active ? 'text-amber-700' : limited ? 'text-ui-primary-ink' : 'text-ui-muted')}>{summary}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-ui-muted transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && (
        <div id={id} className="space-y-2.5 border-t border-ui-border px-3 py-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-ui-ink-2">התוכן פעיל</span>
            <Switch checked={values.active} onCheckedChange={v => onChange({ active: v })} aria-label="התוכן פעיל" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-[11px] text-ui-muted">מתאריך<input type="date" value={values.startDate} onChange={e => onChange({ startDate: e.target.value })} className={input} dir="ltr"/></label>
            <label className="grid gap-1 text-[11px] text-ui-muted">עד תאריך<input type="date" value={values.endDate} onChange={e => onChange({ endDate: e.target.value })} className={input} dir="ltr"/></label>
            <label className="grid gap-1 text-[11px] text-ui-muted">משעה<input type="time" value={values.startTime} onChange={e => onChange({ startTime: e.target.value })} className={input} dir="ltr"/></label>
            <label className="grid gap-1 text-[11px] text-ui-muted">עד שעה<input type="time" value={values.endTime} onChange={e => onChange({ endTime: e.target.value })} className={input} dir="ltr"/></label>
          </div>
          <div>
            <p className="mb-1.5 text-[11px] text-ui-muted">ימי הצגה (ללא בחירה = כל הימים)</p>
            <div className="flex gap-1" role="group" aria-label="ימי הצגה">
              {DAYS.map((d, i) => (
                <button key={i} type="button" onClick={() => toggleDay(i)} aria-pressed={values.daysOfWeek.includes(i)}
                  className={cn('ui-focus flex-1 rounded-ui-sm border py-1 text-xs transition-colors',
                    values.daysOfWeek.includes(i) ? 'border-ui-primary bg-ui-primary text-white' : 'border-ui-border bg-ui-surface text-ui-ink-2 hover:border-ui-border-strong')}>
                  {d}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
