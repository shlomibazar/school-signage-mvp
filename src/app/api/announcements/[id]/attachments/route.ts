import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { homeSchoolWhere } from '@/lib/schoolScope'
import { randomUUID } from 'crypto'
import { checkUpload } from '@/lib/uploadValidation'
import { storeUpload } from '@/lib/storage'
import { errorResponse } from '@/lib/apiErrors'

export const runtime = 'nodejs'
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'] as const
const MAX_ATTACHMENTS = 30
const error=(message:string,status:number)=>NextResponse.json({error:message},{status})
async function access(id:string){
  const user=await requireRole('EDITOR')
  return db.announcement.findFirst({where:{id,...(user.role==='SUPER_ADMIN'?{}:{schoolId:user.schoolId??'__no_school__'})}})
}
export async function GET(_req:NextRequest,{ params: paramsPromise }:{params: Promise<{id:string}>}){
  const params = await paramsPromise;
  try{
    const user=await requireRole('VIEWER')
    const a=await db.announcement.findFirst({where:{id:params.id,...homeSchoolWhere(user)}})
    if(!a)return error('Not found',404)
    return NextResponse.json({data:await db.announcementAttachment.findMany({where:{announcementId:a.id},orderBy:{sortOrder:'asc'}})})
  }catch(e){return errorResponse(e,'Announcement attachments list')}
}
export async function POST(req:NextRequest,{ params: paramsPromise }:{params: Promise<{id:string}>}){
  const params = await paramsPromise;
  try{
    const a=await access(params.id)
    if(!a)return error('Not found',404)
    // Checked before anything is stored, so a full announcement leaves no orphan files.
    const count=await db.announcementAttachment.count({where:{announcementId:a.id}})
    if(count>=MAX_ATTACHMENTS)return error('ניתן לצרף עד 30 קבצים להודעה',400)
    const form=await req.formData()
    const existingId=form.get('mediaId')
    let url:string, originalName:string, mimeType:string, kind:string
    if(typeof existingId==='string'){
      const media=await db.mediaFile.findFirst({where:{id:existingId,schoolId:a.schoolId,mediaType:'IMAGE',mimeType:{startsWith:'image/'}}})
      if(!media)return error('Image not found',404)
      url=media.url;originalName=media.originalName;mimeType=media.mimeType;kind='IMAGE'
    }else{
      const file=form.get('file')
      if(!(file instanceof File))return error('חסר קובץ',400)
      const check=await checkUpload(file,ALLOWED)
      if(!check.ok)return error(check.error,check.error.startsWith('הקובץ גדול')?413:400)
      mimeType=check.type.mime;originalName=(String(form.get('originalName')||file.name)).slice(0,200)
      kind=check.type.kind==='pdf'?'PDF':form.get('pdfPage')==='1'?'PDF_PAGE':'IMAGE'
      url=await storeUpload(file,{folder:'announcements',name:`${randomUUID()}.${check.type.ext}`,mime:mimeType})
    }
    const data=await db.announcementAttachment.create({data:{announcementId:a.id,url,originalName,mimeType,kind,sortOrder:count}})
    return NextResponse.json({data},{status:201})
  }catch(e){return errorResponse(e,'Announcement attachment upload')}
}
export async function DELETE(req:NextRequest,{ params: paramsPromise }:{params: Promise<{id:string}>}){
  const params = await paramsPromise;
  try{
    const a=await access(params.id)
    if(!a)return error('Not found',404)
    const attachmentId=req.nextUrl.searchParams.get('attachmentId')
    if(!attachmentId)return error('Missing attachmentId',400)
    await db.announcementAttachment.deleteMany({where:{id:attachmentId,announcementId:a.id}})
    // Physical cleanup intentionally deferred: shared gallery files must never be deleted here.
    return NextResponse.json({ok:true})
  }catch(e){return errorResponse(e,'Announcement attachment delete')}
}
