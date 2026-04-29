'use client'
// src/components/display/ScreenDisplay.tsx
// The public-facing TV display — no admin controls, auto-refreshes

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { PublicScreenData } from '@/types'
import ContentRenderer from './ContentRenderer'
import DisplayHeader from './DisplayHeader'
import DisplayFooter from './DisplayFooter'
import EmergencyOverlay from './EmergencyOverlay'

interface Props {
  data:        PublicScreenData
  refreshSecs: number
}

export default function ScreenDisplay({ data, refreshSecs }: Props) {
  const router = useRouter()
  const { screen, school, sections, emergencyAlert, activeAnnouncements } = data
  const layout = screen.layout
  const theme  = school.theme

  // Auto-refresh: router.refresh() re-runs the server component,
  // fetching the latest scheduled content without a full page reload.
  useEffect(() => {
    const interval = setInterval(() => router.refresh(), refreshSecs * 1000)
    return () => clearInterval(interval)
  }, [router, refreshSecs])

  const bg = layout?.bgImageUrl
    ? `url(${encodeURI(layout.bgImageUrl)}) center/cover no-repeat`
    : (layout?.bgColor ?? theme?.backgroundColor ?? '#0f172a')

  return (
    <div
      className="tv-display fixed inset-0 flex flex-col overflow-hidden"
      style={{ background: bg, fontFamily: `${theme?.fontFamily ?? 'Heebo'}, sans-serif` }}
    >
      {/* Emergency alert overrides everything */}
      {emergencyAlert && <EmergencyOverlay announcement={emergencyAlert} />}

      {/* Header */}
      {layout?.headerEnabled && !emergencyAlert && (
        <DisplayHeader layout={layout} school={school} screen={screen} />
      )}

      {/* Main content sections */}
      {!emergencyAlert && (
        <div className="flex flex-1 gap-2 min-h-0 p-2">
          {sections.map(section => (
            <div
              key={section.position}
              className="rounded-xl overflow-hidden fade-in"
              style={{
                flex:       section.widthPct / 100,
                background: 'rgba(255,255,255,0.03)',
                border:     '1px solid rgba(255,255,255,0.06)',
              }}
            >
              {section.activeContent ? (
                <ContentRenderer item={section.activeContent} />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-white/20 text-sm">אין תוכן פעיל</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      {layout?.footerEnabled && !emergencyAlert && (
        <DisplayFooter layout={layout} school={school} announcements={activeAnnouncements} />
      )}
    </div>
  )
}
