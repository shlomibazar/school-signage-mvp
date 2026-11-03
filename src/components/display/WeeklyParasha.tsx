'use client'
import { useEffect, useState } from 'react'

// A failed refresh keeps the last title for up to 12 hours (it changes once a week).
const KEEP_LAST_MS = 12 * 60 * 60 * 1000

export default function WeeklyParasha() {
  const [title, setTitle] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    let loadedAt = 0
    const load = async () => {
      try {
        const response = await fetch('/api/weekly-parasha', {cache:'no-store'})
        if (!response.ok) throw new Error('Parasha unavailable')
        const data: {title?:string|null} = await response.json()
        if (alive) { loadedAt = Date.now(); setTitle(data.title || null) }
      } catch { if (alive && Date.now() - loadedAt > KEEP_LAST_MS) setTitle(null) }
    }
    void load()
    const timer = window.setInterval(()=>void load(), 60 * 60 * 1000)
    return () => { alive=false; window.clearInterval(timer) }
  }, [])
  if (!title) return null
  return <span className="tv-weekly-parasha" dir="rtl" title="פרשת השבוע">{title}</span>
}
