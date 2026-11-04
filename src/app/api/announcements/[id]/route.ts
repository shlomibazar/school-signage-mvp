import { NextRequest,NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { homeSchoolWhere } from '@/lib/schoolScope'
import { schema, regionIdsSchema } from '@/lib/announcementSchema'
import { errorResponse } from '@/lib/apiErrors'
import { setAnnouncementRegions, removeAnnouncementEverywhere } from '@/lib/announcementRegions'

// Updates the announcement. When regionIds is sent, the announcement is shown in exactly those
// regions (added at the end of new rotations, removed from unselected ones) in the same
// transaction; without regionIds the existing assignments are left as they are.
export async function PUT(req:NextRequest,{ params: paramsPromise }:{params: Promise<{id:string}>}){
  const params = await paramsPromise
  try{
    const u=await requireRole('EDITOR')
    const old=await db.announcement.findFirst({where:{id:params.id,...homeSchoolWhere(u)}})
    if(!old)return NextResponse.json({error:'Not found'},{status:404})
    const input=await req.json()
    const v=schema.parse(input)
    const regionIds=input?.regionIds===undefined?undefined:regionIdsSchema.parse(input.regionIds)
    if(!v.body.replace(/<[^>]*>/g,'').trim()&&!input.hasPendingAttachments){
      const count=await db.announcementAttachment.count({where:{announcementId:old.id}})
      if(count===0)return NextResponse.json({error:'יש להזין תוכן הודעה או לצרף תמונה / PDF'},{status:400})
    }
    const data=await db.$transaction(async tx=>{
      const updated=await tx.announcement.update({where:{id:old.id},data:{...v,startAt:new Date(v.startAt),endAt:new Date(v.endAt)}})
      if(regionIds)await setAnnouncementRegions(tx,old.id,old.schoolId,regionIds)
      return updated
    })
    return NextResponse.json({data})
  }catch(e){return errorResponse(e,'Announcement update','Failed to save')}
}

// Deletes the announcement everywhere: its id is removed from every region of the school
// (also hidden sections), then the record (and its attachments, by cascade) is deleted.
export async function DELETE(_req:NextRequest,{ params: paramsPromise }:{params: Promise<{id:string}>}){
  const params = await paramsPromise
  try{
    const u=await requireRole('EDITOR')
    const old=await db.announcement.findFirst({where:{id:params.id,...homeSchoolWhere(u)}})
    if(!old)return NextResponse.json({error:'Not found'},{status:404})
    await db.$transaction(async tx=>{
      await removeAnnouncementEverywhere(tx,old.id,old.schoolId)
      await tx.announcement.delete({where:{id:old.id}})
    })
    return NextResponse.json({ok:true})
  }catch(e){return errorResponse(e,'Announcement delete','Failed')}
}
