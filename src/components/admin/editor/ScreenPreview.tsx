'use client'
import { screenFont } from '@/lib/screenFont'

import { useEffect, useRef, useState } from 'react'
import type { Screen, ScreenLayout, ScreenSection } from '@/types'
import { formatGregorianDate } from '@/lib/utils'
import { formatHebrewDateLetters } from '@/lib/hebrew-date-display'
import HeaderWeather from '@/components/display/HeaderWeather'
import WeeklyParasha from '@/components/display/WeeklyParasha'
import { resolveScreenTheme } from '@/lib/screenThemes'
import { unifiedPalette } from '@/lib/unifiedPalette'
import { getDisplayTemplate, getTemplateWidths, getDisplaySurface } from '@/lib/displayTemplates'
import ContentRenderer from '@/components/display/ContentRenderer'

interface Props { screen: Screen; layout: ScreenLayout; sections: ScreenSection[]; enlarged?: boolean; logoUrl?: string | null; weatherCity?: string | null }

export default function ScreenPreview({ screen, layout, sections, enlarged = false, logoUrl, weatherCity }: Props) {
  const isLandscape = screen.orientation !== 'PORTRAIT'
  const holderRef = useRef<HTMLDivElement>(null)
  const [holderWidth, setHolderWidth] = useState(960)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 15000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    const node = holderRef.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => setHolderWidth(entry.contentRect.width))
    observer.observe(node)
    setHolderWidth(node.getBoundingClientRect().width)
    return () => observer.disconnect()
  }, [])
  const baseWidth = isLandscape ? 1920 : 1080
  const baseHeight = isLandscape ? 1080 : 1920
  const scale = Math.max(.05, Math.min(1, (enlarged ? Math.max(holderWidth, 1250) : holderWidth) / baseWidth))
  const hh  = now.getHours().toString().padStart(2,'0')
  const mm  = now.getMinutes().toString().padStart(2,'0')
  const heb  = formatHebrewDateLetters(now)
  const greg = formatGregorianDate(now)

  const headerH = layout.headerHeight ?? 80
  const footerH = layout.footerHeight ?? 48

  const headerPx = Math.max(40, Math.min(160, headerH))
  const clockSize = headerPx <= 60 ? 25 : headerPx <= 80 ? 34 : headerPx <= 100 ? 43 : 51
  const dateSize = headerPx <= 60 ? 10 : headerPx <= 80 ? 12 : headerPx <= 100 ? 14 : 16
  const footerPx = Math.max(36, Math.min(110, footerH))

  const dateType = layout.headerDateType ?? 'BOTH'
  const showHeb = !!layout.headerShowDate && dateType !== 'GREGORIAN'
  const showGreg = layout.headerShowDate && dateType !== 'HEBREW'
  
  const displayTemplate = getDisplayTemplate(layout.bgColor)
  const broadcast = displayTemplate !== 'classic'
  const templateWidths = getTemplateWidths(displayTemplate,layout.mainSections)
  const selectedTheme = resolveScreenTheme(layout.bgColor)
  const palette = unifiedPalette(selectedTheme.bg)
  const theme = selectedTheme.bg
  const panelBackground = selectedTheme.panel
  const themeVars = {
    '--tv-base': selectedTheme.bg, '--tv-panel': selectedTheme.panel,
    '--tv-header': selectedTheme.header, '--tv-footer': selectedTheme.footer, '--tv-ink': selectedTheme.panelText, '--tv-header-ink': selectedTheme.headerText, '--tv-footer-ink': selectedTheme.footerText, '--tv-panel-ink': selectedTheme.panelText,
    '--tv-accent': selectedTheme.accent, '--tv-border': selectedTheme.border,
    '--tv-radius': selectedTheme.radius,
    '--tv-unified-ink':palette.ink, '--tv-unified-muted':palette.muted,
    '--tv-unified-card':palette.card, '--tv-unified-stroke':palette.stroke,
  } as React.CSSProperties

  return (
    <div ref={holderRef} className="w-full min-w-0" style={{ width: enlarged ? (isLandscape ? 1250 : 700) : '100%', maxWidth: enlarged ? undefined : (isLandscape ? 1100 : 550), marginInline: enlarged ? undefined : 'auto', flexShrink:0 }}>
      <div className="relative w-full" style={{ aspectRatio: `${baseWidth} / ${baseHeight}` }}>
        <div dir="rtl" className={`absolute top-0 right-0 overflow-hidden shadow-xl border tv-display-premium tv-screen-stage ${broadcast ? 'tv-broadcast-preview' : ''}`} data-display-template={displayTemplate} data-surface-style={getDisplaySurface(layout.bgColor)}
          style={{ width:baseWidth, height:baseHeight, transform:`scale(${scale})`, transformOrigin:'top right', background:theme, fontFamily:screenFont(layout.fontFamily), borderColor:selectedTheme.border, borderRadius:22, color:selectedTheme.panelText, boxSizing:'border-box', ...themeVars, ...(broadcast ? {'--broadcast-preview-header': layout.headerEnabled ? '94px' : '0px', '--broadcast-preview-footer': layout.footerEnabled ? '44px' : '0px'} as React.CSSProperties : {}) }}>
          {layout.headerEnabled && (
            <div className={`flex items-center justify-between border-b ${broadcast ? 'tv-preview-broadcast-header' : ''}`} style={{height:headerPx, paddingInline:58, gap:40, background:selectedTheme.header,color:selectedTheme.headerText,borderColor:selectedTheme.border,position:'relative'}}>
              <div className="min-w-0 text-right" style={{maxWidth:'32%',display:'flex',alignItems:'center',gap:14}}>
                {layout.headerShowLogo && logoUrl && <img src={logoUrl} alt="" style={{maxHeight:Math.max(25,headerPx-14),maxWidth:110,objectFit:"contain"}}/>}
                {layout.headerShowTitle && <div className="font-bold truncate" style={{fontSize:Math.min(34,headerPx*.36)}}>{screen.name}</div>}

              </div>
              {layout.headerScrollText && <div className="max-w-[40%] rounded-full border truncate text-center font-semibold" style={{fontSize:Math.min(layout.headerTitleFontSize ?? 26, 64, Math.floor(headerPx * 0.6)),fontWeight:layout.headerTitleFontWeight ?? 700,padding:`${Math.max(2,Math.floor(headerPx*.06))}px ${Math.max(8,Math.floor(headerPx*.14))}px`,lineHeight:1.15,maxHeight:headerPx-10,boxSizing:"border-box",borderColor:selectedTheme.border}}>{layout.headerScrollText}</div>}
              <div className="tv-preview-clock-weather shrink-0" dir="ltr" style={{display:'flex',alignItems:'center',justifyContent:'flex-start',gap:28,maxWidth:'42%',minWidth:0}}>
                <div className="tv-preview-clock-dates" style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',textAlign:'center',flexShrink:0,maxHeight:headerPx-6,gap:0}}>
                  {layout.headerShowClock && <div className="font-bold tabular-nums" style={{fontSize:clockSize,lineHeight:1,color:selectedTheme.headerText}}>{hh}:{mm}</div>}
                  {(showGreg || showHeb || layout.headerShowParasha) && <div className="tv-preview-date-stack tv-header-date-rows" style={{fontSize:dateSize,lineHeight:1.1,opacity:.95,gap:1,marginTop:1}} dir="rtl">
                    {showGreg && <span>{greg}</span>}
                    {(showHeb || layout.headerShowParasha) && <div className="tv-hebrew-parasha-row" style={{display:'flex',alignItems:'center',justifyContent:'center',gap:5,whiteSpace:'nowrap'}}>
                      {showHeb && <span>{heb}</span>}
                      {layout.headerShowParasha && <WeeklyParasha />}
                    </div>}
                  </div>}
                </div>
                {layout.headerShowWeather && <HeaderWeather compact={headerPx < 90} city={weatherCity} />}
              </div>
            </div>
          )}
          <div className={`flex tv-content-grid ${broadcast ? 'tv-preview-broadcast-main' : ''}`} style={{height:baseHeight-(layout.headerEnabled?headerPx:0)-(layout.footerEnabled?footerPx:0),gap:12,padding:14,boxSizing:'border-box'}}>
            {sections.slice(0,layout.mainSections).map((section,i)=>{
              const item=section.contentItems.find(ci=>ci.active) ?? section.contentItems[0]
              return <div key={section.id} className="h-full min-w-0 overflow-hidden tv-content-panel" style={{flex:`${templateWidths[i] ?? section.widthPct} ${templateWidths[i] ?? section.widthPct} 0%`}}>
                {item && item.contentType !== 'EMPTY' ? (
                  <ContentRenderer key={`${section.id}-${item.id}-${item.contentType}`} item={item} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center opacity-50" style={{fontSize:30}}>בחר תוכן לאזור זה</div>
                )}
              </div>
            })}
          </div>
          {layout.footerEnabled && <div className={`absolute bottom-0 w-full border-t flex items-center justify-between ${broadcast ? 'tv-preview-broadcast-footer' : ''}`} style={{height:footerPx,paddingInline:58,gap:30,background:selectedTheme.footer,borderColor:selectedTheme.border}}>
            {layout.footerShowSchoolName && <span className="shrink-0 font-semibold" style={{fontSize:24}}>{screen.name}</span>}
            <span className="min-w-0 flex-1 truncate text-center" style={{fontSize:25,color:selectedTheme.text}}>{layout.footerFeedMode === 'rss' ? '📰 כותרות RSS בגלילה' : layout.footerFeedMode === 'both' ? `${layout.footerTicker ?? ''}  ✦  📰 כותרות RSS בגלילה` : (layout.footerTicker ?? '')}</span>
            {layout.footerShowClock && <span className="shrink-0 tabular-nums" style={{fontSize:25,color:selectedTheme.headerText}}>{hh}:{mm}</span>}
          </div>}
        </div>
      </div>
    </div>
  )
}
