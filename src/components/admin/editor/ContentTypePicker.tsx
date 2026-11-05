'use client'
import { useId, useRef, useState } from 'react'
import {
  Images, Megaphone, CalendarClock, Cake, Type, Video, Rss, CalendarDays, Clock, CalendarRange, CloudSun, ChevronDown,
} from 'lucide-react'
import type { ContentType } from '@/types'
import { offeredContentTypes, type ContentTypeInfo } from '@/lib/contentTypes'
import { cn } from '@/lib/utils'

export const CONTENT_ICONS: Record<ContentTypeInfo['type'], React.ComponentType<{ className?: string }>> = {
  IMAGE_GALLERY: Images, ANNOUNCEMENT: Megaphone, TIMETABLE: CalendarClock, BIRTHDAYS: Cake, TEXT: Type,
  VIDEO: Video, RSS_FEED: Rss, EVENTS: CalendarDays, CLOCK: Clock, DATE: CalendarRange, WEATHER: CloudSun,
}

// The content-type choice of one region: cards with an icon, a label and a short description, as a
// radio group (arrow keys move between the options). "תוכן נוסף" holds the less common types.
export default function ContentTypePicker({ value, onChange, label }: { value: ContentType; onChange: (t: ContentType) => void; label: string }) {
  const { main, more } = offeredContentTypes(value)
  const all = [...main, ...more]
  const [moreOpen, setMoreOpen] = useState(more.some(c => c.type === value))
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})
  const hintId = useId()
  const visible = moreOpen ? all : main
  // Roving tab stop: the option last moved to, else the selected one, else the first.
  // Arrow keys only move the focus; Enter or Space chooses (choosing opens the content form and
  // closes this picker, so it must not happen on every arrow press).
  const [active, setActive] = useState<ContentType | null>(null)
  const focusable = active && visible.some(c => c.type === active) ? active : visible.some(c => c.type === value) ? value : visible[0]?.type

  function onKeyDown(e: React.KeyboardEvent, i: number) {
    const keys: Record<string, number> = { ArrowDown: 1, ArrowLeft: 1, ArrowUp: -1, ArrowRight: -1 }
    const next = e.key in keys ? (i + keys[e.key] + visible.length) % visible.length : e.key === 'Home' ? 0 : e.key === 'End' ? visible.length - 1 : -1
    if (next < 0) return
    e.preventDefault()
    setActive(visible[next].type)
    refs.current[visible[next].type]?.focus()
  }

  const card = (c: ContentTypeInfo, i: number) => {
    const Icon = CONTENT_ICONS[c.type]
    const selected = c.type === value
    return (
      <button key={c.type} ref={el => { refs.current[c.type] = el }} type="button" role="radio" aria-checked={selected}
        tabIndex={c.type === focusable ? 0 : -1} onClick={() => onChange(c.type)} onKeyDown={e => onKeyDown(e, i)}
        className={cn('ui-focus flex min-h-[64px] items-start gap-2.5 rounded-ui-sm border p-2.5 text-right transition-colors',
          selected ? 'border-ui-primary bg-ui-primary-soft' : 'border-ui-border bg-ui-surface hover:border-ui-border-strong hover:bg-ui-subtle')}>
        <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-ui-sm', selected ? 'bg-ui-primary text-white' : 'bg-ui-subtle text-ui-ink-2')}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className={cn('block text-[13px] font-semibold', selected ? 'text-ui-primary-ink' : 'text-ui-ink')}>{c.label}</span>
          <span className="mt-0.5 block text-[11.5px] leading-snug text-ui-muted">{c.description}</span>
        </span>
      </button>
    )
  }

  return (
    <div className="grid gap-2">
      <p id={hintId} className="sr-only">החיצים עוברים בין סוגי התוכן; Enter או רווח בוחרים.</p>
      <div role="radiogroup" aria-label={label} aria-describedby={hintId} className="grid gap-2">
        <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">{main.map(card)}</div>
        {moreOpen && more.length > 0 && <>
          <p className="mt-1 text-xs font-semibold text-ui-muted">תוכן נוסף</p>
          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">{more.map((c, i) => card(c, main.length + i))}</div>
        </>}
      </div>
      {more.length > 0 && (
        <button type="button" onClick={() => setMoreOpen(o => !o)} aria-expanded={moreOpen}
          className="ui-focus flex items-center gap-1.5 justify-self-start rounded-ui-sm px-1 py-1 text-[13px] font-medium text-ui-ink-2 hover:text-ui-ink">
          <ChevronDown className={cn('h-4 w-4 transition-transform', moreOpen && 'rotate-180')} aria-hidden="true" />
          {moreOpen ? 'הסתרת תוכן נוסף' : 'תוכן נוסף'}
        </button>
      )}
    </div>
  )
}
