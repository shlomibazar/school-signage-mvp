'use client'
// src/components/display/ContentRenderer.tsx
// Renders any ContentItem type on the public display

import { useState, useEffect, useMemo } from 'react'
import type { ContentItem } from '@/types'
import { sanitizeHTML, formatHebrewDate, formatGregorianDate } from '@/lib/utils'

export default function ContentRenderer({ item }: { item: ContentItem }) {
  switch (item.contentType) {
    case 'TEXT':        return <TextContent item={item} />
    case 'IMAGE_GALLERY': return <GalleryContent item={item} />
    case 'CLOCK':       return <ClockContent />
    case 'DATE':        return <DateContent />
    case 'WEATHER':     return <WeatherContent item={item} />
    case 'ANNOUNCEMENT': return <AnnouncementContent item={item} />
    default:
      return (
        <div className="w-full h-full flex items-center justify-center text-white/30 text-sm">
          {item.contentType}
        </div>
      )
  }
}

// ─── Text ────────────────────────────────────────────────
function TextContent({ item }: { item: ContentItem }) {
  // Sanitize HTML before rendering to prevent XSS
  const safeHTML = useMemo(
    () => sanitizeHTML(item.textContent ?? ''),
    [item.textContent],
  )
  return (
    <div
      className="w-full h-full flex items-center justify-center p-6 text-center"
      style={{
        background: item.bgColor ?? 'transparent',
        color:      item.textColor ?? '#ffffff',
        fontSize:   item.fontSize ?? 24,
        fontWeight: 500,
        lineHeight: 1.4,
      }}
    >
      <div dangerouslySetInnerHTML={{ __html: safeHTML }} />
    </div>
  )
}

// ─── Gallery ─────────────────────────────────────────────
function GalleryContent({ item }: { item: ContentItem }) {
  const files = item.gallery?.files ?? []
  const [index, setIndex] = useState(0)
  const duration = (item.slideDuration || 5) * 1000

  // Fix: depend on stable file IDs, not just length
  const fileKey = files.map(f => f.id).join(',')

  useEffect(() => {
    if (files.length <= 1) return
    // Reset index when file list changes
    setIndex(0)
    const t = setInterval(() => setIndex(i => (i + 1) % files.length), duration)
    return () => clearInterval(t)
  }, [fileKey, duration]) // eslint-disable-line react-hooks/exhaustive-deps

  if (files.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-white/20 flex-col gap-2">
        <span style={{ fontSize: 32 }}>🖼</span>
        <span className="text-sm">אין תמונות בגלריה</span>
      </div>
    )
  }

  const current = files[index]
  return (
    <div className="relative w-full h-full overflow-hidden">
      {files.map((file, i) => (
        <img
          key={file.id}
          src={file.url}
          alt={file.caption ?? ''}
          className="absolute inset-0 w-full h-full object-cover"
          style={{
            opacity:    i === index ? 1 : 0,
            transition: `opacity ${item.transitionStyle === 'instant' ? 0 : 800}ms ease-in-out`,
          }}
        />
      ))}
      {current.caption && (
        <div className="absolute bottom-0 inset-x-0 p-4"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.65), transparent)' }}>
          <p className="text-white text-center" style={{ fontSize: 'clamp(12px, 1.5vw, 18px)' }}>
            {current.caption}
          </p>
        </div>
      )}
      {/* Slide indicator dots */}
      {files.length > 1 && (
        <div className="absolute bottom-3 inset-x-0 flex justify-center gap-1.5">
          {files.map((_, i) => (
            <div
              key={i}
              className="rounded-full"
              style={{
                width:      i === index ? 16 : 6,
                height:     6,
                background: i === index ? '#fff' : 'rgba(255,255,255,0.35)',
                transition: 'all 0.3s',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Clock ───────────────────────────────────────────────
function ClockContent() {
  const [time, setTime] = useState<Date | null>(null)
  useEffect(() => {
    setTime(new Date())
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const h = time?.getHours().toString().padStart(2, '0')  ?? '--'
  const m = time?.getMinutes().toString().padStart(2, '0') ?? '--'

  return (
    <div className="w-full h-full flex items-center justify-center">
      <div
        className="text-white font-light tabular-nums"
        style={{ fontSize: 'clamp(48px, 8vw, 120px)', letterSpacing: '-0.02em' }}
      >
        {h}:{m}
      </div>
    </div>
  )
}

// ─── Date ────────────────────────────────────────────────
function DateContent() {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  const gregorian = now ? formatGregorianDate(now) : ''
  const hebrew    = now ? formatHebrewDate(now)    : ''   // real Hebrew date via Intl

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-white">
      <div style={{ fontSize: 'clamp(18px, 2.5vw, 36px)' }}>{gregorian}</div>
      <div className="text-white/50" style={{ fontSize: 'clamp(14px, 2vw, 28px)' }}>{hebrew}</div>
    </div>
  )
}

// ─── Weather placeholder ─────────────────────────────────
function WeatherContent({ item }: { item: ContentItem }) {
  // Phase 3: integrate OpenWeatherMap API
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-white">
      <div style={{ fontSize: 64 }}>🌤</div>
      <div style={{ fontSize: 'clamp(28px, 5vw, 72px)', fontWeight: 300 }}>24°</div>
      <div className="text-white/60" style={{ fontSize: 'clamp(12px, 1.5vw, 18px)' }}>
        {item.weatherCity ?? 'תל אביב-יפו'}
      </div>
    </div>
  )
}

// ─── Announcement card ───────────────────────────────────
function AnnouncementContent({ item }: { item: ContentItem }) {
  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center p-8 text-center"
      style={{
        background: item.bgColor ?? '#1e3a5f',
        color:      item.textColor ?? '#ffffff',
      }}
    >
      {item.icon && (
        <div style={{ fontSize: 56, marginBottom: 16 }}>{item.icon}</div>
      )}
      <div
        style={{
          fontSize:   'clamp(20px, 3.5vw, 56px)',
          fontWeight: 600,
          lineHeight: 1.3,
        }}
      >
        {item.textContent}
      </div>
    </div>
  )
}
