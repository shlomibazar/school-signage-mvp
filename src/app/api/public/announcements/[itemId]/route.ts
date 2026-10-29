import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
export const dynamic = 'force-dynamic'
export async function GET(_req:Request,{params}:{params:{itemId:string}}){
  const item=await db.contentItem.findUnique({where:{id:params.itemId},include:{section:{include:{screen:true}}}})
  if(!item||item.contentType!=='ANNOUNCEMENT'||!item.section.screen.active)return NextResponse.json({data:[]})
  const settings=(item.settings??{}) as {selectedAnnouncementIds?:string[]}
  const ids=settings.selectedAnnouncementIds??[]
  if(!ids.length)return NextResponse.json({data:[]})
  const now=new Date()
  const weekday=now.getDay()
  const clock=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Jerusalem',hour:'2-digit',minute:'2-digit',hour12:false}).format(now)
  const messages=await db.announcement.findMany({where:{id:{in:ids},schoolId:item.section.screen.schoolId,active:true,startAt:{lte:now},endAt:{gte:now}},include:{attachments:{orderBy:{sortOrder:'asc'}}}})
  const filtered=messages.filter(a=>(!a.daysOfWeek.length||a.daysOfWeek.includes(weekday))&&(!a.startTime||clock>=a.startTime)&&(!a.endTime||clock<=a.endTime))
  const data=ids.flatMap(id=>{const a=filtered.find(a=>a.id===id);return a?[{id:a.id,title:a.title,showTitle:a.showTitle,body:a.body,icon:a.icon??'📢',attachmentDisplayMode:a.attachmentDisplayMode,attachmentSlideSeconds:a.attachmentSlideSeconds,priority:a.priority==='HIGH'||a.priority==='EMERGENCY'?'urgent':a.priority==='MEDIUM'?'warning':'info',attachments:a.attachments.filter(f=>f.kind==='IMAGE'||f.kind==='PDF_PAGE').map(f=>({id:f.id,url:f.url,kind:f.kind}))}]:[]})
  return NextResponse.json({data},{headers:{'Cache-Control':'no-store'}})
}
