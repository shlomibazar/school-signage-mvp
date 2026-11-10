'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { X } from 'lucide-react'
import { TOURS } from '@/lib/tour/tours'
import { confirmLeaveEditor } from '@/lib/unsavedChanges'

// Guided tour overlay, mounted once in the admin layout. A tour is started with startTour(id); its
// position survives page navigation (sessionStorage). The tour only highlights: the overlay blocks
// clicks on the page, and it never clicks, saves or edits anything.

const KEY = 'admin-tour'
const EVENT = 'admin-tour-change'
type State = { id: string; step: number } | null

function read(): State {
  try { const s = JSON.parse(sessionStorage.getItem(KEY) ?? 'null'); return s && TOURS[s.id] ? s : null } catch { return null }
}
function write(s: State) {
  try { if (s) sessionStorage.setItem(KEY, JSON.stringify(s)); else sessionStorage.removeItem(KEY) } catch {}
  window.dispatchEvent(new Event(EVENT))
}

// The step a page load was last started for: landing elsewhere (redirect, no permission) shows the
// step in place instead of loading again.
const NAV_KEY = 'admin-tour-nav'
const navKey = () => { try { return sessionStorage.getItem(NAV_KEY) } catch { return null } }
const setNavKey = (v: string | null) => { try { if (v) sessionStorage.setItem(NAV_KEY, v); else sessionStorage.removeItem(NAV_KEY) } catch {} }

export function startTour(id: string, step = 0) { write({ id, step }) }

