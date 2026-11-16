'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ContentItem } from '@/types'
import { zonedParts } from '@/lib/zonedTime'
import { clockMinutes } from '@/lib/zonedTime'
import { NO_SUBSTITUTE_LABEL, type DisplayPeriod } from '@/lib/duty/rules'

// TV region: today's published duty roster (content type DUTY_ROSTER). Loads /api/public/duty/<item>
// every minute; the current/next period is recomputed every 20 seconds from the school-local clock,
// so the region switches on time even between loads. The last good copy is kept in memory and in
// browser storage, so a network or server failure shows the last published roster instead of nothing.

type Data = { date: string; timeZone: string; published: boolean; periods: DisplayPeriod[] }
type Mode = 'auto' | 'day' | 'current' | 'next'

const offlineKey = (screenId: string | undefined, itemId: string) => `schoolscreen:offline:v1:${screenId ?? 'unknown'}:duty:${itemId}`
const read = (key: string): Data | null => { try { const raw = window.localStorage.getItem(key); return raw ? JSON.parse(raw) as Data : null } catch { return null } }
const save = (key: string, v: Data) => { try { window.localStorage.setItem(key, JSON.stringify(v)) } catch { /* storage may be unavailable */ } }

/** Current/next states for the given minute (same rule as the server). */
function withStates(periods: DisplayPeriod[], minutes: number): DisplayPeriod[] {
  let next = false
  return periods.map(p => {
    const start = clockMinutes(p.startTime) ?? 0, end = clockMinutes(p.endTime) ?? start
    let state: DisplayPeriod['state'] = minutes >= end ? 'past' : minutes >= start ? 'current' : 'later'
    if (state === 'later' && !next) { state = 'next'; next = true }
    return { ...p, state }
  })
}

const STATUS_STYLE = {
  assigned: null,
  substitute: { label: 'מחליף/ה', color: 'var(--tv-st-sub, #fde047)', bg: 'var(--tv-st-sub-soft, #463c24)' },
  needs_substitute: { label: NO_SUBSTITUTE_LABEL, color: 'var(--tv-st-cancel, #f9a8d4)', bg: 'var(--tv-st-cancel-soft, #47283e)' },
  unassigned: { label: 'לא שובץ', color: 'var(--tv-st-cancel, #f9a8d4)', bg: 'var(--tv-st-cancel-soft, #47283e)' },
} as const

