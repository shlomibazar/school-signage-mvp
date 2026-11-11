'use client'

import { useEffect, useRef, useState } from 'react'
import ContentRenderer from '@/components/display/ContentRenderer'
import type { ContentItem, Priority } from '@/types'
import { cn } from '@/lib/utils'

// Live preview of the announcement text with the TV's own renderer (the same component the screen
// uses), at the real pixel size of a region on a 1920×1080 screen, scaled down to fit the form.
// Attachments are not shown here; they appear on the screen after saving.
const REGIONS = [
  { id: 'full', label: 'מסך מלא', width: 1920 },
  { id: 'half', label: 'חצי מסך', width: 960 },
  { id: 'third', label: 'שליש מסך', width: 640 },
] as const
const HEIGHT = 920 // 1080 minus a typical header and footer

export default function AnnouncementPreview({ title, showTitle, body, priority }: { title: string; showTitle: boolean; body: string; priority: Priority }) {
  const [region, setRegion] = useState<(typeof REGIONS)[number]['id']>('half')
  const frameRef = useRef<HTMLDivElement>(null)
  const [frameWidth, setFrameWidth] = useState(600)
  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => { if (e) setFrameWidth(e.contentRect.width) })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // What the TV renderer did with wide tables in this region (read from the rendered preview).
  const [tableState, setTableState] = useState<{ grouped: boolean; squeezed: boolean }>({ grouped: false, squeezed: false })
  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const read = () => setTableState(prev => {
      const next = { grouped: !!el.querySelector('.tv-ann-groups'), squeezed: !!el.querySelector('.tv-ann-squeeze') }
      return prev.grouped === next.grouped && prev.squeezed === next.squeezed ? prev : next
    })
    const mo = new MutationObserver(read)
    mo.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] })
    read()
    return () => mo.disconnect()
  }, [])
  const r = REGIONS.find(x => x.id === region)!
  const scale = Math.min(1, frameWidth / r.width, 420 / HEIGHT)
  const item = {
    id: 'announcement-preview', sectionId: 'preview', contentType: 'ANNOUNCEMENT', priority: 0, active: true,
    startDate: null, endDate: null, startTime: null, endTime: null, daysOfWeek: [], textContent: body,
    textColor: null, bgColor: null, fontSize: null, galleryId: null, slideDuration: 5, transitionStyle: 'fade',
    videoUrl: null, videoLoop: false, videoMuted: true, rssUrl: null, rssMaxItems: 5, weatherCity: null, weatherUnits: 'metric',
    settings: { title: showTitle ? title : '', priority, rotationSecs: 10 },
  } as unknown as ContentItem

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-ui-ink-2">תצוגה מקדימה בטלוויזיה</span>
        <div role="radiogroup" aria-label="גודל האזור בתצוגה המקדימה" className="inline-flex rounded-ui bg-ui-subtle p-1">
          {REGIONS.map(x => (
            <button key={x.id} type="button" role="radio" aria-checked={region === x.id} onClick={() => setRegion(x.id)}
              className={cn('ui-focus rounded-ui-sm px-3 py-1 text-xs', region === x.id ? 'bg-ui-surface font-semibold text-ui-ink shadow-ui' : 'text-ui-muted hover:text-ui-ink')}>
              {x.label}
            </button>
          ))}
        </div>
      </div>
      <div ref={frameRef} className="w-full">
        <div className="mx-auto overflow-hidden rounded-ui-sm border border-ui-border bg-slate-900" style={{ width: r.width * scale, height: HEIGHT * scale }}>
          <div style={{ width: r.width, height: HEIGHT, transform: `scale(${scale})`, transformOrigin: 'top right' }} dir="rtl">
            <ContentRenderer item={item} offline />
          </div>
        </div>
      </div>
      {tableState.squeezed && <p role="status" className="rounded-ui-sm bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">בגודל הזה יש טבלה רחבה עם תאים ממוזגים שאי אפשר לחלק בבטחה, ולכן הטקסט שבה קטן ונשבר לשורות. כדאי לפצל אותה ב-Excel לכמה טבלאות קטנות, או להציג אותה באזור רחב יותר.</p>}
      {tableState.grouped && !tableState.squeezed && <p className="text-xs text-ui-muted">טבלה רחבה מוצגת בגודל הזה בחלקים, זה מתחת לזה, עם שורת הכותרת והעמודה הראשונה בכל חלק. כל הנתונים נשמרים.</p>}
      <p className="text-xs text-ui-muted">כך ייראה הטקסט באזור הודעות בגודל הזה. טקסט ארוך גולל לאט בטלוויזיה; קבצים מצורפים יוצגו במסך עצמו.</p>
    </div>
  )
}
