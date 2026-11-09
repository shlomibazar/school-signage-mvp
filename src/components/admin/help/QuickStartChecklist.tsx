'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, ArrowLeft, RotateCcw } from 'lucide-react'
import { QUICK_START } from '@/lib/help/topics'
import { cn } from '@/lib/utils'

// "התחלה מהירה": a checklist the user ticks by themselves. Steps can be done in any order; nothing
// here reads or changes school data. Ticks are a personal reminder kept in this browser only
// (localStorage; the list still works without it).
const KEY = 'help:quick-start:v1'

export default function QuickStartChecklist() {
  const [done, setDone] = useState<string[]>([])
  useEffect(() => { try { const v = JSON.parse(localStorage.getItem(KEY) ?? '[]'); if (Array.isArray(v)) setDone(v.filter((x): x is string => typeof x === 'string')) } catch {} }, [])
  const persist = (next: string[]) => { try { localStorage.setItem(KEY, JSON.stringify(next)) } catch {} }
  const save = (next: string[]) => { setDone(next); persist(next) }
  // Functional update: quick successive clicks each start from the latest list.
  const toggle = (id: string) => setDone(prev => { const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]; persist(next); return next })
  const count = QUICK_START.filter(s => done.includes(s.id)).length

  return (
    <div className="grid gap-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center justify-between text-xs text-ui-muted"><span>{count} מתוך {QUICK_START.length} שלבים סומנו</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-ui-subtle" role="progressbar" aria-valuemin={0} aria-valuemax={QUICK_START.length} aria-valuenow={count} aria-label="התקדמות">
            <div className="h-full rounded-full bg-ui-primary transition-[width]" style={{ width: `${(count / QUICK_START.length) * 100}%` }} />
          </div>
        </div>
        {count > 0 && <button type="button" onClick={() => save([])} className="ui-focus inline-flex items-center gap-1 rounded text-xs text-ui-muted hover:text-ui-ink"><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />ניקוי הסימונים</button>}
      </div>
      <ol className="grid gap-2">
        {QUICK_START.map((step, i) => {
          const on = done.includes(step.id)
          return (
            <li key={step.id} className={cn('flex gap-3 rounded-ui-lg border p-3 sm:p-4', on ? 'border-emerald-200 bg-emerald-50/60' : 'border-ui-border bg-ui-surface')}>
              <button type="button" role="checkbox" aria-checked={on} onClick={() => toggle(step.id)} aria-label={`סימון: ${step.title}`}
                className={cn('ui-focus mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-semibold', on ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-ui-border-strong bg-ui-surface text-ui-ink-2')}>
                {on ? <Check className="h-4 w-4" aria-hidden="true" /> : i + 1}
              </button>
              <div className="min-w-0 flex-1">
                <p className={cn('text-sm font-semibold', on ? 'text-emerald-800' : 'text-ui-ink')}>{step.title}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-ui-ink-2">{step.text}</p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                  {step.link && <Link href={step.link.href} className="ui-focus inline-flex items-center gap-1 rounded font-medium text-ui-primary hover:underline">{step.link.label}<ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /></Link>}
                  {step.topic && <Link href={`/admin/help/${step.topic}`} className="ui-focus rounded text-ui-muted hover:text-ui-ink hover:underline">הסבר מפורט</Link>}
                </div>
              </div>
            </li>
          )
        })}
      </ol>
      <p className="text-xs text-ui-muted">הסימונים הם תזכורת אישית בדפדפן הזה בלבד. הם לא משנים שום דבר במערכת, ואפשר לבצע את השלבים בכל סדר.</p>
    </div>
  )
}
