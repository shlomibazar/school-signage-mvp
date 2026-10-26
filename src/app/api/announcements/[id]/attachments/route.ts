import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { createHash, randomUUID } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'

export const runtime = 'nodejs'
const allowed: Record<string,string> = { 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp', 'image/gif':'gif', 'application/pdf':'pdf' }
const error=(message:string,status:number)=>NextResponse.json({error:message},{status})
async function access(id:string){
  const user=await requireRole('EDITOR')
  return db.announcement.findFirst({where:{id,...(user.role==='SUPER_ADMIN'?{}:{schoolId:user.schoolId??'__no_school__'})}})
}
async function store(file:File, name:string){
  const provider=process.env.STORAGE_PROVIDER||'local'
  if(provider==='local'){
    const dir=path.join(process.cwd(),'public','uploads','announcements')
    await mkdir(dir,{recursive:true})
    await writeFile(path.join(dir,name),Buffer.from(await file.arrayBuffer()))
    return `/uploads/announcements/${name}`
  }
  if(provider!=='cloudinary') throw new Error('Invalid storage provider')
  const cloud=process.env.CLOUDINARY_CLOUD_NAME, key=process.env.CLOUDINARY_API_KEY, secret=process.env.CLOUDINARY_API_SECRET
  if(!cloud||!key||!secret) throw new Error('Cloudinary not configured')
  const publicId=`schoolscreen/announcements/${name.replace(/\.[^.]+$/,'')}`
  const timestamp=Math.floor(Date.now()/1000)
  const signature=createHash('sha1').update(`public_id=${publicId}&timestamp=${timestamp}${secret}`).digest('hex')
  const form=new FormData()
  form.append('file',file,name);form.append('api_key',key);form.append('timestamp',String(timestamp));form.append('public_id',publicId);form.append('signature',signature)
  const resource=file.type==='application/pdf'?'raw':'image'
  const res=await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/${resource}/upload`,{method:'POST',body:form})
  const data=await res.json() as {secure_url?:string}
  if(!res.ok||!data.secure_url)throw new Error('Cloudinary upload failed')
  return data.secure_url
}
export async function GET(_req:NextRequest,{params}:{params:{id:string}}){
  try{
    const user=await requireRole('VIEWER')
    const a=await db.announcement.findFirst({where:{id:params.id,...(user.schoolId?{schoolId:user.schoolId}:{})}})
    if(!a)return error('Not found',404)
    return NextResponse.json({data:await db.announcementAttachment.findMany({where:{announcementId:a.id},orderBy:{sortOrder:'asc'}})})
  }catch{return error('Unauthorized',401)}
}
export async function POST(req:NextRequest,{params}:{params:{id:string}}){
  try{
    const a=await access(params.id)
    if(!a)return error('Not found',404)
    const form=await req.formData()
    const existingId=form.get('mediaId')
    let url:string, originalName:string, mimeType:string, kind:string
    if(typeof existingId==='string'){
      const media=await db.mediaFile.findFirst({where:{id:existingId,schoolId:a.schoolId,mediaType:'IMAGE',mimeType:{startsWith:'image/'}}})
      if(!media)return error('Image not found',404)
      url=media.url;originalName=media.originalName;mimeType=media.mimeType;kind='IMAGE'
    }else{
      const file=form.get('file')
      if(!(file instanceof File)||!allowed[file.type])return error('Unsupported file',400)
      if(file.size>(file.type==='application/pdf'?20:10)*1024*1024)return error('File too large',413)
      mimeType=file.type;originalName=file.name.slice(0,200);kind=file.type==='application/pdf'?'PDF':'IMAGE'
      url=await store(file,`${randomUUID()}.${allowed[file.type]}`)
    }
    const count=await db.announcementAttachment.count({where:{announcementId:a.id}})
    if(count>=30)return error('Attachment limit reached',400)
    const data=await db.announcementAttachment.create({data:{announcementId:a.id,url,originalName,mimeType,kind,sortOrder:count}})
    return NextResponse.json({data},{status:201})
  }catch(e){console.error('Announcement attachment failed',e);return error(e instanceof Error?e.message:'Upload failed',500)}
}
export async function DELETE(req:NextRequest,{params}:{params:{id:string}}){
  try{
    const a=await access(params.id)
    if(!a)return error('Not found',404)
    const attachmentId=req.nextUrl.searchParams.get('attachmentId')
    if(!attachmentId)return error('Missing attachmentId',400)
    await db.announcementAttachment.deleteMany({where:{id:attachmentId,announcementId:a.id}})
    // Physical cleanup intentionally deferred: shared gallery files must never be deleted here.
    return NextResponse.json({ok:true})
  }catch{return error('Delete failed',500)}
}
