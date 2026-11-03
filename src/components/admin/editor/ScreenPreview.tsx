'use client'
import { screenFont } from '@/lib/screenFont'

import { useEffect, useRef, useState } from 'react'
import type { Screen, ScreenLayout, ScreenSection } from '@/types'
import { formatGregorianDate } from '@/lib/utils'
import { formatHebrewDateLetters } from '@/lib/hebrew-date-display'
import HeaderWeather from '@/components/display/HeaderWeather'
import WeeklyParasha from '@/components/display/WeeklyParasha'
import { resolveScreenTheme, screenStageBackground } from '@/lib/screenThemes'
import { unifiedPalette } from '@/lib/unifiedPalette'
import { getDisplayTemplate, getTemplateWidths, getDisplaySurface } from '@/lib/displayTemplates'
import { resolveActiveContent } from '@/lib/scheduling'
import ContentRenderer from '@/components/display/ContentRenderer'

// The TV CSS sizes chrome and gaps with vw/vh, which inside the editor would refer to the
// admin window. These mirror those clamp() rules for the preview's real reference canvas.
const clampPx=(min:number,value:number,max:number)=>Math.min(max,Math.max(min,value))

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
  const visibleSections = sections.slice(0,layout.mainSections)
  // Same count as the public screen, which sizes columns by the sections it actually renders.
  const templateWidths = getTemplateWidths(displayTemplate,visibleSections.length)
  const selectedTheme = resolveScreenTheme(layout.bgColor)
  const palette = unifiedPalette(selectedTheme.bg)
  const theme = selectedTheme.bg
  // Unified surface: the TV paints header and footer with the base color and unified ink.
  const unified = getDisplaySurface(layout.bgColor) === 'unified'
  const headerBg = unified ? selectedTheme.bg : selectedTheme.header
  const headerInk = unified ? palette.ink : selectedTheme.headerText
  const footerBg = unified ? selectedTheme.bg : selectedTheme.footer
  const footerInk = unified ? palette.ink : selectedTheme.footerText
  // 1vw / 1vh of the reference canvas (1920×1080 or 1080×1920).
  const vw = baseWidth / 100, vh = baseHeight / 100
  const classicGap = clampPx(6, .7 * vw, 16)
  const broadcastVars = {
    '--broadcast-preview-header': layout.headerEnabled ? `${clampPx(68, 7 * vh, 100)}px` : '0px',
    '--broadcast-preview-footer': layout.footerEnabled ? `${clampPx(32, 4.2 * vh, 54)}px` : '0px',
    '--broadcast-preview-gap': `${clampPx(12, 1.15 * vw, 24)}px`,
    '--broadcast-preview-radius': `${clampPx(16, 1.4 * vw, 26)}px`,
  } as React.CSSProperties
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
          style={{ width:baseWidth, height:baseHeight, transform:`scale(${scale})`, transformOrigin:'top right', background:screenStageBackground(layout.bgImageUrl, theme), fontFamily:screenFont(layout.fontFamily), borderColor:selectedTheme.border, borderRadius:22, color:selectedTheme.panelText, boxSizing:'border-box', ...themeVars, ...(broadcast ? broadcastVars : {}) }}>
          {layout.headerEnabled && (
            <div className={`flex items-center justify-between border-b ${broadcast ? 'tv-preview-broadcast-header' : ''}`} style={{height:headerPx, paddingInline:58, gap:40, background:headerBg,color:headerInk,borderColor:unified ? 'transparent' : selectedTheme.border,position:'relative'}}>
              <div className="min-w-0 text-right" style={{maxWidth:'32%',display:'flex',alignItems:'center',gap:14}}>
                {layout.headerShowLogo && logoUrl && <img src={logoUrl} alt="" style={{maxHeight:Math.max(25,headerPx-14),maxWidth:110,objectFit:"contain"}}/>}
                {layout.headerShowTitle && <div className="font-bold truncate" style={{fontSize:Math.min(34,headerPx*.36)}}>{screen.name}</div>}

              </div>
              {layout.headerScrollText && <div className="max-w-[40%] rounded-full border truncate text-center font-semibold" style={{fontSize:Math.min(layout.headerTitleFontSize ?? 26, 64, Math.floor(headerPx * 0.6)),fontWeight:layout.headerTitleFontWeight ?? 700,padding:`${Math.max(2,Math.floor(headerPx*.06))}px ${Math.max(8,Math.floor(headerPx*.14))}px`,lineHeight:1.15,maxHeight:headerPx-10,boxSizing:"border-box",borderColor:selectedTheme.border}}>{layout.headerScrollText}</div>}
              <div className="tv-preview-clock-weather shrink-0" dir="ltr" style={{display:'flex',alignItems:'center',justifyContent:'flex-start',gap:28,maxWidth:'42%',minWidth:0}}>
                <div className="tv-preview-clock-dates" style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',textAlign:'center',flexShrink:0,maxHeight:headerPx-6,gap:0}}>
                  {layout.headerShowClock && <div className="font-bold tabular-nums" style={{fontSize:clockSize,lineHeight:1,color:headerInk}}>{hh}:{mm}</div>}
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
          <div className={`flex tv-content-grid ${broadcast ? 'tv-preview-broadcast-main' : ''}`} style={{height:baseHeight-(layout.headerEnabled?headerPx:0)-(layout.footerEnabled?footerPx:0),gap:classicGap,padding:classicGap,boxSizing:'border-box'}}>
            {visibleSections.map((section,i)=>{
              // Same choice as the public screen (active and in schedule now, else first active).
              // An inactive item is still shown as a last resort so the editor is never blank.
              const item=resolveActiveContent(section.contentItems.filter(ci=>ci.active),0,now) ?? section.contentItems[0]
              return <div key={section.id} className="h-full min-w-0 overflow-hidden tv-content-panel" style={{flex:`${templateWidths[i] ?? section.widthPct} ${templateWidths[i] ?? section.widthPct} 0%`}}>
                {item && item.contentType !== 'EMPTY' ? (
                  <ContentRenderer key={`${section.id}-${item.id}-${item.contentType}`} item={item} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center opacity-50" style={{fontSize:30}}>בחר תוכן לאזור זה</div>
                )}
              </div>
            })}
          </div>
          {layout.footerEnabled && <div className={`absolute bottom-0 w-full border-t flex items-center justify-between ${broadcast ? 'tv-preview-broadcast-footer' : ''}`} style={{height:footerPx,paddingInline:58,gap:30,background:footerBg,color:footerInk,borderColor:unified ? 'transparent' : selectedTheme.border}}>
            {/* The TV paints every footer element with the footer ink, including the clock. */}
            {layout.footerShowSchoolName && <span className="shrink-0 font-semibold" style={{fontSize:24}}>{screen.name}</span>}
            <span className="min-w-0 flex-1 truncate text-center" style={{fontSize:25}}>{layout.footerFeedMode === 'rss' ? '📰 כותרות RSS בגלילה' : layout.footerFeedMode === 'both' ? `${layout.footerTicker ?? ''}  ✦  📰 כותרות RSS בגלילה` : (layout.footerTicker ?? '')}</span>
            {layout.footerShowClock && <span className="shrink-0 tabular-nums" style={{fontSize:25}}>{hh}:{mm}</span>}
          </div>}
        </div>
      </div>
    </div>
  )
}
