'use client'
import { useEffect, useMemo, useState, useRef } from 'react'
import type { ScreenLayout, School, Screen } from '@/types'
interface Birthday { name:string; grade?:string }
interface Props { layout:ScreenLayout; school:School; screenName?:string; birthdays?:Birthday[] }
export default function DisplayFooter({ layout, school, screenName, birthdays=[] }:Props) {
  const [now,setNow] = useState<Date|null>(null)
  const [headlines,setHeadlines] = useState<string[]>([])
  const mode=layout.footerFeedMode??'manual'
  const rssUrl=layout.footerRssUrl?.trim() ?? ''
  const refresh=layout.footerRssRefreshMinutes??15
  useEffect(()=>{const tick=()=>setNow(new Date());tick();const t=setInterval(tick,15000);return()=>clearInterval(t)},[])
  useEffect(()=>{
    if(mode==='manual'||!rssUrl){setHeadlines([]);return}
    let alive=true
    const load=async()=>{
      try{const r=await fetch(`/api/rss?url=${encodeURIComponent(rssUrl)}&max=100`,{cache:'no-store'});if(!r.ok)throw new Error('RSS error');const d=await r.json();if(alive)setHeadlines((d.items??[]).map((x:{title:string})=>x.title).filter(Boolean))}
      catch{if(alive)setHeadlines([])}
    }
    void load();const t=setInterval(load,Math.max(5,refresh)*60000)
    return()=>{alive=false;clearInterval(t)}
  },[mode,rssUrl,refresh])
  const birthdayText=layout.footerShowBirthdays && birthdays.length ? birthdays.map(b=>`🎂 יום הולדת שמח ${b.name}${b.grade?` (${b.grade})`:''}!`).join(' • ') : ''
  const manual=[layout.footerTicker?.trim(),birthdayText].filter(Boolean).join('   ✦   ')
  const ticker=useMemo(()=>[...(mode!=='rss'&&manual?[manual]:[]),...(mode!=='manual'?headlines:[])].join('   ✦   '),[mode,manual,headlines])
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
  const clock=now?`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`:'--:--'
  const height=layout.footerHeight??48
  return <footer className="tv-premium-footer tv-chrome-footer tv-footer-v2" dir="rtl" style={{height,minHeight:height,background:'var(--tv-header,#183452)',color:'var(--tv-footer-ink,#edf5ff)',borderTop:'1px solid var(--tv-border,#45617e)'}}>
    {layout.footerShowSchoolName&&<div className="tv-v2-footer-brand"><span className="tv-v2-footer-mark" aria-hidden="true"/><span className="tv-v2-footer-school-name" title={screenName??school.name}>{screenName??school.name}</span></div>}
    {ticker&&<div ref={tickerViewportRef} className="tv-v2-ticker tv-v4-ticker-moving tv-rss-footer-slow" style={{'--footer-ticker-duration':`${duration}s`} as React.CSSProperties} aria-label={ticker}><span ref={tickerTextRef} key={ticker} className="tv-v5-ticker-message" style={{animationDuration:`${duration}s`}} aria-hidden="true">{ticker}</span></div>}
    {layout.footerShowClock&&<time className="tv-v2-footer-clock" dir="ltr" suppressHydrationWarning>{clock}</time>}
  </footer>
}
