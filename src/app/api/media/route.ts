import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
const UPLOADS_DIR=path.join(process.cwd(),'public','uploads')
const MAX_IMAGE_BYTES=10*1024*1024
const MAX_VIDEO_BYTES=100*1024*1024
const ALLOWED=['image/jpeg','image/png','image/gif','image/webp','image/svg+xml','video/mp4','video/webm']
function err(m:string,s:number){return NextResponse.json({error:m},{status:s})}

export async function GET(req: NextRequest) {
  try {
    const user=await requireRole('VIEWER')
    const schoolId=user.role==='SUPER_ADMIN'?undefined:(user.schoolId??undefined)
    const galleryId=req.nextUrl.searchParams.get('galleryId')
    const files=await db.mediaFile.findMany({
      where:{
        ...(schoolId?{schoolId}:{}),
        mediaType:'IMAGE',hidden:false,
        ...(galleryId?{galleryId}:{})
      },
      orderBy:{uploadedAt:'desc'},
      select:{id:true,filename:true,originalName:true,url:true,size:true,caption:true,uploadedAt:true,galleryId:true,mimeType:true},
    })
    return NextResponse.json({data:files.map(f=>({...f,uploadedAt:f.uploadedAt.toISOString()}))})
  } catch(e:any){
    if(e.message==='Unauthorized')return err('Unauthorized',401)
    return err('Server error',500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user=await requireRole('EDITOR')
    const schoolId=user.schoolId
    if(!schoolId&&user.role!=='SUPER_ADMIN')return err('No school',400)
    const fd=await req.formData()
    const galleryId=fd.get('galleryId') as string|null
    const files=fd.getAll('file') as File[]
    if(!files.length)return err('No files',400)

    const results=[]
    for(const file of files){
      if(file.size>(file.type.startsWith('video/')?MAX_VIDEO_BYTES:MAX_IMAGE_BYTES))continue
      if(!ALLOWED.includes(file.type))continue
      const ext=({'video/mp4':'mp4','video/webm':'webm','image/jpeg':'jpg','image/png':'png','image/gif':'gif','image/webp':'webp','image/svg+xml':'svg'} as Record<string,string>)[file.type] ?? 'jpg'
      const filename=Date.now()+'-'+Math.random().toString(36).slice(2)+'.'+ext
      await mkdir(UPLOADS_DIR,{recursive:true})
      await writeFile(path.join(UPLOADS_DIR,filename),Buffer.from(await file.arrayBuffer()))
      const rec=await db.mediaFile.create({
        data:{
          schoolId:schoolId!,filename,originalName:file.name,
          mimeType:file.type,size:file.size,mediaType:'IMAGE',
          url:'/uploads/'+filename,hidden:false,
          ...(galleryId?{galleryId}:{})
        }
      })
      results.push({id:rec.id,filename:rec.filename,originalName:rec.originalName,url:rec.url,size:rec.size,caption:rec.caption,mimeType:rec.mimeType,uploadedAt:rec.uploadedAt.toISOString(),galleryId:rec.galleryId})
    }
    if(!results.length)return err('No supported files or file too large',400)
    return NextResponse.json({data:results},{status:201})
  } catch(e:any){
    if(e.message==='Unauthorized')return err('Unauthorized',401)
    console.error(e);return err('Server error',500)
  }
}
