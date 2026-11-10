'use client'

import { useEffect, useState } from 'react'
import { Compass, ArrowLeft, PlayCircle, CheckCircle2 } from 'lucide-react'
import { startTour, completedTours } from './TourHost'
import { TOURS } from '@/lib/tour/tours'

const SHORT = ['media', 'announcements', 'birthdays', 'timetable', 'settings']

/** Help Center: the main guided tour, plus short tours for single pages. */
export default function TourLaunchButton() {
  // Completed tours (this browser), read after mount; refreshed when a tour ends.
  const [done, setDone] = useState<string[]>([])
  useEffect(() => {
    const sync = () => setDone(completedTours())
    sync()
    window.addEventListener('admin-tour-change', sync)
    return () => window.removeEventListener('admin-tour-change', sync)
  }, [])
  const mark = (id: string) => done.includes(id) && <CheckCircle2 className="h-4 w-4 shrink-0 text-ui-success" aria-label="הושלם" />
  return (
    <div className="mb-6">
      <button type="button" onClick={() => startTour('main')}
        className="ui-focus group flex w-full items-center gap-4 rounded-ui-lg border border-ui-border bg-ui-surface p-5 text-start shadow-ui hover:border-ui-primary-line hover:bg-ui-subtle">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-ui-primary-soft text-ui-primary"><Compass className="h-6 w-6" aria-hidden="true" /></span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-base font-bold text-ui-ink">סיור מודרך{mark('main')}</span>
          <span className="mt-0.5 block text-sm text-ui-ink-2">מיצירת מסך ועד הצגה בטלוויזיה: לוח הבקרה, המסכים והעורך. הסיור רק מציג ומסביר, ולא משנה דבר.</span>
        </span>
        <ArrowLeft className="h-5 w-5 shrink-0 text-ui-primary transition-transform group-hover:-translate-x-1" aria-hidden="true" />
      </button>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
        <span className="text-ui-muted">סיורים קצרים:</span>
        {SHORT.map(id => (
          <button key={id} type="button" onClick={() => startTour(id)}
            className="ui-focus inline-flex items-center gap-1 rounded-full border border-ui-border bg-ui-surface px-3 py-1 text-ui-ink-2 hover:border-ui-primary-line hover:text-ui-primary">
            {done.includes(id) ? <CheckCircle2 className="h-3.5 w-3.5 text-ui-success" aria-label="הושלם" /> : <PlayCircle className="h-3.5 w-3.5" aria-hidden="true" />}{TOURS[id].title}
          </button>
        ))}
      </div>
    </div>
  )
}
