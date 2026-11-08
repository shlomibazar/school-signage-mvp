'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { birthdayHeading, birthdayDayLabel, normalizeBirthdayRegion, type PublicBirthday, type PublicBirthdayList } from '@/lib/birthdayDisplay'

// A "ימי הולדת" region on a TV: heading, optional greeting and the people of the configured range
// (computed on the server from the central registry). Built for weak Smart-TV browsers: plain CSS,
// one size measurement (ResizeObserver, with a window-resize fallback) and, only when the names do
// not fit, one timer that turns pages every PAGE_SECONDS. No animation loop, no requests.

const PAGE_SECONDS = 8
const MIN_CARD_WIDTH = 280  // px of the 1920/1080 canvas
const MIN_CARD_HEIGHT = 86
const MAX_CARD_HEIGHT = 190

type Props = { settings: unknown; list: PublicBirthdayList | null | undefined }

export default function BirthdayBoard({ settings, list }: Props) {
  const s = normalizeBirthdayRegion(settings)
  const items = useMemo(() => list?.items ?? [], [list])
  const heading = s.title || birthdayHeading(s.period, list?.today)
  const bodyRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const node = bodyRef.current
    if (!node) return
    const measure = () => setSize(prev => (prev.width === node.clientWidth && prev.height === node.clientHeight ? prev : { width: node.clientWidth, height: node.clientHeight }))
    measure()
    if (typeof ResizeObserver === 'undefined') { window.addEventListener('resize', measure); return () => window.removeEventListener('resize', measure) }
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const grid = useMemo(() => gridFor(items.length, size.width, size.height), [items.length, size.width, size.height])
  const pages = Math.max(1, Math.ceil(items.length / grid.pageSize))
  const [page, setPage] = useState(0)
  const itemsKey = items.map(b => `${b.name}|${b.day}.${b.month}`).join(';')
  useEffect(() => { setPage(0) }, [itemsKey, pages])
  useEffect(() => {
    if (pages < 2) return
    const t = window.setInterval(() => setPage(p => (p + 1) % pages), PAGE_SECONDS * 1000)
    return () => window.clearInterval(t)
  }, [pages, itemsKey])
  const shown = items.slice(page * grid.pageSize, (page + 1) * grid.pageSize)
  const showDate = s.period !== 'today'
  const headingSize = clamp(Math.min(size.width / 14, 56), 24, 56)

  return (
    <div className="tv-birthday-board w-full h-full flex flex-col overflow-hidden" dir="rtl" style={{ color: 'var(--tv-panel-ink, #edf5ff)', padding: '2.2% 2.6%', boxSizing: 'border-box' }}>
      <div className="shrink-0 text-center" style={{ marginBottom: 14 }}>
        <div className="font-bold" style={{ fontSize: headingSize, lineHeight: 1.15, overflowWrap: 'anywhere' }}>
          <span aria-hidden="true">🎂 </span>{heading}
        </div>
        {s.greetingText && items.length > 0 && <div style={{ fontSize: headingSize * 0.55, opacity: 0.85, marginTop: 6, overflowWrap: 'anywhere' }}>{s.greetingText}</div>}
      </div>
      <div ref={bodyRef} className="flex-1 min-h-0 relative">
        {items.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center" style={{ opacity: 0.8 }}>
            <div aria-hidden="true" style={{ fontSize: clamp(size.height / 4, 36, 96), lineHeight: 1 }}>🎈</div>
            <div style={{ fontSize: clamp(size.width / 22, 18, 36), marginTop: 12 }}>{emptyText(s.period)}</div>
          </div>
        ) : items.length === 1 ? (
          <Hero b={items[0]} showDate={showDate} today={list?.today} width={size.width} height={size.height} />
        ) : (
          <div className="grid h-full" style={{ gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`, gridAutoRows: grid.cardHeight, gap: grid.gap, alignContent: 'center' }}>
            {shown.map((b, i) => <Card key={`${page}-${i}`} b={b} showDate={showDate} today={list?.today} height={grid.cardHeight} />)}
          </div>
        )}
      </div>
      {(pages > 1 || (list?.more ?? 0) > 0) && (
        <div className="shrink-0 flex items-center justify-center gap-3" style={{ marginTop: 10, fontSize: 18, opacity: 0.8 }}>
          {pages > 1 && <span className="flex items-center gap-1.5" aria-label={`עמוד ${page + 1} מתוך ${pages}`}>
            {Array.from({ length: pages }, (_, i) => <span key={i} className="rounded-full" style={{ width: i === page ? 18 : 7, height: 7, background: i === page ? 'currentColor' : 'color-mix(in srgb, currentColor 35%, transparent)' }} />)}
          </span>}
          {(list?.more ?? 0) > 0 && <span>ועוד {list!.more}</span>}
        </div>
      )}
    </div>
  )
}

function Card({ b, showDate, today, height }: { b: PublicBirthday; showDate: boolean; today?: { day: number; month: number }; height: number }) {
  const nameSize = clamp(height * 0.34, 18, 54)
  const isToday = !!today && b.day === today.day && b.month === today.month
  return (
    <div className="flex items-center min-w-0 overflow-hidden" style={{
      gap: 14, padding: `0 ${clamp(height * 0.22, 12, 30)}px`, borderRadius: 18,
      background: 'var(--tv-unified-card, rgba(255,255,255,.08))',
      border: `2px solid ${isToday && showDate ? 'var(--tv-accent, #f5b942)' : 'var(--tv-unified-stroke, rgba(255,255,255,.14))'}`,
    }}>
      <span aria-hidden="true" style={{ fontSize: nameSize * 0.95, lineHeight: 1 }}>{b.role === 'TEACHER' ? '🎉' : '🎂'}</span>
      <div className="min-w-0 flex-1">
        <div className="font-bold" style={{ fontSize: nameSize, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.name}</div>
        <div style={{ fontSize: nameSize * 0.6, lineHeight: 1.2, opacity: 0.75, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subtitle(b)}</div>
      </div>
      {showDate && <span className="shrink-0 font-semibold tabular-nums" dir="ltr" style={{ fontSize: nameSize * 0.6, opacity: isToday ? 1 : 0.8 }}>{birthdayDayLabel(b, today)}</span>}
    </div>
  )
}

function Hero({ b, showDate, today, width, height }: { b: PublicBirthday; showDate: boolean; today?: { day: number; month: number }; width: number; height: number }) {
  const nameSize = clamp(Math.min(width / 9, height / 3.2), 28, 110)
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-center min-w-0" style={{ padding: '0 4%' }}>
      <div aria-hidden="true" style={{ fontSize: nameSize * 1.1, lineHeight: 1 }}>{b.role === 'TEACHER' ? '🎉' : '🎂'}</div>
      <div className="font-bold max-w-full" style={{ fontSize: nameSize, lineHeight: 1.15, marginTop: nameSize * 0.2, overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{b.name}</div>
      <div style={{ fontSize: nameSize * 0.45, opacity: 0.8, marginTop: 8 }}>{subtitle(b)}{showDate ? ` · ${birthdayDayLabel(b, today)}` : ''}</div>
    </div>
  )
}

const subtitle = (b: PublicBirthday) => (b.role === 'TEACHER' ? 'צוות המורים' : b.className ?? '')
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
function emptyText(period: string): string {
  return period === 'today' ? 'אין ימי הולדת היום' : period === 'month' ? 'אין ימי הולדת החודש' : 'אין ימי הולדת השבוע'
}

/** Columns, card height and page size for n cards in a width × height area. */
export function gridFor(n: number, width: number, height: number): { cols: number; cardHeight: number; pageSize: number; gap: number } {
  const gap = 12
  if (!width || !height || n < 1) return { cols: 1, cardHeight: MIN_CARD_HEIGHT, pageSize: Math.max(1, n), gap }
  const maxCols = Math.max(1, Math.min(4, Math.floor((width + gap) / (MIN_CARD_WIDTH + gap))))
  const maxRows = Math.max(1, Math.floor((height + gap) / (MIN_CARD_HEIGHT + gap)))
  let best = { cols: 1, cardHeight: MIN_CARD_HEIGHT, pageSize: maxRows, gap, pages: Infinity, score: 0 }
  for (let cols = 1; cols <= maxCols; cols++) {
    const rows = Math.min(maxRows, Math.ceil(n / cols))
    const pageSize = cols * rows
    const pages = Math.ceil(n / pageSize)
    const cardHeight = Math.min(MAX_CARD_HEIGHT, Math.floor((height - gap * (rows - 1)) / rows))
    const cardWidth = (width - gap * (cols - 1)) / cols
    // Fewest pages first; then the largest readable card (height bound by width for long names).
    const score = Math.min(cardHeight, cardWidth / 3.2)
    if (pages < best.pages || (pages === best.pages && score > best.score)) best = { cols, cardHeight, pageSize, gap, pages, score }
  }
  return { cols: best.cols, cardHeight: best.cardHeight, pageSize: best.pageSize, gap }
}