export default function DutyRosterContent({ item, offline = false, screenId }: { item: ContentItem; offline?: boolean; screenId?: string }) {
  const s = (item.settings ?? {}) as { title?: string; mode?: Mode }
  const mode: Mode = s.mode ?? 'auto'
  const key = offlineKey(screenId, item.id)
  const [data, setData] = useState<Data | null>(null)
  const [minutes, setMinutes] = useState<number | null>(null)
  const host = useRef<HTMLDivElement>(null)
  // Content taller than the region scrolls slowly (pause at the top, scroll, pause, back to the top),
  // like long announcements, so a full day with many locations is shown completely.
  const viewport = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const [overflow, setOverflow] = useState(0)
  const [scrolled, setScrolled] = useState(false)
  const [box, setBox] = useState({ w: 640, h: 600 })

  useEffect(() => {
    let alive = true
    const saved = read(key)
    if (saved) setData(prev => prev ?? saved)
    if (offline) return () => { alive = false }
    const load = () => fetch(`/api/public/duty/${item.id}`, { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error('duty'); return r.json() })
      .then(j => { if (alive && j?.data) { setData(j.data); save(key, j.data) } })
      .catch(() => { /* keep the last good copy */ })
    void load()
    const t = setInterval(load, 60000)
    return () => { alive = false; clearInterval(t) }
  }, [item.id, key, offline])

  // School-local clock (the copy may be from an earlier day: then it is not shown as today's).
  useEffect(() => {
    const tick = () => { if (data) { const p = zonedParts(new Date(), data.timeZone); setMinutes(p.date === data.date ? p.minutes : null) } }
    tick()
    const t = setInterval(tick, 20000)
    return () => clearInterval(t)
  }, [data])

  useEffect(() => {
    if (!host.current) return
    const ro = new ResizeObserver(([e]) => { if (e) setBox({ w: e.contentRect.width, h: e.contentRect.height }) })
    ro.observe(host.current)
    return () => ro.disconnect()
  }, [])

  const periods = useMemo(() => data && minutes !== null ? withStates(data.periods, minutes) : [], [data, minutes])
  const shown = useMemo(() => {
    if (mode === 'day') return periods
    const current = periods.filter(p => p.state === 'current'), next = periods.filter(p => p.state === 'next')
    if (mode === 'current') return current
    if (mode === 'next') return next
    return current.length ? current : next
  }, [periods, mode])

  // Sizes from the region (readable from a distance; narrow regions get a single column).
  const unit = Math.max(0.6, Math.min(1.6, Math.min(box.w / 640, box.h / 560)))
  const wide = box.w >= 900
  const nameSize = Math.round(30 * unit), metaSize = Math.max(14, Math.round(20 * unit))
  const title = s.title?.trim() || 'תורנויות'
  const empty = !data ? 'טוען את לוח התורנויות…'
    : !data.published || minutes === null ? 'לוח התורנויות להיום עדיין לא פורסם'
    : !periods.length ? 'אין תורנויות היום'
    : !shown.length ? (mode === 'next' || mode === 'auto' ? 'אין עוד תורנויות היום' : 'אין תורנות כרגע')
    : null

  useEffect(() => {
    const v = viewport.current, c = content.current
    if (!v || !c) { setOverflow(0); return }
    const measure = () => { const extra = c.scrollHeight - v.clientHeight; setOverflow(o => { const n = extra > 4 ? Math.ceil(extra) : 0; return o === n ? o : n }) }
    measure()
    const ro = new ResizeObserver(measure); ro.observe(v); ro.observe(c)
    return () => ro.disconnect()
  }, [shown, empty])
  useEffect(() => {
    setScrolled(false)
    if (!overflow) return
    const travel = Math.max(6, overflow / 25) * 1000 // about 25px per second
    let t: ReturnType<typeof setTimeout>
    const loop = (down: boolean) => { setScrolled(down); t = setTimeout(() => loop(!down), down ? travel + 6000 : 6000) }
    t = setTimeout(() => loop(true), 6000)
    return () => clearTimeout(t)
  }, [overflow])
  return (
    <div ref={host} className="tv-duty relative w-full h-full min-h-0 overflow-hidden flex flex-col" dir="rtl" style={{ color: 'var(--tv-ink, #f8fafc)', padding: Math.round(20 * unit) }}>
      <header className="tv-section-heading" dir="rtl"><h2 className="tv-section-heading-label">{title}</h2></header>
      {empty ? (
        <div className="flex-1 min-h-0 flex items-center justify-center text-center" style={{ fontSize: Math.round(26 * unit), opacity: 0.8 }}>{empty}</div>
      ) : (
        <div ref={viewport} className="flex-1 min-h-0 overflow-hidden" style={{ marginTop: Math.round(10 * unit) }}>
        <div ref={content} className="grid content-start" style={{ gap: Math.round(14 * unit), gridTemplateColumns: wide && shown.length > 1 ? 'repeat(2, minmax(0, 1fr))' : '1fr',
          transform: `translateY(-${scrolled ? overflow : 0}px)`, transition: overflow ? `transform ${scrolled ? Math.max(6, overflow / 25) : 1.2}s ${scrolled ? 'linear' : 'ease-in-out'}` : 'none' }}>
          {shown.map(p => (
            <section key={p.periodId} className="min-w-0 rounded-xl" aria-current={p.state === 'current' ? 'time' : undefined}
              style={{ background: p.state === 'current' ? 'color-mix(in srgb, currentColor 14%, transparent)' : 'color-mix(in srgb, currentColor 6%, transparent)', opacity: p.state === 'past' ? 0.55 : 1, padding: Math.round(12 * unit), border: p.state === 'current' ? '2px solid var(--tv-pri-info, #93c5fd)' : '1px solid color-mix(in srgb, currentColor 18%, transparent)' }}>
              <div className="flex items-baseline justify-between gap-2" style={{ marginBottom: Math.round(8 * unit) }}>
                <span className="font-bold leading-tight line-clamp-2" style={{ fontSize: Math.round(26 * unit) }}>{p.name}</span>
                <span className="shrink-0 tabular-nums" dir="ltr" style={{ fontSize: metaSize, opacity: 0.85 }}>{p.startTime}–{p.endTime}{p.state === 'current' ? ' · עכשיו' : p.state === 'next' ? ' · הבאה' : ''}</span>
              </div>
              <ul className="grid" style={{ gap: Math.round(6 * unit) }}>
                {p.entries.map((e, i) => {
                  const st = STATUS_STYLE[e.status]
                  const person = e.status === 'substitute' ? e.substituteName : e.status === 'assigned' ? e.staffName : null
                  return (
                    <li key={i} className="flex items-center justify-between gap-3 min-w-0" style={{ borderInlineStart: `4px solid ${st?.color ?? 'var(--tv-pri-info, #93c5fd)'}`, paddingInlineStart: Math.round(10 * unit) }}>
                      <span className="min-w-0 font-semibold leading-tight [overflow-wrap:anywhere] line-clamp-3" style={{ fontSize: nameSize }}>{person ?? '—'}</span>
                      <span className="flex shrink-0 items-center gap-2" style={{ fontSize: metaSize }}>
                        <span className="max-w-[14em] text-end leading-tight line-clamp-2" style={{ opacity: 0.9 }}>{e.locationName}</span>
                        {st && <span className="rounded-full font-semibold" style={{ color: st.color, background: st.bg, padding: `${Math.round(2 * unit)}px ${Math.round(10 * unit)}px` }}>{st.label}</span>}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
        </div>
      )}
    </div>
  )
}
