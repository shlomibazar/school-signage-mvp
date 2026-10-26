import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const WEBTOP = 'https://webtopserver.smartschool.co.il/server/api/shotef/SchoolchangesPerGradeFirst'
const cache = new Map<string, {at:number; data:unknown}>()

type WebtopSettings = {institutionCode?:string; grades?:number[]; refreshSeconds?:number; dateMode?:string; specificDate?:string}
export async function GET(_req:Request,{params}:{params:{itemId:string}}){
  const item=await db.contentItem.findUnique({where:{id:params.itemId},include:{section:{include:{screen:true}}}})
  if(!item||item.contentType!=='TIMETABLE'||!item.section.screen.active)return NextResponse.json({error:'Not found'},{status:404})
  const s=(item.settings??{}) as WebtopSettings & {displayMode?:string}
  if(s.displayMode!=='webtop-list'&&s.displayMode!=='webtop-grid')return NextResponse.json({error:'Not configured'},{status:400})
  const institutionCode=Number(s.institutionCode)
  if(!Number.isSafeInteger(institutionCode)||institutionCode<=0)return NextResponse.json({error:'יש להגדיר סמל מוסד תקין'},{status:400})
  const grades=[...new Set((s.grades??[7,8,9,10,11,12]).filter(g=>Number.isInteger(g)&&g>=7&&g<=12))].sort((a,b)=>a-b)
  if(!grades.length)return NextResponse.json({error:'לא נבחרו שכבות'},{status:400})
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
  const selectedDay=s.dateMode==='tomorrow'?new Date(Date.now()+86400000).toISOString().slice(0,10):s.dateMode==='specific'&&/^\d{4}-\d{2}-\d{2}$/.test(s.specificDate??'')?s.specificDate!:today
  const key=`${institutionCode}:${grades.join(',')}:${selectedDay}`
  const ttl=Math.max(30,Math.min(600,Number(s.refreshSeconds)||60))*1000
  const cached=cache.get(key)
  if(cached&&Date.now()-cached.at<ttl)return NextResponse.json({data:cached.data,updatedAt:new Date(cached.at).toISOString(),stale:false},{headers:{'Cache-Control':'no-store'}})
  try{
    const responses=await Promise.all(grades.map(async grade=>{
      const ctrl=new AbortController()
      const timer=setTimeout(()=>ctrl.abort(),12000)
      try{
        const r=await fetch(WEBTOP,{method:'POST',headers:{'Content-Type':'application/json','Language':'he','Rememberme':'0'},body:JSON.stringify({institutionCode,grade,selectedDate:`${selectedDay}T12:00:00.000Z`}),cache:'no-store',signal:ctrl.signal})
        if(!r.ok)throw new Error(`Webtop HTTP ${r.status} (${grade})`)
        const j=await r.json()
        if(j.status!==true||!Array.isArray(j.data?.classes))throw new Error(`Webtop invalid response (${grade})`)
        return [String(grade),{classes:j.data.classes,generalMessages:j.data.generalMessages??[]}] as const
      }finally{clearTimeout(timer)}
    }))
    const data={grades:Object.fromEntries(responses),institutionCode}
    cache.set(key,{at:Date.now(),data})
    if(cache.size>100){const oldest=cache.keys().next().value;if(oldest)cache.delete(oldest)}
    return NextResponse.json({data,updatedAt:new Date().toISOString(),stale:false},{headers:{'Cache-Control':'no-store'}})
  }catch(e){
    console.error('[WEBTOP API ERROR]', {
      message: e instanceof Error ? e.message : String(e),
      cause: e instanceof Error ? String(e.cause ?? '') : '',
      institutionCode,
      grades,
      selectedDay,
      endpoint: WEBTOP,
    })
    return NextResponse.json({error:'לא ניתן לקבל נתונים מ־Webtop. יש לוודא גישה ל־API מהשרת.'},{status:502,headers:{'Cache-Control':'no-store'}})
  }
}