import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { homeSchoolWhere } from '@/lib/schoolScope'
import { schema, regionIdsSchema } from '@/lib/announcementSchema'
import { errorResponse } from '@/lib/apiErrors'
import { listScreenRegions, displayedIn, setAnnouncementRegions } from '@/lib/announcementRegions'
import { announcementStatus } from '@/lib/announcementStatus'
export const dynamic='force-dynamic'

const hasContent=(body:string)=>body.replace(/<[^>]*>/g,'').replace(/&nbsp;| /g,' ').trim().length>0

// List with where each announcement is shown and its derived status (draft = not on any screen).
export async function GET(){
  try{
    const u=await requireRole('VIEWER')
    const data=await db.announcement.findMany({where:homeSchoolWhere(u),orderBy:{createdAt:'desc'}})
    const where=displayedIn(await listScreenRegions([...new Set(data.map(a=>a.schoolId))]))
    return NextResponse.json({data:data.map(a=>{const shown=where.get(a.id)??[];return {...a,displayedIn:shown,status:announcementStatus(a,shown.length>0)}})})
  }catch(e){return errorResponse(e,'Announcements list')}
}

// Creates the announcement and, in the same transaction, adds it to the end of the rotation of
// every selected region. Without regions it is saved as an unassigned draft.
export async function POST(req:NextRequest){
  try{
    const u=await requireRole('EDITOR')
    if(!u.schoolId)return NextResponse.json({error:'Missing school'},{status:400})
    const input=await req.json()
    const v=schema.parse(input)
    const regionIds=regionIdsSchema.parse(input?.regionIds??[])
    if(!hasContent(v.body)&&!input.hasPendingAttachments)return NextResponse.json({error:'יש להזין תוכן הודעה או לצרף תמונה / PDF'},{status:400})
    const data=await db.$transaction(async tx=>{
      const created=await tx.announcement.create({data:{...v,schoolId:u.schoolId!,startAt:new Date(v.startAt),endAt:new Date(v.endAt),daysOfWeek:[]}})
      if(regionIds.length)await setAnnouncementRegions(tx,created.id,u.schoolId!,regionIds)
      return created
    })
    return NextResponse.json({data},{status:201})
  }catch(e){return errorResponse(e,'Announcement create','Failed to save')}
}
