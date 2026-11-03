import { NextResponse } from 'next/server'
import { isActiveNow } from '@/lib/scheduling'
import { db } from '@/lib/db'
export const dynamic = 'force-dynamic'
export async function GET(_req:Request,{ params: paramsPromise }:{params: Promise<{itemId:string}>}){
  const params = await paramsPromise;
  const item=await db.contentItem.findUnique({where:{id:params.itemId},include:{section:{include:{screen:{include:{school:{select:{timezone:true}}}}}}}})
  // A disabled item or screen is not public, even by its id.
  if(!item||item.contentType!=='ANNOUNCEMENT'||!item.active||!item.section.screen.active)return NextResponse.json({data:[]})
  const settings=(item.settings??{}) as {selectedAnnouncementIds?:string[]}
  const ids=settings.selectedAnnouncementIds??[]
  if(!ids.length)return NextResponse.json({data:[]})
  const now=new Date()
  const messages=await db.announcement.findMany({where:{id:{in:ids},schoolId:item.section.screen.schoolId,active:true,startAt:{lte:now},endAt:{gte:now}},include:{attachments:{orderBy:{sortOrder:'asc'}}}})
  // Days and times in the school's time zone (overnight windows supported); dates are checked in the query.
  const tz=item.section.screen.school.timezone
  const filtered=messages.filter(a=>isActiveNow({active:true,startDate:null,endDate:null,startTime:a.startTime,endTime:a.endTime,daysOfWeek:a.daysOfWeek},now,tz))
  const data=ids.flatMap(id=>{const a=filtered.find(a=>a.id===id);return a?[{id:a.id,title:a.title,showTitle:a.showTitle,body:a.body,icon:a.icon??'📢',attachmentDisplayMode:a.attachmentDisplayMode,attachmentSlideSeconds:a.attachmentSlideSeconds,priority:a.priority==='HIGH'||a.priority==='EMERGENCY'?'urgent':a.priority==='MEDIUM'?'warning':'info',attachments:a.attachments.filter(f=>f.kind==='IMAGE'||f.kind==='PDF_PAGE').map(f=>({id:f.id,url:f.url,kind:f.kind}))}]:[]})
  return NextResponse.json({data},{headers:{'Cache-Control':'no-store'}})
}
