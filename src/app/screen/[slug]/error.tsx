'use client'
import { startTransition, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { isChunkLoadError } from '@/lib/chunkError'
import { probeServer } from '@/lib/serverHealth'

// Last line of defence for the public TV, e.g. a database error while the page refreshes.
// Shows a calm message (never error details) and retries on its own with a growing delay,
// 15 s up to 5 min, so a TV recovers without anyone touching it and without hammering the
// server. The attempt count lives at module level because Next remounts this component
// after every failed retry; it starts over once the screen has been healthy for a while.
//
// Each retry first checks that the server answers (lib/serverHealth): a refresh or reload while
// it is restarting could land on a proxy error page that never retries. When the check fails,
// the next attempt is simply scheduled with the next delay.
const DELAYS_SECONDS = [15, 30, 60, 120, 300]
const FORGET_AFTER_MS = 10 * 60_000
let attempts = 0
let lastFailure = 0

const nextDelay = () => DELAYS_SECONDS[Math.min(attempts++, DELAYS_SECONDS.length - 1)] * 1000

// A chunk-load error (see isChunkLoadError) is retried with a full page load instead of a data
// refresh. Same backoff, so still no tight loop.
export default function ScreenError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter()
  const chunkError = isChunkLoadError(error)
  const timer = useRef(0)
  const alive = useRef(true)
  const busy = useRef(false)
  const retry = useCallback(() => {
    if (busy.current) return
    busy.current = true
    window.clearTimeout(timer.current)
    void probeServer().then(ok => {
      busy.current = false
      if (!alive.current) return
      if (!ok) { timer.current = window.setTimeout(retry, nextDelay()); return }
      if (chunkError) window.location.reload()
      else startTransition(() => { router.refresh(); reset() })
    })
  }, [chunkError, reset, router])
  useEffect(() => {
    alive.current = true
    const now = Date.now()
    if (now - lastFailure > FORGET_AFTER_MS) attempts = 0
    lastFailure = now
    timer.current = window.setTimeout(retry, nextDelay())
    return () => { alive.current = false; window.clearTimeout(timer.current) }
  }, [retry])
  return (
    <div dir="rtl" className="w-screen h-screen flex flex-col items-center justify-center gap-4 text-center" style={{ background: '#0b1626', color: '#e6eef8', fontFamily: 'Arial, sans-serif' }}>
      <div className="h-10 w-10 rounded-full border-4 border-white/20 border-t-white/70 animate-spin" aria-hidden="true" />
      <div style={{ fontSize: 'clamp(20px,2.4vw,36px)' }}>המסך מתעדכן, התוכן יחזור בעוד רגע</div>
      <button type="button" onClick={retry} className="rounded-lg border border-white/30 px-4 py-2 text-sm text-white/80">נסה שוב</button>
    </div>
  )
}
