'use client'
import { useEffect, useState } from 'react'
import type { Screen, ScreenLayout, School } from '@/types'
import { formatGregorianDate } from '@/lib/utils'
import { formatHebrewDateLetters } from '@/lib/hebrew-date-display'
import HeaderWeather from './HeaderWeather'
import WeeklyParasha from './WeeklyParasha'

interface Props { screen: Screen; layout: ScreenLayout; school: School }
export default function DisplayHeader({ screen, layout, school }: Props) {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    const update = () => setNow(new Date())
    update()
    const timer = setInterval(update, 15000)
    return () => clearInterval(timer)
  }, [])
  const height = layout.headerHeight ?? 80
  const compact = height < 72
  const titleSize = Math.min(layout.headerTitleFontSize ?? 26, 64, Math.floor(height * 0.6))
  const showGregorian = !!layout.headerShowDate && (layout.headerDateType ?? 'BOTH') !== 'HEBREW'
  const showHebrew = !!layout.headerShowDate && (layout.headerDateType ?? 'BOTH') !== 'GREGORIAN'
  const hasDate = showGregorian || showHebrew
  const clockSize = height <= 60 ? 25 : height <= 80 ? 34 : height <= 100 ? 43 : 51
  const dateSize = height <= 60 ? 10 : height <= 80 ? 12 : height <= 100 ? 14 : 16
  const clock = now ? `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}` : '--:--'
  return <header className={`tv-premium-header tv-chrome-header tv-header-v2${compact ? ' tv-header-compact' : ''}`} dir="rtl"
    style={{height, minHeight:height, background:'var(--tv-header,#183452)', color:'var(--tv-header-ink,#edf5ff)', borderBottom:'1px solid var(--tv-border,#45617e)'}}>
    <div className="tv-v2-brand">
      {layout.headerShowLogo && school.logoUrl && <img className="tv-v2-logo" src={school.logoUrl} alt="" />}
      {layout.headerShowTitle && <div className="tv-v2-brand-text">
        <strong className="tv-v2-school-name">{screen.name}</strong>
      </div>}
    </div>
    <div className="tv-v2-center">
      {layout.headerScrollText && <div className="tv-v2-message" style={{'--header-title-font-size': `${titleSize}px`, fontSize:titleSize, fontWeight:layout.headerTitleFontWeight ?? 700, minWidth:0, padding:`${Math.max(2,Math.floor(height*.06))}px ${Math.max(8,Math.floor(height*.14))}px`,maxHeight:Math.max(24,height-12),lineHeight:1.15,boxSizing:"border-box"} as React.CSSProperties} title={layout.headerScrollText}>{layout.headerScrollText}</div>}
    </div>
    <div className="tv-v2-time-group">
      <div className="tv-v2-clock-weather">
        <div className="tv-v2-clock-dates" style={{maxHeight:height-6,justifyContent:"center",minHeight:0,gap:0,'--clock-font-size':`${clockSize}px`,'--date-font-size':`${dateSize}px`} as React.CSSProperties}>
          {layout.headerShowClock && <time className="tv-v2-clock" dir="ltr" style={{fontSize:clockSize,lineHeight:1,flexShrink:0}} suppressHydrationWarning>{clock}</time>}
          {now && (hasDate || layout.headerShowParasha) && <div className="tv-v2-dates tv-header-date-rows" dir="rtl" style={{fontSize:dateSize,lineHeight:1.1,marginTop:1,gap:1,display:'flex',flexDirection:'column',alignItems:'center',flexWrap:'nowrap',opacity:.95}}>
            {showGregorian && <span>{formatGregorianDate(now)}</span>}
            {(showHebrew || layout.headerShowParasha) && <div className="tv-hebrew-parasha-row" style={{display:'flex',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:5,whiteSpace:'nowrap'}}>
              {showHebrew && <span>{formatHebrewDateLetters(now)}</span>}
              {layout.headerShowParasha && <WeeklyParasha />}
            </div>}
          </div>}
        </div>
        {layout.headerShowWeather && <HeaderWeather compact={true} city={school.weatherCity} />}
      </div>
    </div>
  </header>
}
