'use client'
import { useEffect } from 'react'

/** Reloads the page once after `afterMs` (a fresh mount starts a new single timer). */
export default function ReloadLater({ afterMs }: { afterMs: number }) {
  useEffect(() => {
    const timer = window.setTimeout(() => window.location.reload(), afterMs)
    return () => window.clearTimeout(timer)
  }, [afterMs])
  return null
}
