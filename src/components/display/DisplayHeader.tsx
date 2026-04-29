'use client'
// src/components/display/DisplayHeader.tsx

import { useState, useEffect } from 'react'
import { formatHebrewDate, formatGregorianDate } from '@/lib/utils'
import type { Screen, ScreenLayout, School } from '@/types'

interface Props {
  layout:  ScreenLayout
  school:  School
  screen:  Screen
}

export default function DisplayHeader({ layout, school, screen }: Props) {
  const [now, setNow] = useState<Date | null>(null)

  // Hydration-safe: only start clock after mount
  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const clockStr = now
    ? `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
    : '--:--'

  const hebDate    = now ? formatHebrewDate(now)    : ''
  const gregDate   = now ? formatGregorianDate(now)  : ''

  return (
    <header
      className="flex items-center justify-between shrink-0 px-4"
      style={{
        height:           52,
        background:       'rgba(255,255,255,0.06)',
        borderBottom:     '1px solid rgba(255,255,255,0.08)',
        backdropFilter:   'blur(8px)',
      }}
    >
      {/* Right side: logo + title */}
      <div className="flex items-center gap-3">
        {layout.headerShowLogo && school.logoUrl && (
          <img
            src={school.logoUrl}
            alt={school.name}
            className="h-8 w-auto object-contain"
          />
        )}
        {layout.headerShowTitle && (
          <span
            className="font-semibold text-white"
            style={{ fontSize: 'clamp(12px, 1.4vw, 18px)' }}
          >
            {screen.name}
          </span>
        )}
      </div>

      {/* Left side: date / clock */}
      <div className="flex items-center gap-4" style={{ color: 'rgba(255,255,255,0.65)' }}>
        {layout.headerShowDate && (
          <span style={{ fontSize: 'clamp(10px, 1.1vw, 14px)' }}>{gregDate}</span>
        )}
        {layout.headerShowHebDate && (
          <span style={{ fontSize: 'clamp(10px, 1.1vw, 14px)' }}>{hebDate}</span>
        )}
        {layout.headerShowClock && (
          <span
            className="text-white font-medium tabular-nums"
            style={{ fontSize: 'clamp(13px, 1.5vw, 20px)' }}
          >
            {clockStr}
          </span>
        )}
      </div>

      {/* Scrolling announcement below header (if set) */}
      {layout.headerScrollText && (
        <div
          className="absolute bottom-0 inset-x-0 h-5 flex items-center overflow-hidden"
          style={{ background: 'rgba(0,0,0,0.25)' }}
        >
          <div className="ticker-wrap flex-1">
            <span className="ticker-text text-white/70" style={{ fontSize: 11 }}>
              {layout.headerScrollText}
            </span>
          </div>
        </div>
      )}
    </header>
  )
}
