'use client'
import { useEffect } from 'react'
import { probeServer } from '@/lib/serverHealth'

/** Reloads the page after `afterMs`, once the server answers (otherwise waits another `afterMs`). */
export default function ReloadLater({ afterMs }: { afterMs: number }) {
  useEffect(() => {
    let timer = 0
    let alive = true
    const attempt = () => { void probeServer().then(ok => { if (!alive) return; if (ok) window.location.reload(); else timer = window.setTimeout(attempt, afterMs) }) }
    timer = window.setTimeout(attempt, afterMs)
    return () => { alive = false; window.clearTimeout(timer) }
  }, [afterMs])
  return null
}
