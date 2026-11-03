'use client'

import { screenFont } from '@/lib/screenFont'
import { isScreenInOperatingHours, type ScreenSchedule } from '@/lib/screenSchedule'
import { useEffect, useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PublicScreenData } from '@/types'
import DisplayHeader from './DisplayHeader'
import DisplayFooter from './DisplayFooter'
import EmergencyOverlay from './EmergencyOverlay'
import ContentRenderer from './ContentRenderer'
import { resolveScreenTheme, screenStageBackground } from '@/lib/screenThemes'
import { unifiedPalette } from '@/lib/unifiedPalette'
import { getDisplayTemplate, getTemplateWidths, getDisplaySurface, isStackedLayout } from '@/lib/displayTemplates'
import PanelBoundary from './PanelBoundary'
import { resolveActiveContent } from '@/lib/scheduling'

const PROBE_MS = 30_000
const RETRY_PROBE_MS = 10_000
const PROBE_TIMEOUT_MS = 8_000
const OFFLINE_AFTER = 3

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
    let running = false
    let failures = 0
    let next: number | undefined
    const plan = (ms: number) => { window.clearTimeout(next); next = window.setTimeout(() => void check(), ms) }
    // One failed probe (a server restart, a Render cold start, a slow network moment) must not
    // switch the TV to offline mode: it takes OFFLINE_AFTER failures in a row. After a failure
    // the next probe comes sooner, so a real outage is still noticed within about half a minute.
    const check = async () => {
      if (running) return
      running = true
      const controller = new AbortController()
      const timeout = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
      let ok = false
      try {
        const response = await fetch('/api/public/connection?ts=' + Date.now(), { cache: 'no-store', signal: controller.signal })
        ok = response.ok
      } catch { /* counted as a failure below */ }
      finally { window.clearTimeout(timeout); running = false }
      if (!mounted) return
      failures = ok ? 0 : failures + 1
      setOffline(failures >= OFFLINE_AFTER)
      plan(failures > 0 && failures < OFFLINE_AFTER ? RETRY_PROBE_MS : PROBE_MS)
    }
    void check()
    const onNetworkChange = () => plan(0)
    window.addEventListener('online', onNetworkChange)
    window.addEventListener('offline', onNetworkChange)
    return () => { mounted = false; window.clearTimeout(next); window.removeEventListener('online', onNetworkChange); window.removeEventListener('offline', onNetworkChange) }
  }, [])
  const layout = screen.layout
  const refresh = useCallback(() => router.refresh(), [router])

  useEffect(() => {
    if (offline) return
    const t = setInterval(refresh, (refreshSecs || 600) * 1000)
    return () => clearInterval(t)
  }, [refresh, refreshSecs, offline])

  // Back online after an outage: load the current content right away instead of waiting for
  // the next scheduled refresh (content may have changed while the TV was offline).
  const wasOffline = useRef(false)
  useEffect(() => {
    if (wasOffline.current && !offline) refresh()
    wasOffline.current = offline
  }, [offline, refresh])

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
  const stacked = isStackedLayout(screen.orientation)
  const theme = resolveScreenTheme(layout?.bgColor)
  const palette = unifiedPalette(theme.bg)
  const themeStyle = {
    fontFamily:screenFont(layout?.fontFamily),
    background: screenStageBackground(layout?.bgImageUrl, theme.bg),
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
      {emergencyAlert && <PanelBoundary name="emergency" fallback={null}><EmergencyOverlay announcement={emergencyAlert} /></PanelBoundary>}

      {/* Header */}
      {layout?.headerEnabled && (
        <PanelBoundary name="header" resetKey={JSON.stringify(layout)} fallback={<div style={{ height: layout.headerHeight ?? 80, background: 'var(--tv-header, #183452)' }} />}>
          <DisplayHeader screen={screen} layout={layout} school={school} />
        </PanelBoundary>
      )}

      {/* Main sections */}
      <div className={`flex ${stacked ? 'flex-col' : ''} flex-1 min-h-0 overflow-hidden tv-content-grid`} data-orientation={screen.orientation}>
        {sections.map((section, i) => (
          <div
            key={i}
            className={`${stacked ? 'w-full min-h-0' : 'h-full min-w-0'} overflow-hidden tv-content-panel`}
            style={{ flex: `${widths[i] ?? section.widthPct} ${widths[i] ?? section.widthPct} 0%` }}
          >
            {(() => {
              // Scheduled sections are re-checked with the local 30 s clock in the school's time
              // zone; until the clock starts (hydration) the server's choice is used.
              const content = section.items && now ? resolveActiveContent(section.items, now, school.timezone) : section.activeContent
              return content ? (
                <PanelBoundary name={`section ${i + 1}`} resetKey={JSON.stringify(content)}>
                  <ContentRenderer item={content} offline={offline} screenId={screen.id} />
                </PanelBoundary>
              ) : null
            })() ?? (
              <div className="w-full h-full" />
            )}
          </div>
        ))}
      </div>

      {offline && <div dir="rtl" className="absolute bottom-1 left-2 z-20 rounded bg-black/70 px-2 py-1 text-xs text-white/80 pointer-events-none">אין חיבור לאינטרנט · מוצג תוכן שמור</div>}
      {/* Footer */}
      {layout?.footerEnabled && (
        <PanelBoundary name="footer" resetKey={JSON.stringify(layout)} fallback={<div style={{ height: layout.footerHeight ?? 48, background: 'var(--tv-header, #183452)' }} />}>
          <DisplayFooter layout={layout} school={school} screenName={screen.name} birthdays={birthdays} />
        </PanelBoundary>
      )}
    </div>
  )
}
