import { NextRequest,NextResponse } from 'next/server'
import { errorResponse } from '@/lib/apiErrors'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { homeSchoolWhere } from '@/lib/schoolScope'
import { schema } from '@/lib/announcementSchema'
export async function PUT(req:NextRequest,{ params: paramsPromise }:{params: Promise<{id:string}>}){
  const params = await paramsPromise;try{const u=await requireRole('EDITOR');const old=await db.announcement.findFirst({where:{id:params.id,...homeSchoolWhere(u)}});if(!old)return NextResponse.json({error:'Not found'},{status:404});const input=await req.json();const v=schema.parse(input);if(!v.body.replace(/<[^>]*>/g,'').trim()&&!input.hasPendingAttachments){const count=await db.announcementAttachment.count({where:{announcementId:old.id}});if(count===0)return NextResponse.json({error:'יש להזין תוכן הודעה או לצרף תמונה / PDF'},{status:400})}const data=await db.announcement.update({where:{id:old.id},data:{...v,startAt:new Date(v.startAt),endAt:new Date(v.endAt)}});return NextResponse.json({data})}catch(e){return errorResponse(e,'Announcement update','Failed to save')}}
export async function DELETE(_req:NextRequest,{ params: paramsPromise }:{params: Promise<{id:string}>}){
  const params = await paramsPromise;try{const u=await requireRole('EDITOR');const old=await db.announcement.findFirst({where:{id:params.id,...homeSchoolWhere(u)}});if(!old)return NextResponse.json({error:'Not found'},{status:404});await db.announcement.delete({where:{id:old.id}});return NextResponse.json({ok:true})}catch(e){return errorResponse(e,'Announcement delete','Failed')}}
