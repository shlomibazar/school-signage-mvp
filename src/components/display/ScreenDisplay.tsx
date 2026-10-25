'use client'

import { screenFont } from '@/lib/screenFont'
import { useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { PublicScreenData } from '@/types'
import DisplayHeader from './DisplayHeader'
import DisplayFooter from './DisplayFooter'
import EmergencyOverlay from './EmergencyOverlay'
import ContentRenderer from './ContentRenderer'
import { resolveScreenTheme } from '@/lib/screenThemes'
import { unifiedPalette } from '@/lib/unifiedPalette'
import { getDisplayTemplate, getTemplateWidths, getDisplaySurface } from '@/lib/displayTemplates'

interface Props { data: PublicScreenData; refreshSecs: number }

export default function ScreenDisplay({ data, refreshSecs }: Props) {
  const router = useRouter()
  const { screen, school, sections, emergencyAlert, activeAnnouncements } = data

  const layout = screen.layout
  const refresh = useCallback(() => router.refresh(), [router])

  useEffect(() => {
    const t = setInterval(refresh, (refreshSecs || 30) * 1000)
    return () => clearInterval(t)
  }, [refresh, refreshSecs])

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
              <ContentRenderer item={section.activeContent} />
            ) : (
              <div className="w-full h-full" />
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      {layout?.footerEnabled && (
        <DisplayFooter layout={layout} school={school} screenName={screen.name} birthdays={birthdays} />
      )}
    </div>
  )
}
