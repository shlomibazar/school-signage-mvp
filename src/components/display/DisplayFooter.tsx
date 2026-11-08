'use client'
import { useEffect, useMemo, useState, useRef } from 'react'
import { zonedClock } from '@/lib/zonedTime'
import type { ScreenLayout, School } from '@/types'
import { birthdayTickerText, footerBirthdayConfig, type PublicBirthdayList } from '@/lib/birthdayDisplay'
// birthdays: the footer's birthday list from the central registry (computed by the server for this
// screen; null when the segment is off). It is its own ticker segment, shown first and in every feed
// mode; the school's messages and the RSS headlines follow unchanged. No birthdays = no segment.
interface Props { layout:ScreenLayout; school:School; screenName?:string; birthdays?:PublicBirthdayList|null }
export default function DisplayFooter({ layout, school, screenName, birthdays=null }:Props) {
  const [now,setNow] = useState<Date|null>(null)
  const [headlines,setHeadlines] = useState<string[]>([])
  const mode=layout.footerFeedMode??'manual'
  const rssUrl=layout.footerRssUrl?.trim() ?? ''
  const refresh=layout.footerRssRefreshMinutes??15
  useEffect(()=>{const tick=()=>setNow(new Date());tick();const t=setInterval(tick,15000);return()=>clearInterval(t)},[])
  useEffect(()=>{
    if(mode==='manual'||!rssUrl){setHeadlines([]);return}
    let alive=true
    // A failed refresh keeps the last headlines for up to 2 hours instead of emptying the ticker.
    let loadedAt=0
    const load=async()=>{
      // `screen` scopes the public request to this screen's footer (required without a login).
      try{const r=await fetch(`/api/rss?url=${encodeURIComponent(rssUrl)}&max=100&screen=${encodeURIComponent(layout.screenId)}`,{cache:'no-store'});if(!r.ok)throw new Error('RSS error');const d=await r.json();if(alive){loadedAt=Date.now();setHeadlines((d.items??[]).map((x:{title:string})=>x.title).filter(Boolean))}}
      catch{if(alive&&Date.now()-loadedAt>2*60*60*1000)setHeadlines([])}
    }
    void load();const t=setInterval(load,Math.max(5,refresh)*60000)
    return()=>{alive=false;clearInterval(t)}
  },[mode,rssUrl,refresh,layout.screenId])
  const birthdayText=layout.footerShowBirthdays ? birthdayTickerText(birthdays, footerBirthdayConfig(layout).period) : ''
  const manual=layout.footerTicker?.trim() ?? ''
  const ticker=useMemo(()=>[...(birthdayText?[birthdayText]:[]),...(mode!=='rss'&&manual?[manual]:[]),...(mode!=='manual'?headlines:[])].join('   ✦   '),[birthdayText,mode,manual,headlines])
  const speed=layout.footerTickerSpeed??'normal'
  const tickerViewportRef=useRef<HTMLDivElement>(null)
  const tickerTextRef=useRef<HTMLSpanElement>(null)
  const [duration,setDuration]=useState(90)
  useEffect(()=>{
    if(!ticker)return
    const measure=()=>{
      const viewport=tickerViewportRef.current, content=tickerTextRef.current
      if(!viewport||!content)return
      const pixels=viewport.clientWidth+content.scrollWidth
      const pixelsPerSecond=speed==='slow'?22:speed==='fast'?65:38
      setDuration(Math.max(15,pixels/pixelsPerSecond))
    }
    measure()
    const observer=new ResizeObserver(measure)
    if(tickerViewportRef.current)observer.observe(tickerViewportRef.current)
    if(tickerTextRef.current)observer.observe(tickerTextRef.current)
    return()=>observer.disconnect()
  },[ticker,speed])
  const clock=now?zonedClock(now,school.timezone):'--:--'
  const height=layout.footerHeight??48
  return <footer className="tv-premium-footer tv-chrome-footer tv-footer-v2" dir="rtl" style={{height,minHeight:height,background:'var(--tv-header,#183452)',color:'var(--tv-footer-ink,#edf5ff)',borderTop:'1px solid var(--tv-border,#45617e)'}}>
    {layout.footerShowSchoolName&&<div className="tv-v2-footer-brand"><span className="tv-v2-footer-mark" aria-hidden="true"/><span className="tv-v2-footer-school-name" title={screenName??school.name}>{screenName??school.name}</span></div>}
    {ticker&&<div ref={tickerViewportRef} className="tv-v2-ticker tv-v4-ticker-moving tv-rss-footer-slow" style={{'--footer-ticker-duration':`${duration}s`} as React.CSSProperties} aria-label={ticker}><span ref={tickerTextRef} key={ticker} className="tv-v5-ticker-message" style={{animationDuration:`${duration}s`}} aria-hidden="true">{ticker}</span></div>}
    {layout.footerShowClock&&<time className="tv-v2-footer-clock" dir="ltr" suppressHydrationWarning>{clock}</time>}
  </footer>
}
