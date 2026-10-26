'use client'
import WebtopTimetable from './WebtopTimetable'
import { youtubeId } from '@/lib/youtubeVideo'
import { cleanAnnouncementHtml } from '@/lib/announcementRichText'
import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from 'react'
import type { ContentItem,ClockSettings,DateSettings,AnnouncementContentSettings,SingleAnnouncement,BirthdaySettings,EventSettings,TimetableSettings,RssSettings,GallerySettings,RssFeedItem } from '@/types'
import { sanitizeHTML, formatHebrewDate, formatGregorianDate } from '@/lib/utils'
export default function ContentRenderer({item}:{item:ContentItem}){
  switch(item.contentType){
    case 'TEXT':          return <TextContent item={item}/>
    case 'IMAGE_GALLERY': return <GalleryContent item={item}/>
    case 'CLOCK':         return <ClockContent item={item}/>
    case 'DATE':          return <DateContent item={item}/>
    case 'WEATHER':       return <WeatherContent item={item}/>
    case 'ANNOUNCEMENT':  return <AnnouncementContent item={item}/>
    case 'BIRTHDAYS':     return <BirthdayContent item={item}/>
    case 'EVENTS':        return <EventContent item={item}/>
    case 'TIMETABLE':     return <TimetableContent item={item}/>
    case 'RSS_FEED':      return <RssContent item={item}/>
    case 'VIDEO':         return <VideoContent item={item}/>
    default: return <div className="w-full h-full flex items-center justify-center text-white/30 text-sm">{item.contentType}</div>
  }
}
// One header component for every panel; dimensions follow the screen container.
function SectionHeading({children,aside}:{children:React.ReactNode;aside?:React.ReactNode}){
  return <header className="tv-section-heading" dir="rtl">
    <h2 className="tv-section-heading-label">{children}</h2>
    {aside&&<span className="tv-section-heading-aside" dir="ltr">{aside}</span>}
  </header>
}
function TextContent({item}:{item:ContentItem}){
  const h=useMemo(()=>sanitizeHTML(item.textContent??''),[item.textContent])
  return <div className="tv-text-content w-full h-full flex items-center justify-center p-6 text-center" style={{background:item.bgColor??'transparent',color:item.textColor??'#ffffff',fontSize:item.fontSize??24,fontWeight:500,lineHeight:1.4}}><div className="tv-text-body" dangerouslySetInnerHTML={{__html:h}}/></div>
}
function GalleryContent({item}:{item:ContentItem}){
  const s=(item.settings??{}) as Partial<GallerySettings>
  type Photo={id:string;url:string;caption:string|null;originalName?:string;uploadedAt?:string;galleryId?:string|null;mimeType?:string}
  const [images,setImages]=useState<Photo[]>([])
  const [index,setIndex]=useState(0)
  const completedVideos=useRef<Set<string>>(new Set())
  const [dimensions,setDimensions]=useState({width:900,height:600})
  const host=useRef<HTMLDivElement>(null)
  const folders=JSON.stringify(s.folderIds??[])
  const ids=JSON.stringify(s.imageIds??[])
  const mode=s.displayMode??'slideshow'
  const dur=Math.max(2,item.slideDuration||8)*1000
  useEffect(()=>{
    let alive=true
    async function load(){
      try{
        // The public endpoint only exposes images used by active public screens.
        const r=await fetch(`/api/public/gallery/${encodeURIComponent(item.id)}`,{cache:'no-store'})
        if(!r.ok)return
        const d=await r.json()
        const all:Photo[]=d.data??[]
        const chosen=(s.folderIds??[]).length?all.filter(f=>(s.folderIds??[]).includes(f.galleryId??'')):(s.imageIds??[]).length?(s.imageIds??[]).map(id=>all.find(f=>f.id===id)).filter(Boolean) as Photo[]:all
        if(!alive)return
        const ordered=[...chosen]
        const order=s.imageOrder??'random'
        if(order==='random'){
          for(let i=ordered.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[ordered[i],ordered[j]]=[ordered[j],ordered[i]]}
        }else if(order==='name')ordered.sort((a,b)=>(a.originalName??'').localeCompare(b.originalName??'','he'))
        else ordered.sort((a,b)=>{const v=(new Date(b.uploadedAt??0).getTime()-new Date(a.uploadedAt??0).getTime());return order==='newest'?v:-v})
        setImages(ordered);setIndex(0)
      }catch{}
    }
    load();const timer=setInterval(load,60000)
    return()=>{alive=false;clearInterval(timer)}
  },[item.id,item.galleryId,folders,ids,s.imageOrder])
  useEffect(()=>{
    const el=host.current;if(!el)return
    const ro=new ResizeObserver(([entry])=>{if(entry)setDimensions({width:entry.contentRect.width,height:entry.contentRect.height})})
    ro.observe(el);return()=>ro.disconnect()
  },[])
  const preferredCount=s.mosaicCount??6
  const count=mode==='slideshow'?1:dimensions.width<360?Math.min(2,preferredCount):dimensions.width<760?Math.min(4,preferredCount):preferredCount
  const pageSize=Math.min(count,Math.max(1,images.length))
  const isVideo=(f:Photo)=>f.mimeType?.startsWith('video/')||/\.(mp4|webm)(?:\?|$)/i.test(f.url)
  const shownNow=Array.from({length:pageSize},(_,j)=>images[(index+j)%images.length]).filter(Boolean)
  const hasVideo=shownNow.some(isVideo)
  const nextPage=()=>{completedVideos.current.clear();setIndex(i=>(i+pageSize)%images.length)}
  const finishVideo=(id:string)=>{completedVideos.current.add(id);if(shownNow.filter(isVideo).every(f=>completedVideos.current.has(f.id)))nextPage()}
  useEffect(()=>{
    if(!images.length)return
    // A failed/stalled video must not block the gallery indefinitely.
    const timeout=hasVideo?Math.max(120000,dur*4):dur
    const t=setTimeout(nextPage,timeout)
    return()=>clearTimeout(t)
  },[images.length,pageSize,dur,index,hasVideo])
  if(s.showGallery===false)return <div className="w-full h-full" aria-label="הגלריה מוסתרת" />
  const heading=s.showSectionTitle!==false ? (s.sectionTitle??'גלריית תמונות').trim() : ''
  const shown=Array.from({length:pageSize},(_,j)=>images[(index+j)%images.length]).filter(Boolean)
  // For mosaic/collage, fill each tile by default; slideshows preserve the full image.
  const fit=s.imageFit??(mode==='slideshow'?'contain':'cover')
  const columns=mode==='slideshow'?1:mode==='collage'?(pageSize>2?3:2):pageSize<=2?1:pageSize<=4?2:3
  return <div className="tv-gallery flex flex-col w-full h-full min-h-0 overflow-hidden" dir="rtl" style={{background:'var(--tv-panel, #172c48)',color:'var(--tv-ink, #ffffff)'}}>
    {heading&&<SectionHeading>{heading}</SectionHeading>}
    <div ref={host} className="relative flex-1 min-h-0 overflow-hidden" style={{background:'var(--tv-base, #081323)'}}>
      {!images.length?<div className="w-full h-full flex items-center justify-center opacity-50 flex-col gap-2"><span style={{fontSize:32}}>🖼</span><span className="text-sm">אין פריטים בגלריה</span></div>:
      <div key={index} className="w-full h-full grid" style={{gridTemplateColumns:`repeat(${columns},minmax(0,1fr))`,gridAutoRows:'minmax(0,1fr)',gap:mode==='slideshow'?0:4,animation:item.transitionStyle==='instant'?undefined:'galleryV16Fade .55s ease-out'}}>
        {shown.map((img,i)=><div key={`${img.id}-${i}`} className="relative min-w-0 min-h-0 overflow-hidden" style={{gridColumn:mode==='collage'&&shown.length>2&&i===0?'span 2':undefined,gridRow:mode==='collage'&&shown.length>2&&i===0?'span 2':undefined}}>
          {!isVideo(img)&&fit==='contain'&&<img src={img.url} alt='' aria-hidden='true' className='absolute inset-0 w-full h-full object-cover blur-xl opacity-25 scale-110'/>}
          {isVideo(img)?<video key={img.id} src={img.url} autoPlay muted playsInline preload='metadata' className={`relative w-full h-full ${fit==='cover'?'object-cover':'object-contain'} bg-black`} onEnded={()=>finishVideo(img.id)} onError={()=>finishVideo(img.id)}/>:<img src={img.url} alt={img.caption??''} className={`relative w-full h-full ${fit==='cover'?'object-cover':'object-contain'}`}/>}
          {s.showCaptions!==false&&img.caption&&<div className="absolute bottom-0 inset-x-0 p-2 bg-black/50 text-white text-center text-sm">{img.caption}</div>}
        </div>)}
      </div>}
    </div>
  </div>
}
function ClockContent({item}:{item:ContentItem}){
  const s=(item.settings??{}) as Partial<ClockSettings>
  const fmt=s.hourFormat??'24',secs=s.showSeconds??false
  const [time,setTime]=useState<Date|null>(null)
  useEffect(()=>{setTime(new Date());const t=setInterval(()=>setTime(new Date()),1000);return()=>clearInterval(t)},[])
  if(!time)return null
  let d:string
  if(fmt==='12'){const h=time.getHours()%12||12,ap=time.getHours()>=12?'PM':'AM',m=time.getMinutes().toString().padStart(2,'0'),s2=time.getSeconds().toString().padStart(2,'0');d=`${h}:${m}${secs?`:${s2}`:''}${ap}`}
  else{const h=time.getHours().toString().padStart(2,'0'),m=time.getMinutes().toString().padStart(2,'0'),s2=time.getSeconds().toString().padStart(2,'0');d=`${h}:${m}${secs?`:${s2}`:''}`}
  return <div className="w-full h-full flex items-center justify-center"><div className="text-white font-light tabular-nums" style={{fontSize:'clamp(40px,8vw,120px)',letterSpacing:'-0.02em'}}>{d}</div></div>
}
function DateContent({item}:{item:ContentItem}){
  const s=(item.settings??{}) as Partial<DateSettings>
  const fmt=s.dateFormat??'full',loc=s.locale??'he'
  const [now,setNow]=useState<Date|null>(null)
  useEffect(()=>{setNow(new Date());const t=setInterval(()=>setNow(new Date()),60000);return()=>clearInterval(t)},[])
  if(!now)return null
  const l=loc==='he'?'he-IL':'en-US'
  let d=''
  if(fmt==='full')d=now.toLocaleDateString(l,{weekday:'long',year:'numeric',month:'long',day:'numeric'})
  else if(fmt==='short')d=now.toLocaleDateString(l)
  else if(fmt==='daymonth')d=now.toLocaleDateString(l,{day:'numeric',month:'long'})
  else d=formatGregorianDate(now)
  return <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-white"><div style={{fontSize:'clamp(18px,2.5vw,36px)'}}>{d}</div><div className="text-white/50" style={{fontSize:'clamp(14px,2vw,28px)'}}>{formatHebrewDate(now)}</div></div>
}
function WeatherContent({item}:{item:ContentItem}){
  const s=(item.settings??{}) as Record<string,string>
  const dm=s.displayMode??'full'
  return <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-white">
    <div style={{fontSize:64}}>🌤</div>
    <div style={{fontSize:'clamp(28px,5vw,72px)',fontWeight:300}}>24°{(item.weatherUnits??'metric')==='metric'?'C':'F'}</div>
    {dm!=='minimal'&&item.weatherCity&&<div className="text-white/60" style={{fontSize:'clamp(12px,1.5vw,18px)'}}>{item.weatherCity}</div>}
    {dm==='full'&&<div className="text-white/40" style={{fontSize:'clamp(10px,1.2vw,14px)'}}>שמיים מעוננים חלקית</div>}
  </div>
}
function AnnouncementContent({item}:{item:ContentItem}){
  const s=(item.settings??{}) as Partial<AnnouncementContentSettings>
  const [remoteItems,setRemoteItems]=useState<SingleAnnouncement[]>([])
  const selectedIds=s.selectedAnnouncementIds??[]
  useEffect(()=>{
    if(!selectedIds.length){setRemoteItems([]);return}
    let alive=true
    const load=()=>fetch(`/api/public/announcements/${item.id}`,{cache:'no-store'}).then(r=>r.ok?r.json():{data:[]}).then(d=>{if(alive)setRemoteItems(d.data??[])}).catch(()=>{if(alive)setRemoteItems([])})
    void load()
    const timer=setInterval(load,60000)
    return()=>{alive=false;clearInterval(timer)}
  },[item.id,selectedIds.join(',')])
  const items:SingleAnnouncement[]=selectedIds.length?remoteItems:[]
  const rot=Math.max(3,s.rotationSecs??10)
  const [idx,setIdx]=useState(0)
  const [cycle,setCycle]=useState(0)
  const viewportRef=useRef<HTMLDivElement>(null)
  const textRef=useRef<HTMLDivElement>(null)
  const [scroll,setScroll]=useState({distance:0,duration:0,started:false})
  const [box,setBox]=useState({width:580,height:600})
  const host=useRef<HTMLDivElement>(null)
  useEffect(()=>{
    if(!host.current)return
    const observer=new ResizeObserver(([entry])=>{
      if(entry)setBox({width:entry.contentRect.width,height:entry.contentRect.height})
    })
    observer.observe(host.current)
    return()=>observer.disconnect()
  },[])
  const cur=items.length?items[Math.min(idx,items.length-1)]:null
  const title=cur?.title??s.title??''
  const body=cur?.body??item.textContent??''
  const icon=cur?.icon??s.icon??''
  const priority=cur?.priority??s.priority
  // Standard announcements inherit the active screen theme. Priority notices retain
  // their warning colors; an explicitly chosen custom color is still respected.
  const savedBg=(item.bgColor??'').trim().toLowerCase()
  const legacyDefaults=['#000000','#000','#1e3a5f','#172c48','#0b1b34','#091728','#152b44','black','transparent']
  const customBg=savedBg&&!legacyDefaults.includes(savedBg)?item.bgColor:undefined
  const bg=priority==='urgent'?'#b91c1c':priority==='warning'?'#b45309':(customBg??'var(--tv-panel, #172c48)')
  const ink=(priority==='urgent'||priority==='warning')?'#ffffff':(customBg?(item.textColor??'#ffffff'):'var(--tv-ink, #edf5ff)')
  // Sizes depend on the actual panel, not the browser viewport. The same
  // sizes are used on every page of an announcement.
  const unit=Math.min(box.width/580,box.height/600)
  const titleSize=Math.max(18,Math.min(48,Math.round(42*unit)))
  const iconSize=Math.max(24,Math.min(54,Math.round(48*unit)))
  const bodySize=Math.max(14,Math.min(30,Math.round(27*unit)))
  const showSectionTitle=s.showSectionTitle ?? true
  const sectionTitle=s.sectionTitle ?? 'הודעות כלליות'
  const headingHeight=showSectionTitle && sectionTitle.trim()?box.height*0.09:0
  const padding=Math.max(12,Math.min(32,Math.round(26*unit)))
  const dotsHeight=items.length>1||body.length>0?30:0
  const bodyHeight=Math.max(40,box.height-headingHeight-2*padding-(icon?iconSize+12:0)-(title?titleSize*2.5+12:0)-dotsHeight)
  // Measure the actual visible body area. Avoid scrolling for subpixel/rounding overflow.
  // Keep the measurement independent of the animation so it cannot restart mid-scroll.
  const [overflow,setOverflow]=useState(0)
  useLayoutEffect(()=>{
    const viewport=viewportRef.current
    const text=textRef.current
    if(!viewport||!text){setOverflow(0);return}
    const measure=()=>{
      const extra=Math.max(0,text.scrollHeight-viewport.clientHeight)
      setOverflow(previous=>{
        const next=extra>4?Math.ceil(extra):0
        return previous===next?previous:next
      })
    }
    measure()
    const observer=new ResizeObserver(measure)
    observer.observe(viewport)
    observer.observe(text)
    return()=>observer.disconnect()
  },[idx,body,bodySize,box.width,box.height,bodyHeight])
  useEffect(()=>{
    const distance=overflow
    const duration=distance>0?distance/15:0
    setScroll({distance,duration,started:false})
    // Start only when there is real overflow, after a 4-second reading pause.
    const start=distance>0?window.setTimeout(()=>setScroll({distance,duration,started:true}),4000):undefined
    const totalMs=distance>0?4000+duration*1000+4000:Math.max(rot*1000,3500)
    const next=window.setTimeout(()=>{
      if(items.length>1)setIdx(current=>(current+1)%items.length)
      else setCycle(v=>v+1)
    },totalMs)
    return()=>{
      if(start!==undefined)window.clearTimeout(start)
      window.clearTimeout(next)
    }
  },[idx,body,overflow,items.length,rot,cycle])
  return <div ref={host} className="tv-announcement relative w-full h-full min-h-0 overflow-hidden flex flex-col items-center justify-center text-center" dir="rtl" style={{background:bg,color:ink,padding}}>
    {headingHeight>0&&<div className="absolute top-0 inset-x-0 z-10"><SectionHeading>{sectionTitle}</SectionHeading></div>}
    <div className="w-full min-h-0 flex flex-col items-center" style={{height:'100%',paddingTop:headingHeight,paddingBottom:dotsHeight}}>
      {icon&&<div className="shrink-0" style={{fontSize:iconSize,lineHeight:1.1,marginBottom:12*unit}}>{icon}</div>}
      {title&&<div className="shrink-0 font-bold" style={{fontSize:titleSize,lineHeight:1.2,marginBottom:12*unit,overflowWrap:'anywhere'}}>{title}</div>}
      {body&&<div ref={viewportRef} className="w-full min-h-0 flex-1 overflow-hidden" style={{maxHeight:bodyHeight}}>
        <div ref={textRef} style={{fontSize:bodySize,lineHeight:1.45,whiteSpace:'pre-wrap',overflowWrap:'anywhere',opacity:.9,transform:`translateY(-${scroll.started?scroll.distance:0}px)`,transition:scroll.started&&scroll.distance>0?`transform ${scroll.duration}s linear`:'none'}} dangerouslySetInnerHTML={{__html:cleanAnnouncementHtml(body)}} />
      </div>}
    </div>
    {items.length>1&&<div className="absolute inset-x-0 bottom-3 flex justify-center items-center gap-1.5" aria-label={`הודעה ${idx+1} מתוך ${items.length}`}>
      {items.map((_,i)=><span key={i} className="rounded-full" style={{width:i===idx?16:6,height:6,background:i===idx?'currentColor':'color-mix(in srgb, currentColor 35%, transparent)'}}/>)}
    </div>}
  </div>
}
function BirthdayContent({item}:{item:ContentItem}){
  const s=(item.settings??{}) as Partial<BirthdaySettings>
  return <div className="tv-birthday w-full h-full flex flex-col items-center justify-center text-center p-8" style={{color:'var(--tv-panel-ink, #edf5ff)'}}>
    <div className="tv-birthday-icon" style={{fontSize:64,marginBottom:16}}>🎂</div>
    <div style={{fontSize:'clamp(24px,4vw,56px)',fontWeight:700}}>{s.personName||'שם'}</div>
    {s.grade&&<div style={{fontSize:'clamp(14px,2vw,24px)',opacity:0.7,marginTop:8}}>{s.grade}</div>}
    <div style={{fontSize:'clamp(14px,2vw,28px)',marginTop:20,opacity:0.9}}>{s.greetingText||'יום הולדת שמח! 🎉'}</div>
  </div>
}
function EventContent({item}:{item:ContentItem}){
  const s=(item.settings??{}) as Partial<EventSettings>
  const ds=s.eventDate?new Date(s.eventDate).toLocaleDateString('he-IL',{weekday:'long',day:'numeric',month:'long'}):''
  return <div className="tv-event w-full h-full flex flex-col items-center justify-center p-8">
    <div style={{fontSize:48,marginBottom:16}}>🗓</div>
    <div style={{fontSize:'clamp(22px,3.5vw,48px)',fontWeight:700,textAlign:'center',lineHeight:1.3}}>{s.eventTitle||'שם האירוע'}</div>
    <div className="flex flex-wrap justify-center gap-4 mt-4" style={{fontSize:'clamp(12px,1.8vw,22px)',opacity:0.75}}>
      {ds&&<span>📅 {ds}</span>}{s.eventTime&&<span>🕐 {s.eventTime}</span>}{s.location&&<span>📍 {s.location}</span>}
    </div>
    {s.description&&<div style={{fontSize:'clamp(12px,1.5vw,18px)',opacity:0.6,marginTop:12,textAlign:'center',lineHeight:1.6}}>{s.description}</div>}
  </div>
}
type ChangeKind = 'cancel'|'substitute'|'room'|'exam'|'general'
function parseChange(raw:string){
  const parts=raw.split('|').map(p=>p.trim()).filter(Boolean)
  const kind:ChangeKind=/מבוטל|ביטול/.test(raw)?'cancel':/ממלא|מחליפ|מילוי מקום/.test(raw)?'substitute':/חדר|הועבר|מעבר/.test(raw)?'room':/מבחן|בוחן/.test(raw)?'exam':'general'
  const styles:Record<ChangeKind,{label:string;accent:string;surface:string}>={
    cancel:{label:'ביטול',accent:'#f9a8d4',surface:'#47283e'},
    substitute:{label:'מילוי מקום',accent:'#fde047',surface:'#463c24'},
    room:{label:'שינוי חדר',accent:'#67e8f9',surface:'#203f4e'},
    exam:{label:'מבחן',accent:'#c4b5fd',surface:'#353151'},
    general:{label:'עדכון',accent:'#93c5fd',surface:'#253d58'}
  }
  return {raw,parts,kind,...styles[kind]}
}
function TimetableContent({item}:{item:ContentItem}){
  const s=(item.settings??{}) as Partial<TimetableSettings>
  if(s.displayMode==='webtop-list'||s.displayMode==='webtop-grid')return <WebtopTimetable item={item} settings={s}/>
  return <ManualTimetableContent item={item}/>
}
function ManualTimetableContent({item}:{item:ContentItem}){
  const s=(item.settings??{}) as Partial<TimetableSettings>
  const longMode=s.displayMode==='long'
  const lines=useMemo(()=>[...(s.menuText??'').split(/\r?\n/),...(s.items??[])].flatMap(x=>x.split(/\r?\n/)).map(x=>x.trim()).filter(Boolean),[s.menuText,JSON.stringify(s.items??[])])
  const [page,setPage]=useState(0)
  const [dimensions,setDimensions]=useState({width:580,height:600})
  const container=useRef<HTMLDivElement>(null)
  useEffect(()=>{
    if(!container.current)return
    const el=container.current
    const observer=new ResizeObserver(entries=>{
      const r=entries[0]?.contentRect
      if(r)setDimensions({width:r.width,height:r.height})
    })
    observer.observe(el)
    return()=>observer.disconnect()
  },[longMode])
  const small=dimensions.width<430
  // Five messages per page, in their original order.
  // Keep pagination deterministic across screen sizes.
  const pages=useMemo(()=>{
    const result:string[][]=[]
    for(let i=0;i<lines.length;i+=5) result.push(lines.slice(i,i+5))
    return result.length?result:[[]]
  },[lines])
  useEffect(()=>setPage(0),[lines,pages.length])
  useEffect(()=>{
    if(!longMode||pages.length<=1)return
    const timer=setInterval(()=>setPage(p=>(p+1)%pages.length),Math.max(5,Math.min(120,s.pageSeconds??12))*1000)
    return()=>clearInterval(timer)
  },[longMode,pages.length,s.pageSeconds])
if(longMode)return <div ref={container} className="w-full h-full flex flex-col overflow-hidden" dir="rtl" style={{background:'var(--tv-panel, #172c48)',color:'var(--tv-ink, #edf5ff)'}}>    <SectionHeading aside={<>{page+1} / {pages.length}</>}>📋 {s.title||'שינויי מערכת שעות'}</SectionHeading>
    <div className="flex-1 min-h-0 overflow-y-auto flex flex-col justify-start gap-1 p-2">
      {pages[Math.min(page,pages.length-1)].map((line,i)=>{
        const c=parseChange(line)
        const structured=c.parts.length>=3
        return <article key={`${page}-${i}`} className="rounded-lg border-r-[3px] px-3 py-1 shadow-sm shrink-0" style={{borderColor:c.accent,background:'rgba(255,255,255,.09)'}}>
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="rounded-md px-2 py-0.5 font-semibold" style={{background:c.surface,color:c.accent,fontSize:small?11:12}}>{c.label}</span>
            {structured&&<strong style={{fontSize:small?14:16}}>{c.parts[0]}</strong>}
            {structured&&<span className="text-slate-300" style={{fontSize:small?11:13}}>{c.parts[1]}</span>}
          </div>
          <p className="leading-snug" style={{fontSize:small?'clamp(12px,1vw,15px)':'clamp(13px,1.05vw,17px)',overflowWrap:'anywhere',display:'-webkit-box',WebkitBoxOrient:'vertical',WebkitLineClamp:undefined,overflowY:'visible'}}>{structured?c.parts.slice(2).join(' | '):line}</p>
        </article>
      })}
      {lines.length===0&&<div className="flex-1 grid place-items-center text-white/50">אין שינויי מערכת להצגה</div>}
    </div>
    {pages.length>1&&<footer className="flex items-center justify-center gap-1.5 py-2 shrink-0" aria-label={`עמוד ${page+1} מתוך ${pages.length}`}>
      {pages.length<=12?pages.map((_,i)=><span key={i} className="rounded-full" style={{width:i===page?20:6,height:6,background:i===page?'#67e8f9':'#64748b'}}/>):<span className="text-xs text-slate-300">המשך העדכונים בעוד {s.pageSeconds??12} שניות</span>}
    </footer>}
  </div>
  return <div className="w-full h-full flex flex-col p-6 overflow-hidden">
    {s.title&&<div style={{fontSize:'clamp(18px,2.5vw,32px)',fontWeight:700,marginBottom:16}}>{s.title}</div>}
    {s.menuText&&<div style={{fontSize:'clamp(13px,1.6vw,20px)',opacity:0.8,lineHeight:1.8,whiteSpace:'pre-line',marginBottom:12}}>{s.menuText}</div>}
    {(s.items??[]).length>0&&<ul className="space-y-2">{(s.items??[]).map((it,i)=><li key={i} className="flex items-start gap-2" style={{fontSize:'clamp(12px,1.5vw,18px)'}}><span style={{color:'#60a5fa',flexShrink:0}}>•</span><span style={{opacity:0.85}}>{it}</span></li>)}</ul>}
  </div>
}
function RssContent({item}:{item:ContentItem}){
  const s=(item.settings??{}) as Partial<RssSettings>
  const style=s.displayStyle??'list', ref=s.refreshInterval??15
  const [feed,setFeed]=useState<RssFeedItem[]>([])
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState(false)
  const viewportRef=useRef<HTMLDivElement>(null)
  const trackRef=useRef<HTMLDivElement>(null)
  const [motion,setMotion]=useState({distance:0,duration:90})
  const fetchFeed=useCallback(async()=>{
    if(!item.rssUrl)return
    setLoading(true);setError(false)
    try{
      const r=await fetch(`/api/rss?url=${encodeURIComponent(item.rssUrl)}&max=100`)
      const d=await r.json()
      if(r.ok)setFeed(d.items??[]);else setError(true)
    }catch{setError(true)}finally{setLoading(false)}
  },[item.rssUrl])
  useEffect(()=>{void fetchFeed();const t=setInterval(fetchFeed,Math.max(5,ref)*60000);return()=>clearInterval(t)},[fetchFeed,ref])
  useEffect(()=>{
    if(style==='ticker'||!feed.length)return
    const measure=()=>{
      const view=viewportRef.current,track=trackRef.current
      if(!view||!track)return
      const distance=view.clientHeight+track.scrollHeight
      setMotion({distance,duration:Math.max(15,distance/22)}) // 22 pixels per second
    }
    measure()
    const ro=new ResizeObserver(measure)
    if(viewportRef.current)ro.observe(viewportRef.current)
    if(trackRef.current)ro.observe(trackRef.current)
    return()=>ro.disconnect()
  },[feed,style])
  if(!item.rssUrl)return <div className="w-full h-full flex items-center justify-center text-white/30">כתובת RSS לא הוגדרה</div>
  if(loading&&feed.length===0)return <div className="w-full h-full grid place-items-center text-white/40">טוען נתונים...</div>
  if(error&&feed.length===0)return <div className="w-full h-full grid place-items-center text-white/40">שגיאה בטעינת ה-Feed</div>
  if(style==='ticker')return <div className="w-full h-full flex items-center px-4 overflow-hidden"><div className="ticker-wrap flex-1"><span className="ticker-text text-white" style={{fontSize:'clamp(16px,2.5vw,28px)'}}>{feed.map(i=>i.title).join('   •   ')}</span></div></div>
  return <div ref={viewportRef} className="w-full h-full overflow-hidden" dir="rtl" style={{color:'var(--tv-panel-ink, #edf5ff)',position:'relative'}}>
    <div ref={trackRef} className="tv-rss-vertical-track p-6" style={{'--rss-vertical-distance':`${motion.distance}px`,animationDuration:`${motion.duration}s`} as React.CSSProperties}>
      {feed.map((fi,i)=><div key={i} className="flex items-start gap-3 py-3" style={{borderBottom:'1px solid rgba(255,255,255,.12)'}}>
        <span style={{color:'#60a5fa',flexShrink:0,marginTop:3}}>•</span>
        <div><div style={{fontSize:'clamp(13px,1.6vw,20px)',fontWeight:500,lineHeight:1.4}}>{fi.title}</div>
          {fi.description&&<div style={{fontSize:'clamp(11px,1.2vw,15px)',opacity:0.6,marginTop:4,lineHeight:1.4}}>{fi.description}</div>}</div>
      </div>)}
    </div>
  </div>
}
function VideoContent({item}:{item:ContentItem}){
  const [error,setError]=useState(false)
  if(!item.videoUrl)return <div className="w-full h-full flex items-center justify-center text-white/20 flex-col gap-2"><span style={{fontSize:40}}>🎬</span><span className="text-sm">כתובת וידאו לא הוגדרה</span></div>
  if(error)return <div className="w-full h-full flex items-center justify-center text-white/30 flex-col gap-2"><span style={{fontSize:40}}>⚠️</span><span className="text-sm">שגיאה בטעינת הוידאו</span></div>
  const yt=youtubeId(item.videoUrl)
  if(yt)return <iframe key={yt} src={`https://www.youtube-nocookie.com/embed/${yt}?autoplay=1&mute=${item.videoMuted===false?0:1}&loop=${item.videoLoop===false?0:1}&playlist=${yt}&controls=0&playsinline=1`} title='YouTube video' allow='autoplay; encrypted-media; picture-in-picture' referrerPolicy='strict-origin-when-cross-origin' className='w-full h-full border-0 bg-black' allowFullScreen />
  return <video key={item.videoUrl} src={item.videoUrl} autoPlay loop={item.videoLoop??true} muted={item.videoMuted??true} playsInline controls={false} className="w-full h-full object-contain bg-black" onError={()=>setError(true)}/>
}