// Tours finished to the last step, per browser (localStorage). Replay is always possible.
const DONE_KEY = 'admin-tours-done'
export function completedTours(): string[] {
  try { const v = JSON.parse(localStorage.getItem(DONE_KEY) ?? '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}
function markCompleted(id: string) {
  try { localStorage.setItem(DONE_KEY, JSON.stringify([...new Set([...completedTours(), id])])) } catch {}
}

type Rect = { top: number; left: number; width: number; height: number }
const PAD = 6, CARD_W = 340, GAP = 12

export default function TourHost() {
  const pathname = usePathname()
  const [state, setState] = useState<State>(null)
  const [rect, setRect] = useState<Rect | null>(null)
  const [ready, setReady] = useState(false)
  const [cardH, setCardH] = useState(200)
  const cardRef = useRef<HTMLDivElement>(null)
  const targetRef = useRef<Element | null>(null)

  useEffect(() => {
    const sync = () => setState(read())
    sync()
    window.addEventListener(EVENT, sync)
    return () => window.removeEventListener(EVENT, sync)
  }, [])

  const tour = state ? TOURS[state.id] : null
  const step = tour?.steps[state!.step]
  const tryKey = state ? state.id + ":" + state.step : ""

  // Go to the step's page (asking first if leaving the editor with unsaved changes), then find its element.
  useEffect(() => {
    setReady(false); setRect(null); targetRef.current = null
    if (!step) return
    let cancelled = false
    if (pathname !== step.path) {
      // Already navigated for this step and landed elsewhere (redirect, no permission): explain in place.
      if (navKey() === tryKey) { setReady(true); return }
      (async () => {
        if (pathname?.startsWith('/admin/editor') && !(await confirmLeaveEditor())) {
          if (!cancelled) write(null) // stay in the editor with the changes; end the tour
          return
        }
        // A full page load: dependable across pages, and the tour position (sessionStorage) continues
        // there. Leaving the editor with unsaved changes was confirmed above.
        if (!cancelled) { setNavKey(tryKey); window.location.assign(step.href ?? step.path) }
      })()
      return () => { cancelled = true }
    }
    setNavKey(null)
    if (!step.target) { setReady(true); return }
    // Wait for the element to appear (the page may still be rendering), up to a limit.
    const targets = Array.isArray(step.target) ? step.target : [step.target]
    const lookup = () => {
      for (const t of targets) {
        const el = [...document.querySelectorAll(`[data-tour="${t}"]`)].find(e => e.getClientRects().length > 0)
        if (el) return el
      }
      return null
    }
    let observer: MutationObserver | null = null
    const show = (el: Element | null) => {
      observer?.disconnect(); clearTimeout(limit)
      if (cancelled) return
      targetRef.current = el
      if (!el) return setReady(true) // not on the page (e.g. no screens yet): show the card centered
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      setTimeout(() => { if (!cancelled) setReady(true) }, 60) // after the scroll settles (no rAF: it pauses in hidden tabs)
    }
    const limit = setTimeout(() => show(lookup()), 6000)
    const now = lookup()
    if (now) show(now)
    else {
      observer = new MutationObserver(() => { const el = lookup(); if (el) show(el) })
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class'] })
    }
    return () => { cancelled = true; observer?.disconnect(); clearTimeout(limit) }
  }, [step, pathname, tryKey])

  // Track the highlighted element's position.
  useEffect(() => {
    if (!ready) return
    const measure = () => {
      const el = targetRef.current
      if (!el) return setRect(null)
      const r = el.getBoundingClientRect()
      setRect({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 })
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true) }
  }, [ready])

  useLayoutEffect(() => {
    if (ready && cardRef.current) { setCardH(cardRef.current.offsetHeight); cardRef.current.focus() }
  }, [ready, state?.step])

  const close = useCallback(() => write(null), [])
  const go = useCallback((d: number) => {
    if (!state || !tour) return
    const next = state.step + d
    if (next < 0) return
    if (next >= tour.steps.length) { markCompleted(state.id); return write(null) }
    write({ id: state.id, step: next })
  }, [state, tour])

  useEffect(() => {
    if (!state) return
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('[role="alertdialog"], [aria-modal="true"]:not([data-tour-card])')) return
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowLeft') go(1)   // RTL: left = forward
      else if (e.key === 'ArrowRight') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state, close, go])

  if (!tour || !step || !ready) return null
  const i = state!.step, n = tour.steps.length, last = i === n - 1

  // Card below the element, else above, else centered; kept inside the viewport.
  const vw = window.innerWidth, vh = window.innerHeight, w = Math.min(CARD_W, vw - 24)
  let top = vh / 2 - cardH / 2, left = vw / 2 - w / 2
  if (rect) {
    if (rect.top + rect.height + GAP + cardH < vh) top = rect.top + rect.height + GAP
    else if (rect.top - GAP - cardH > 0) top = rect.top - GAP - cardH
    else top = Math.max(12, vh - cardH - 12)
    left = rect.left + rect.width / 2 - w / 2
  }
  top = Math.min(Math.max(12, top), vh - cardH - 12)
  left = Math.min(Math.max(12, left), vw - w - 12)

  return (
    <div className="fixed inset-0 z-[90]" dir="rtl">
      {/* Click shield: the page underneath is not interactive during the tour. */}
      <div className="absolute inset-0" onClick={e => e.stopPropagation()} style={rect ? undefined : { background: 'rgba(15,23,42,.55)' }} />
      {rect && <div aria-hidden="true" className="pointer-events-none absolute rounded-ui-lg ring-2 ring-white/80 transition-all duration-300"
        style={{ ...rect, boxShadow: '0 0 0 9999px rgba(15,23,42,.55)' }} />}
      <div ref={cardRef} data-tour-card role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body" tabIndex={-1}
        className="absolute rounded-ui-lg border border-ui-border bg-ui-surface p-4 shadow-xl outline-none transition-[top,left] duration-300"
        style={{ top, left, width: w }}>
        <div className="mb-2 flex items-start justify-between gap-2">
          <h2 id="tour-title" className="text-[15px] font-bold text-ui-ink">{step.title}</h2>
          <button type="button" onClick={close} aria-label="סגירת הסיור" className="ui-focus -m-1 rounded-ui-sm p-1 text-ui-muted hover:bg-ui-subtle hover:text-ui-ink">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <p id="tour-body" className="text-[13.5px] leading-relaxed text-ui-ink-2">{step.body}</p>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-ui-subtle" role="progressbar" aria-valuemin={1} aria-valuemax={n} aria-valuenow={i + 1} aria-label="התקדמות הסיור">
          <div className="h-full rounded-full bg-ui-primary transition-all duration-300" style={{ width: `${((i + 1) / n) * 100}%` }} />
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-xs tabular-nums text-ui-muted">{i + 1} / {n}</span>
          <div className="flex items-center gap-1.5">
            {!last && <button type="button" onClick={close} className="ui-focus rounded-ui-sm px-2 py-1.5 text-xs text-ui-muted hover:text-ui-ink">דילוג</button>}
            <button type="button" onClick={() => go(-1)} disabled={i === 0}
              className="ui-focus rounded-ui-sm border border-ui-border-strong px-3 py-1.5 text-[13px] text-ui-ink-2 hover:bg-ui-subtle disabled:opacity-40">הקודם</button>
            <button type="button" onClick={() => go(1)}
              className="ui-focus rounded-ui-sm bg-ui-primary px-3 py-1.5 text-[13px] font-medium text-white hover:bg-ui-primary-hover">{last ? 'סיום' : 'הבא'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
