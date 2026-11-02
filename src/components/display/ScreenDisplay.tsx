'use client'

import { screenFont } from '@/lib/screenFont'
import { isScreenInOperatingHours, type ScreenSchedule } from '@/lib/screenSchedule'
import { useEffect, useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PublicScreenData } from '@/types'
import DisplayHeader from './DisplayHeader'
import DisplayFooter from './DisplayFooter'
import EmergencyOverlay from './EmergencyOverlay'
import ContentRenderer from './ContentRenderer'
import { resolveScreenTheme } from '@/lib/screenThemes'
import { unifiedPalette } from '@/lib/unifiedPalette'
import { getDisplayTemplate, getTemplateWidths, getDisplaySurface } from '@/lib/displayTemplates'

interface Props { data: PublicScreenData; refreshSecs: number; schedule: ScreenSchedule }

export default function ScreenDisplay({ data, refreshSecs, schedule }: Props) {
  const router = useRouter()
  const { screen, school, sections, emergencyAlert, activeAnnouncements } = data

  // The initial HTML remains consistent during hydration; a local timer switches to standby.
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    const update = () => setNow(new Date())
    update()
    const timer = setInterval(update, 30000) // Local clock only; no server request.
    return () => clearInterval(timer)
  }, [])
  const operating = !now || isScreenInOperatingHours(schedule, school.timezone, now)
  const [offline, setOffline] = useState(false)
  useEffect(() => {
    let mounted = true
    let controller: AbortController | null = null
    const check = async () => {
      controller?.abort()
      controller = new AbortController()
      const timeout = window.setTimeout(() => controller?.abort(), 8000)
      try {
        const response = await fetch('/api/public/connection?ts=' + Date.now(), { cache: 'no-store', signal: controller.signal })
        if (mounted) setOffline(!response.ok)
      } catch { if (mounted) setOffline(true) }
      finally { window.clearTimeout(timeout) }
    }
    void check()
    const timer = window.setInterval(check, 30000)
    const onOnline = () => { void check() }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOnline)
    return () => { mounted = false; controller?.abort(); window.clearInterval(timer); window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOnline) }
  }, [])
  const layout = screen.layout
  const refresh = useCallback(() => router.refresh(), [router])

  useEffect(() => {
    if (offline) return
    const t = setInterval(refresh, (refreshSecs || 600) * 1000)
    return () => clearInterval(t)
  }, [refresh, refreshSecs, offline])

  // Collect birthdays from content items for footer ticker
  const birthdays: { name: string; grade?: string }[] = []
  sections.forEach(s => {
    if (s.activeContent?.contentType === 'BIRTHDAYS') {
      const settings = s.activeContent.settings as any
      if (settings?.personName) birthdays.push({ name: settings.personName, grade: settings.grade })
    }
  })

  const template = getDisplayTemplate(layout?.bgColor)
  const widths = getTemplateWidths(template,sections.length)
  const theme = resolveScreenTheme(layout?.bgColor)
  const palette = unifiedPalette(theme.bg)
  const themeStyle = {
    fontFamily:screenFont(layout?.fontFamily),
    background: layout?.bgImageUrl ? `url(${layout.bgImageUrl}) center/cover no-repeat` : theme.bg,
    '--tv-base':theme.bg, '--tv-panel':theme.panel, '--tv-header':theme.header, '--tv-footer':theme.footer,
    '--tv-ink':theme.panelText, '--tv-header-ink':theme.headerText, '--tv-footer-ink':theme.footerText, '--tv-panel-ink':theme.panelText, '--tv-accent':theme.accent, '--tv-border':theme.border,
    '--tv-radius':theme.radius,
    '--tv-unified-ink':palette.ink, '--tv-unified-muted':palette.muted,
    '--tv-unified-card':palette.card, '--tv-unified-stroke':palette.stroke,
  } as React.CSSProperties

  if (!operating) {
    const time = new Intl.DateTimeFormat('he-IL', { timeZone: school.timezone || 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false }).format(now!)
    const logo = school.logoUrl || school.theme?.logoUrl
    return <div dir="rtl" className="w-screen h-screen bg-black text-white flex flex-col items-center justify-center overflow-hidden" style={{ fontFamily: 'Arial, sans-serif' }}>
      <div className="absolute top-5 right-6 text-xl text-gray-400" aria-label="שעה נוכחית">{time}</div>
      {schedule.standbyMode === 'logo' && logo && <img src={logo} alt={school.name} className="max-h-28 max-w-56 object-contain mb-5" />}
      {schedule.standbyMode !== 'clock' && <div className="text-3xl font-medium text-gray-100">נתראה בקרוב!</div>}
    </div>
  }

  return (
    <div className="w-screen h-screen flex flex-col overflow-hidden tv-display tv-display-premium tv-screen-stage" data-display-template={template} data-surface-style={getDisplaySurface(layout?.bgColor)} data-screen-theme={theme.id} style={themeStyle}>
      {/* Emergency overlay */}
      {emergencyAlert && <EmergencyOverlay announcement={emergencyAlert} />}

      {/* Header */}
      {layout?.headerEnabled && (
        <DisplayHeader screen={screen} layout={layout} school={school} />
      )}

      {/* Main sections */}
      <div className="flex flex-1 min-h-0 overflow-hidden tv-content-grid">
        {sections.map((section, i) => (
          <div
            key={i}
            className="h-full min-w-0 overflow-hidden tv-content-panel"
            style={{ flex: `${widths[i] ?? section.widthPct} ${widths[i] ?? section.widthPct} 0%` }}
          >
            {section.activeContent ? (
              <ContentRenderer item={section.activeContent} offline={offline} screenId={screen.id} />
            ) : (
              <div className="w-full h-full" />
            )}
          </div>
        ))}
      </div>

      {offline && <div dir="rtl" className="absolute bottom-1 left-2 z-20 rounded bg-black/70 px-2 py-1 text-xs text-white/80 pointer-events-none">אין חיבור לאינטרנט · מוצג תוכן שמור</div>}
      {/* Footer */}
      {layout?.footerEnabled && (
        <DisplayFooter layout={layout} school={school} screenName={screen.name} birthdays={birthdays} />
      )}
    </div>
  )
}
