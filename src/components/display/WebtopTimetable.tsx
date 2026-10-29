'use client'
import { useEffect,useMemo,useRef,useState } from 'react'
import type { ContentItem,TimetableSettings } from '@/types'

type Change={id?:number;changeType?:number|null;type?:string|null;definition?:string|null;content?:string|null;note?:string|null;room?:string|null;privateName?:string|null;lastName?:string|null;group?:string|null;hour?:number|null;original_hour?:number|null;hourName?:string|null;originalHourName?:string|null;fillUpType?:string|null;isClassCancel?:boolean|null;isRoomChange?:boolean|null;isFillUp?:boolean|null}
type Lesson={lesson?:{subject?:string;teacherPrivateName?:string;teacherLastName?:string;room?:string|null};changes?:Change[]}
type Hour={hour?:{hour?:number;fromTime?:string;toTime?:string};scheduale?:Lesson[];changes?:Change[];exams?:unknown[];events?:unknown[];messages?:unknown[]}
type SchoolClass={classCode:number;classNum:number;classTitle?:string|null;hours:Hour[]}
type Data={grades:Record<string,{classes:SchoolClass[];generalMessages?:unknown[]}>;institutionCode:number}
type ClassRow={key:string;name:string;grade:number;num:number;hours:Hour[]}
const letters:Record<number,string>={7:'ז',8:'ח',9:'ט',10:'י',11:'יא',12:'יב'}
// Each grade is displayed separately, in both grid and list modes.
function gradeLabel(grade:number){return `${letters[grade]??grade}׳`}
// The same Webtop change is often present in both hour.changes and lesson.changes.
// Its meaning depends on the cell: a moved lesson is cancelled in its original hour.
function changes(h:Hour){
  const all=[...(h.changes??[]),...(h.scheduale??[]).flatMap(l=>l.changes??[])]
  const seen=new Set<string>()
  return all.filter(c=>{const key=c.id!=null?`id:${c.id}`:JSON.stringify(c);if(seen.has(key))return false;seen.add(key);return true})
}
function isFillUp(c:Change){
  // changeType=3 is used by Webtop for lesson cancellations as well.
  // Explicit cancellation markers always take precedence over substitution.
  if(isGroupMerge(c)||c.fillUpType?.toLowerCase()==='cancel'||c.isClassCancel===true||/ביטול שיעור/.test(c.content??''))return false
  return c.isFillUp===true||c.fillUpType?.toLowerCase()==='fillup'||/מילוי מקום|מחליפ/.test(`${c.type??''} ${c.definition??''} ${c.content??''}`)
}
function isGroupMerge(c:Change){return /מיזוג\s*קבוצה/.test(`${c.type??''} ${c.definition??''} ${c.content??''} ${c.note??''}`)}
function moved(c:Change){return c.fillUpType?.toLowerCase()==='movelesson'||(c.original_hour!=null&&c.hour!=null&&c.original_hour!==c.hour)}
function isCancelledHere(c:Change,cellHour:number){
  if(moved(c)&&c.original_hour!=null&&c.hour!=null)return cellHour===c.original_hour&&cellHour!==c.hour
  return c.fillUpType?.toLowerCase()==='cancel'||!!c.isClassCancel||/ביטול/.test(`${c.type??''} ${c.definition??''} ${c.content??''}`)
}
function description(c:Change,cellHour:number){
  const original=c.original_hour, destination=c.hour
  const extras=[c.note,c.group,c.privateName&&c.lastName?`${c.privateName} ${c.lastName}`:null,c.room?`חדר ${c.room}`:null].filter(Boolean)
  if(moved(c)&&original!=null&&destination!=null){
    const cancelled=isCancelledHere(c,cellHour)
    const title=cancelled?'שיעור בוטל':`שיעור הועבר`
    const detail=cancelled?`הועבר לשיעור ${destination}`:`משיעור ${original} לשיעור ${destination}`
    return [title,detail,...extras].join(' · ')
  }
  return [isGroupMerge(c)?'מיזוג קבוצה':isCancelledHere(c,cellHour)?'ביטול שיעור':isFillUp(c)?'מילוי מקום':(c.type||c.definition||c.content||'שינוי'),...extras].join(' · ')
}
// Webtop returns structured event/exam objects; render selected human-readable fields only.
function detailLines(value:unknown,kind:'event'|'exam'|'message'):string[]{
  if(typeof value==='string')return value.trim()?[value.trim()]:[]
  if(!value||typeof value!=='object'||Array.isArray(value))return []
  const v=value as Record<string,unknown>
  const field=(...keys:string[])=>{for(const k of keys){const x=v[k];if(typeof x==='string'&&x.trim())return x.trim();if(typeof x==='number'&&k!=='id')return String(x)}return ''}
  const title=field('title','name','content','text','message','description')
  const type=field('textualType')
  const note=field('note')
  const rooms=field('rooms','room')
  const people=kind==='event'?field('accompaniers'):kind==='exam'?field('supervisors'):''
  const from=v.from_hour,to=v.to_hour
  const range=typeof from==='number'&&from>0?`שעה ${from}${typeof to==='number'&&to>from?`–${to}`:''}`:''
  const main=[type,title].filter(Boolean).join(' · ')
  const extra=[range,rooms?`חדר: ${rooms}`:'',people?`מלווים: ${people}`:'',note].filter(Boolean)
  return main||extra.length?[main,...extra].filter(Boolean):[]
}
function shownPageKey(pages:ClassRow[][],page:number){return (pages[Math.min(page,pages.length-1)]??[]).map(c=>c.key).join(',')}
function accent(c:Change,cellHour:number){if(isGroupMerge(c))return '#fbbf24';if(isCancelledHere(c,cellHour))return '#fb7185';if(isFillUp(c))return '#fde68a';if(moved(c))return '#c4b5fd';const t=`${c.type??''} ${c.definition??''}`;return c.isRoomChange||/חדר/.test(t)?'#67e8f9':/פינוי/.test(t)?'#fde68a':'#c4b5fd'}
export default function WebtopTimetable({item,settings}:{item:ContentItem;settings:Partial<TimetableSettings>}){
  const [data,setData]=useState<Data|null>(null)
  const [error,setError]=useState('')
  const [stale,setStale]=useState(false)
  const [updated,setUpdated]=useState('')
  const [page,setPage]=useState(0)
  const [width,setWidth]=useState(800)
  const host=useRef<HTMLDivElement>(null)
  const gridScroll=useRef<HTMLDivElement>(null)
  const [overflow,setOverflow]=useState(false)
  const refresh=Math.max(30,Math.min(600,settings.refreshSeconds??60))*1000
  useEffect(()=>{
    let alive=true
    async function load(){try{
      const r=await fetch(`/api/public/webtop/${encodeURIComponent(item.id)}`,{cache:'no-store'})
      const j=await r.json()
      if(!r.ok)throw new Error(j.error||`HTTP ${r.status}`)
      if(alive){setData(j.data);setError('');setStale(!!j.stale);setUpdated(j.updatedAt||'')}
    }catch(e){if(alive)setError(e instanceof Error?e.message:'שגיאת חיבור')}}
    void load();const t=setInterval(load,refresh)
    return()=>{alive=false;clearInterval(t)}
  },[item.id,refresh])
  useEffect(()=>{const el=host.current;if(!el)return;const ro=new ResizeObserver(entries=>setWidth(entries[0]?.contentRect.width??800));ro.observe(el);return()=>ro.disconnect()},[])
  const classes=useMemo(()=>Object.entries(data?.grades??{}).flatMap(([grade,v])=>(v.classes??[]).map(c=>({key:`${grade}-${c.classNum}`,name:`${letters[Number(grade)]??grade}׳${c.classNum}`,grade:Number(grade),num:c.classNum,hours:c.hours??[]}))).sort((a,b)=>a.grade-b.grade||a.num-b.num),[data])
  const isGrid=settings.displayMode==='webtop-grid'
  const showChanges=settings.showChanges!==false,showExams=settings.showExams!==false,showEvents=settings.showEvents!==false,showMessages=settings.showMessages!==false
  const inRange=(h:Hour)=>{const n=h.hour?.hour??0;return n>=0&&n<=(settings.hourTo??24)&&(n>=(settings.hourFrom??1)||n===0)}
  const autoColumns=Math.max(1,Math.floor(Math.max(0,width-64)/Math.max(90,settings.minColumnWidth??140)))
  const perPage=isGrid?(settings.columnsPerPage&&settings.columnsPerPage>0?Math.max(1,Math.min(20,settings.columnsPerPage)):autoColumns):Math.max(3,Math.floor(Math.max(250,width)/260))
  const gridPages=useMemo(()=>{const p:ClassRow[][]=[];for(const grade of [...new Set(classes.map(c=>c.grade))]){const group=classes.filter(c=>c.grade===grade);for(let i=0;i<group.length;i+=perPage)p.push(group.slice(i,i+perPage));}return p.length?p:[[]]},[classes,perPage])
  type Entry={key:string;name:string;grade:number;hour:number;kind:'change'|'exam'|'event'|'message';text:string;change?:Change;sharedClasses?:string[];event?:{id?:number|string;title:string;type:string;classes:string[];accompaniers:string[];from:number;to:number;date:string}}
  const parseNames=(value:unknown):string[]=>typeof value==='string'?value.split(',').map(v=>v.trim()).filter(Boolean):[]
  const entries=useMemo<Entry[]>(()=>classes.flatMap(c=>c.hours.filter(inRange).flatMap(h=>{
    const hour=h.hour?.hour??0, prefix=`${c.key}-${hour}`
    const make=(kind:Entry['kind'],values:unknown[])=>values.flatMap((value,i)=>{
      const lines=detailLines(value,kind==='exam'?'exam':kind==='event'?'event':'message')
      if(!lines.length)return []
      const v=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null
      const event=kind==='event'&&v?{
        id:typeof v.id==='number'||typeof v.id==='string'?v.id:undefined,
        title:typeof v.title==='string'?v.title.trim():'',
        type:typeof v.textualType==='string'?v.textualType.trim():'פעילות',
        classes:parseNames(v.classes),accompaniers:parseNames(v.accompaniers),
        from:typeof v.from_hour==='number'?v.from_hour:hour,
        to:typeof v.to_hour==='number'?v.to_hour:hour,
        date:typeof v.from_date==='string'?v.from_date:''
      }:undefined
      return [{key:`${prefix}-${kind}-${i}`,name:c.name,grade:c.grade,hour,kind,text:lines.join(' · '),event} as Entry]
    })
    return [...(showChanges?changes(h).map((ch,i)=>({key:`${prefix}-change-${i}`,name:c.name,grade:c.grade,hour,kind:'change' as const,text:description(ch,hour),change:ch})):[]),...(showExams?make('exam',h.exams??[]):[]),...(showEvents?make('event',h.events??[]):[]),...(showMessages?make('message',h.messages??[]):[])]
  })),[classes,showChanges,showExams,showEvents,showMessages,settings.hourFrom,settings.hourTo])
  // Event IDs are stable across hours and participating classes. Never use
  // accompaniers or rendered text as the identity of an event.
  // The grid deliberately remains class-specific.
  const listEntries=useMemo<Entry[]>(()=>{
    const grouped=new Map<string,{first:Entry;classes:Set<string>;accompaniers:Set<string>}>()
    const output:Entry[]=[]
    for(const entry of entries){
      if(entry.kind!=='event'||!entry.event){output.push(entry);continue}
      const ev=entry.event
      // Keep grade paging. A cross-grade event is shown once in each participating grade.
      const signature=ev.id!=null
        ?JSON.stringify([entry.grade,ev.date,ev.id])
        :JSON.stringify([entry.grade,ev.date,ev.title,ev.from,ev.to])
      let group=grouped.get(signature)
      if(!group){group={first:entry,classes:new Set(),accompaniers:new Set()};grouped.set(signature,group)}
      // Prefer explicit event.classes, but only the current grade belongs on this page.
      // The current class is a safe fallback when the API omits classes.
      const sameGrade=(name:string)=>{
        const normalized=name.replace(/\s+/g,'').replace(/[׳״']/g,'')
        const prefix=(letters[entry.grade]??String(entry.grade)).replace(/[׳״']/g,'')
        return normalized.startsWith(prefix)&&/\d/.test(normalized.slice(prefix.length))
      }
      const participants=ev.classes.filter(sameGrade)
      for(const name of participants.length?participants:[entry.name])group.classes.add(name.replace(/\s+/g,''))
      for(const name of ev.accompaniers)group.accompaniers.add(name)
    }
    for(const [signature,g] of grouped){
      const ev=g.first.event!
      const names=[...g.classes].sort((a,b)=>a.localeCompare(b,'he',{numeric:true}))
      const people=[...g.accompaniers].sort((a,b)=>a.localeCompare(b,'he'))
      const range=ev.to>ev.from?`שעות ${ev.from}–${ev.to}`:`שעה ${ev.from}`
      const shared=names.length>1
      const text=[`${ev.type||'פעילות'} · ${ev.title}`,range,
        shared?`כיתות משתתפות: ${names.join(', ')}`:'',
        people.length?`מלווים: ${people.join(', ')}`:''].filter(Boolean).join(' · ')
      output.push({...g.first,key:`event-${signature}`,name:shared?'פעילות משותפת':names[0]??g.first.name,hour:ev.from,text,sharedClasses:shared?names:undefined})
    }
    // Individual changes stay together by class/hour; shared activities always
    // follow all individual changes within their grade.
    const classNumber=(entry:Entry):number=>{
      const match=entry.name.match(/(\d+)\s*$/)
      return match?Number(match[1]):Number.MAX_SAFE_INTEGER
    }
    const isShared=(entry:Entry)=>entry.kind==='event'&&!!entry.sharedClasses?.length
    return output.sort((a,b)=>a.grade-b.grade
      ||Number(isShared(a))-Number(isShared(b))
      ||(isShared(a)&&isShared(b)
        ?a.hour-b.hour||a.text.localeCompare(b.text,'he')
        :classNumber(a)-classNumber(b)||a.hour-b.hour||a.name.localeCompare(b.name,'he',{numeric:true})))
  },[entries])
  const listPerPage=Math.max(3,Math.min(15,settings.linesPerPage??7))
  const listPages=useMemo(()=>{
    const p:Entry[][]=[]
    // Keep each grade on its own pages, preserving the grade order.
    for(const grade of [...new Set(classes.map(c=>c.grade))]){
      const group=listEntries.filter(e=>e.grade===grade)
      for(let i=0;i<group.length;i+=listPerPage)p.push(group.slice(i,i+listPerPage))
    }
    return p.length?p:[[]]
  },[listEntries,classes,listPerPage])
  const pages=isGrid?gridPages:listPages
  useEffect(()=>setPage(0),[isGrid,classes.length,perPage,listPerPage,entries.length])
  // Grid pages with long content scroll to the bottom before advancing to the next class group.
  useEffect(()=>{
    if(!isGrid){if(pages.length<=1)return;const t=setInterval(()=>setPage(p=>(p+1)%pages.length),Math.max(5,Math.min(120,settings.pageSeconds??12))*1000);return()=>clearInterval(t)}
    const el=gridScroll.current
    if(!el)return
    el.scrollTop=0
    const update=()=>setOverflow(el.scrollHeight>el.clientHeight+3)
    update()
    const observer=new ResizeObserver(update);observer.observe(el)
    const content=el.firstElementChild;if(content)observer.observe(content)
    let frame=0,prev=0,elapsed=0,bottomWait=0
    const dwell=Math.max(5,Math.min(120,settings.pageSeconds??12))*1000
    const speed=Math.max(5,Math.min(150,settings.scrollSpeed??35))
    const step=(now:number)=>{
      if(!prev)prev=now
      const delta=Math.min(100,now-prev);prev=now;elapsed+=delta
      const max=Math.max(0,el.scrollHeight-el.clientHeight)
      if(max>3){
        if(el.scrollTop<max-2){if(elapsed>(settings.scrollDelaySeconds??2)*1000)el.scrollTop=Math.min(max,el.scrollTop+speed*delta/1000)}
        else {bottomWait+=delta;if(bottomWait>Math.max(2500,dwell/3)){setPage(p=>(p+1)%pages.length);return}}
      }else if(elapsed>=dwell&&pages.length>1){setPage(p=>(p+1)%pages.length);return}
      frame=requestAnimationFrame(step)
    }
    frame=requestAnimationFrame(step)
    return()=>{cancelAnimationFrame(frame);observer.disconnect()}
  },[isGrid,shownPageKey(gridPages,page),pages.length,settings.pageSeconds,settings.scrollSpeed,settings.scrollDelaySeconds])
  const shown=Math.min(page,pages.length-1)
  const hourNums=useMemo<number[]>(()=>[...new Set(classes.flatMap(c=>c.hours.filter(h=>inRange(h)&&(settings.showEmptyHours!==false||(h.scheduale?.length??0)>0||(showChanges&&changes(h).length>0)||(showExams&&(h.exams?.length??0)>0)||(showEvents&&(h.events?.length??0)>0)||(showMessages&&(h.messages?.length??0)>0))).map(h=>h.hour?.hour??0)))].filter(n=>n>=0).sort((a,b)=>a-b),[classes,settings.hourFrom,settings.hourTo,settings.showEmptyHours,showChanges,showExams,showEvents,showMessages])
  const clock=updated?new Date(updated).toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Jerusalem'}):''
  return <div ref={host} dir="rtl" className="w-full h-full flex flex-col min-h-0 overflow-hidden" style={{background:'var(--tv-panel,#172c48)',color:'var(--tv-ink,#edf5ff)'}}>
    <header className="tv-section-heading"><h2 className="tv-section-heading-label">📋 {settings.title||'שינויי מערכת'}</h2><span className="tv-section-heading-aside">{(() => {
      const grade=isGrid?gridPages[shown]?.[0]?.grade:listPages[shown]?.[0]?.grade
      if(grade==null)return classes.length?'אין שינויים להצגה':'אין כיתות להצגה'
      const gradeClasses=classes.filter(c=>c.grade===grade).length
      const gradePages=pages.map((p,i)=>({p,i})).filter(({p})=>{
        const g=isGrid?(p as ClassRow[])[0]?.grade:(p as Entry[])[0]?.grade
        return g===grade
      })
      const gradePageIndex=gradePages.findIndex(x=>x.i===shown)+1
      return `שכבת ${gradeLabel(grade)} · ${gradeClasses} כיתות · ${gradePageIndex}/${gradePages.length}`
    })()}</span></header>
    {error&&<div className="px-3 py-1 text-amber-200 text-xs">{error}{data?' · מוצגים נתונים אחרונים':''}</div>}
    {stale&&<div className="px-3 py-1 text-amber-200 text-xs">הנתונים אינם מעודכנים (Webtop אינו זמין)</div>}
    {!data?<div className="flex-1 grid place-items-center text-white/60 text-sm">{error||'טוען נתונים מ־Webtop…'}</div>:isGrid?
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* Keep column labels outside the scrolling area: no gap or text bleed above them. */}
        <div className="grid gap-px shrink-0" style={{gridTemplateColumns:`64px repeat(${(gridPages[shown]??[]).length},minmax(0,1fr))`,background:'rgba(255,255,255,.13)'}}>
          <div className="flex items-center justify-center font-bold text-xs bg-slate-700 min-h-10">שעה</div>
          {(gridPages[shown]??[]).map(c=><div key={c.key} className="flex items-center justify-center font-bold bg-slate-700 min-h-10 text-center" style={{fontSize:settings.headerFontSize??22}}>{c.name}</div>)}
        </div>
        <div ref={gridScroll} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden" style={{scrollbarWidth:'thin'}}>
          <div className="grid gap-px" style={{gridTemplateColumns:`64px repeat(${(gridPages[shown]??[]).length},minmax(0,1fr))`,background:'rgba(255,255,255,.13)'}}>
          {hourNums.map(n=><div key={`hour-${n}`} style={{display:'contents'}}><div className="flex items-center justify-center bg-slate-800 font-semibold text-sm min-h-12">{n}</div>
            {(gridPages[shown]??[]).map(c=>{const h=c.hours.find(x=>x.hour?.hour===n);const cs=h&&showChanges?changes(h):[];const lessons=h?.scheduale??[];return <div key={`${c.key}-${n}`} className="min-w-0 min-h-12 flex flex-col items-center justify-start text-center p-1.5 gap-1" style={{background:cs.length?'rgba(125,65,60,.4)':'var(--tv-base,#0b1b34)',overflowWrap:'anywhere'}}>
              {lessons.map((l,i)=><div key={`lesson-${i}`} className="w-full leading-tight border-b border-white/10 pb-1 last:border-0" style={{fontSize:settings.bodyFontSize??16}}><div className="font-semibold">{l.lesson?.subject||'שיעור'}</div><div className="opacity-70" style={{fontSize:settings.detailFontSize??12}}>{[l.lesson?.teacherPrivateName,l.lesson?.teacherLastName].filter(Boolean).join(' ')}{l.lesson?.room?` · ${l.lesson.room}`:''}</div></div>)}
              {cs.map((ch,i)=><div key={`change-${i}`} className="w-full leading-tight font-semibold" style={{color:accent(ch,n),fontSize:settings.bodyFontSize??16}}>{description(ch,n)}</div>)}
              {(showMessages?h?.messages??[]:[]).map((m,i)=><div key={`message-${i}`} className="w-full opacity-80" style={{fontSize:settings.detailFontSize??12}}>{detailLines(m,'message').map((line,j)=><div key={j}>{line}</div>)}</div>)}
              {(showExams?h?.exams??[]:[]).map((m,i)=><div key={`exam-${i}`} className="w-full text-amber-200" style={{fontSize:settings.detailFontSize??12}}>{detailLines(m,'exam').map((line,j)=><div key={j}>{j===0?`מבחן: ${line}`:line}</div>)}</div>)}
              {(showEvents?h?.events??[]:[]).map((m,i)=><div key={`event-${i}`} className="w-full text-emerald-200" style={{fontSize:settings.detailFontSize??12}}>{detailLines(m,'event').map((line,j)=><div key={j}>{j===0?`אירוע: ${line}`:line}</div>)}</div>)}
            </div>})}</div>)}
          </div>
        </div>
      </div>:
      <div className="flex-1 min-h-0 overflow-hidden p-2 flex flex-col gap-1">
        {(listPages[shown]??[]).map((e,i,pageEntries)=>{
          const shared=e.kind==='event'&&!!e.sharedClasses?.length
          const previous=pageEntries[i-1]
          const previousShared=previous?.kind==='event'&&!!previous.sharedClasses?.length
          const classChanged=i>0&&!shared&&!previousShared&&e.name!==previous?.name
          const startsShared=i>0&&shared&&!previousShared
          return <div key={e.key} className="rounded-lg px-3 py-2 border-r-4 flex gap-3 items-start" style={{
            marginTop:startsShared?12:classChanged?8:0,
            background:'rgba(255,255,255,.08)',
            borderColor:e.change?accent(e.change,e.hour):e.kind==='exam'?'#fde68a':e.kind==='event'?'#86efac':'#93c5fd'
          }}><strong className="shrink-0">{e.name}</strong><span className="shrink-0 opacity-70">שעה {e.hour}</span><span style={{color:e.change?accent(e.change,e.hour):e.kind==='exam'?'#fde68a':e.kind==='event'?'#86efac':'#93c5fd',overflowWrap:'anywhere'}}>{e.text}</span></div>
        })}
        {listEntries.length===0&&<div className="flex-1 grid place-items-center opacity-60">אין שינויים להצגה</div>}
      </div>}
    <footer className="flex justify-between items-center px-3 py-1 text-xs opacity-70 shrink-0"><span>{isGrid?'מערכת שעות מלאה':'שינויים בלבד'} · מתחלף אוטומטית {isGrid&&overflow?'· גולל את כל התוכן':''}</span><span>{clock&&`עודכן ${clock}`}</span></footer>
  </div>
}
