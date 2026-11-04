import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { homeSchoolWhere } from '@/lib/schoolScope'
import { schema, regionIdsSchema } from '@/lib/announcementSchema'
import { errorResponse } from '@/lib/apiErrors'
import { listScreenRegions, displayedIn, setAnnouncementRegions } from '@/lib/announcementRegions'
import { announcementStatus } from '@/lib/announcementStatus'
import { verifyPreparedUpload } from '@/lib/preparedUploads'
import { z } from 'zod'
export const dynamic='force-dynamic'

// Attachments prepared before saving: upload tokens (see lib/preparedUploads) or gallery images, in order.
const attachmentsSchema=z.array(z.union([z.object({token:z.string().min(1).max(4000)}),z.object({mediaId:z.string().min(1).max(64)})])).max(30)
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
    const items=attachmentsSchema.parse(input?.attachments??[])
    // Every item is checked before anything is written: tokens must be valid and for this school,
    // gallery images must be this school's images.
    const prepared:{url:string;originalName:string;mimeType:string;kind:string}[]=[]
    for(const item of items){
      if('token' in item){
        const up=await verifyPreparedUpload(item.token,u.schoolId)
        if(!up)return NextResponse.json({error:'אחד הקבצים שהועלו אינו תקף יותר. הסירו אותו והעלו שוב.'},{status:400})
        prepared.push({url:up.url,originalName:up.name,mimeType:up.mime,kind:up.kind})
      }else{
        const m=await db.mediaFile.findFirst({where:{id:item.mediaId,schoolId:u.schoolId,mediaType:'IMAGE',mimeType:{startsWith:'image/'}}})
        if(!m)return NextResponse.json({error:'אחת התמונות מהגלריה לא נמצאה'},{status:400})
        prepared.push({url:m.url,originalName:m.originalName,mimeType:m.mimeType,kind:'IMAGE'})
      }
    }
    if(!hasContent(v.body)&&!input.hasPendingAttachments&&!prepared.length)return NextResponse.json({error:'יש להזין תוכן הודעה או לצרף תמונה / PDF'},{status:400})
    const data=await db.$transaction(async tx=>{
      const created=await tx.announcement.create({data:{...v,schoolId:u.schoolId!,startAt:new Date(v.startAt),endAt:new Date(v.endAt),daysOfWeek:[]}})
      if(prepared.length)await tx.announcementAttachment.createMany({data:prepared.map((p,i)=>({...p,announcementId:created.id,sortOrder:i}))})
      if(regionIds.length)await setAnnouncementRegions(tx,created.id,u.schoolId!,regionIds)
      return created
    })
    return NextResponse.json({data},{status:201})
  }catch(e){return errorResponse(e,'Announcement create','Failed to save')}
}
