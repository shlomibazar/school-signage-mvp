'use client'
// src/components/admin/editor/ScreenPreview.tsx
// Live preview of the screen layout rendered inside the editor

import { useState, useEffect } from 'react'
import { formatHebrewDate } from '@/lib/utils'
import type { Screen, ScreenLayout, ScreenSection } from '@/types'

interface Props {
  screen:   Screen
  layout:   ScreenLayout
  sections: ScreenSection[]
}

const SECTION_ICONS: Record<string, string> = {
  TEXT:          '📝',
  IMAGE_GALLERY: '🖼',
  VIDEO:         '🎬',
  CLOCK:         '🕐',
  DATE:          '📅',
  WEATHER:       '🌤',
  RSS_FEED:      '📰',
  TIMETABLE:     '📋',
  EVENTS:        '🗓',
  BIRTHDAYS:     '🎂',
  ANNOUNCEMENT:  '📢',
  EMPTY:         '☐',
}

export default function ScreenPreview({ screen, layout, sections }: Props) {
  const [now, setNow] = useState<Date | null>(null)
  const isLandscape = screen.orientation === 'LANDSCAPE'

  // Hydration-safe clock
  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const clockStr  = now
    ? `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
    : '--:--'

  const hebDate = now ? formatHebrewDate(now) : ''

  return (
    <div
      className="rounded-xl overflow-hidden border border-gray-200 shadow-sm w-full"
      style={{
        maxWidth:    isLandscape ? 640 : 240,
        aspectRatio: isLandscape ? '16/9' : '9/16',
        background:  layout.bgColor ?? '#0f172a',
        display:     'flex',
        flexDirection:'column',
        fontFamily:  'inherit',
      }}
    >
      {/* Header */}
      {layout.headerEnabled && (
        <div
          style={{
            display:       'flex',
            alignItems:    'center',
            justifyContent:'space-between',
            padding:       '5px 10px',
            background:    'rgba(255,255,255,0.07)',
            borderBottom:  '1px solid rgba(255,255,255,0.08)',
            flexShrink:    0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {layout.headerShowLogo && (
              <div style={{ width: 16, height: 16, borderRadius: 3, background: 'rgba(96,165,250,0.3)', flexShrink: 0 }} />
            )}
            {layout.headerShowTitle && (
              <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 9, fontWeight: 500 }}>
                {screen.name}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 8 }}>
            {layout.headerShowHebDate && <span>{hebDate}</span>}
            {layout.headerShowClock && (
              <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 9 }}>{clockStr}</span>
            )}
          </div>
        </div>
      )}

      {/* Sections */}
      <div style={{ flex: 1, display: 'flex', gap: 4, padding: 5, minHeight: 0 }}>
        {sections.map((section, i) => {
          const type = section.contentItems[0]?.contentType ?? 'EMPTY'
          const icon = SECTION_ICONS[type] ?? '☐'
          return (
            <div
              key={section.id}
              style={{
                flex:           section.widthPct / 100,
                borderRadius:   4,
                background:     'rgba(255,255,255,0.04)',
                border:         '1px dashed rgba(255,255,255,0.12)',
                color:          'rgba(255,255,255,0.35)',
                fontSize:       8,
                display:        'flex',
                flexDirection:  'column',
                alignItems:     'center',
                justifyContent: 'center',
                gap:            3,
                minHeight:      0,
              }}
            >
              <span style={{ fontSize: 13 }}>{icon}</span>
              <span>{type === 'EMPTY' ? `אזור ${i + 1}` : type.toLowerCase().replace('_', ' ')}</span>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      {layout.footerEnabled && (
        <div
          style={{
            flexShrink:  0,
            padding:     '3px 10px',
            background:  'rgba(255,255,255,0.03)',
            borderTop:   '1px solid rgba(255,255,255,0.06)',
            display:     'flex',
            alignItems:  'center',
            minHeight:   16,
            overflow:    'hidden',
          }}
        >
          {layout.footerTicker ? (
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 7, whiteSpace: 'nowrap' }}>
              {layout.footerTicker.slice(0, 60)}{layout.footerTicker.length > 60 ? '...' : ''}
            </span>
          ) : layout.footerShowSchoolName ? (
            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 7 }}>שם בית הספר</span>
          ) : null}
        </div>
      )}
    </div>
  )
}
