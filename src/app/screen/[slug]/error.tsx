'use client'
import { startTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Last line of defence for the public TV, e.g. a database error while the page refreshes.
// Shows a calm message (never error details) and retries on its own with a growing delay,
// 15 s up to 5 min, so a TV recovers without anyone touching it and without hammering the
// server. The attempt count lives at module level because Next remounts this component
// after every failed retry; it starts over once the screen has been healthy for a while.
const DELAYS_SECONDS = [15, 30, 60, 120, 300]
const FORGET_AFTER_MS = 10 * 60_000
let attempts = 0
let lastFailure = 0

export default function ScreenError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter()
  useEffect(() => {
    const now = Date.now()
    if (now - lastFailure > FORGET_AFTER_MS) attempts = 0
    lastFailure = now
    const delay = DELAYS_SECONDS[Math.min(attempts, DELAYS_SECONDS.length - 1)] * 1000
    attempts++
    const timer = window.setTimeout(() => startTransition(() => { router.refresh(); reset() }), delay)
    return () => window.clearTimeout(timer)
  }, [reset, router])
  return (
    <div dir="rtl" className="w-screen h-screen flex flex-col items-center justify-center gap-4 text-center" style={{ background: '#0b1626', color: '#e6eef8', fontFamily: 'Arial, sans-serif' }}>
      <div className="h-10 w-10 rounded-full border-4 border-white/20 border-t-white/70 animate-spin" aria-hidden="true" />
      <div style={{ fontSize: 'clamp(20px,2.4vw,36px)' }}>המסך מתעדכן, התוכן יחזור בעוד רגע</div>
      <button type="button" onClick={() => startTransition(() => { router.refresh(); reset() })} className="rounded-lg border border-white/30 px-4 py-2 text-sm text-white/80">נסה שוב</button>
    </div>
  )
}
