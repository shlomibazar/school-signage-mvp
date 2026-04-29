'use client'
// src/components/display/EmergencyOverlay.tsx
// Full-screen overlay that overrides all other content during an emergency alert

import type { Announcement } from '@/types'

interface Props {
  announcement: Announcement
}

export default function EmergencyOverlay({ announcement }: Props) {
  return (
    <div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center text-center p-8 emergency-pulse"
      style={{
        background: announcement.bgColor ?? '#b91c1c',
        color:      announcement.textColor ?? '#ffffff',
      }}
    >
      {/* Alert icon */}
      <div
        className="mb-6 flex items-center justify-center rounded-full"
        style={{
          width:      80,
          height:     80,
          background: 'rgba(255,255,255,0.15)',
          fontSize:   40,
        }}
      >
        {announcement.icon ?? '⚠️'}
      </div>

      {/* Title */}
      <h1
        className="font-bold leading-tight mb-4"
        style={{ fontSize: 'clamp(28px, 5vw, 64px)' }}
      >
        {announcement.title}
      </h1>

      {/* Body */}
      {announcement.body && (
        <p
          className="max-w-3xl leading-relaxed"
          style={{
            fontSize: 'clamp(16px, 2.5vw, 32px)',
            opacity:  0.9,
          }}
        >
          {announcement.body}
        </p>
      )}

      {/* Flashing border */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          border:        '6px solid rgba(255,255,255,0.5)',
          animation:     'emergency-pulse 1.5s ease-in-out infinite',
          borderRadius:  0,
        }}
      />
    </div>
  )
}
