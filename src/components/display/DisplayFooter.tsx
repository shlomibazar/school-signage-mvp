'use client'
// src/components/display/DisplayFooter.tsx

import { useState, useEffect } from 'react'
import type { ScreenLayout, School, Announcement } from '@/types'

interface Props {
  layout:        ScreenLayout
  school:        School
  announcements: Announcement[]
}

export default function DisplayFooter({ layout, school, announcements }: Props) {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const clockStr = now
    ? `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
    : ''

  // Build ticker: use layout ticker text first, then active announcement titles
  const tickerText =
    layout.footerTicker ??
    announcements.map(a => a.title).join('   •   ')

  return (
    <footer
      className="shrink-0 flex items-center gap-4 px-4"
      style={{
        height:       36,
        background:   'rgba(255,255,255,0.04)',
        borderTop:    '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {/* School name */}
      {layout.footerShowSchoolName && (
        <span
          className="shrink-0 text-white/50 font-medium"
          style={{ fontSize: 'clamp(9px, 1vw, 13px)' }}
        >
          {school.name}
        </span>
      )}

      {/* Divider */}
      {layout.footerShowSchoolName && tickerText && (
        <span className="text-white/20 shrink-0">|</span>
      )}

      {/* Scrolling ticker */}
      {tickerText && (
        <div className="ticker-wrap flex-1 min-w-0">
          <span className="ticker-text text-white/60" style={{ fontSize: 'clamp(9px, 1vw, 13px)' }}>
            {tickerText}
          </span>
        </div>
      )}

      {/* Clock */}
      {layout.footerShowClock && now && (
        <span
          className="shrink-0 text-white/70 font-medium tabular-nums"
          style={{ fontSize: 'clamp(9px, 1vw, 13px)' }}
        >
          {clockStr}
        </span>
      )}
    </footer>
  )
}
