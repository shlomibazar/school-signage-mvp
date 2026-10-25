import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Public screens can retrieve only files in folders explicitly selected by an active gallery item.
export async function GET(_request:Request,{params}:{params:{itemId:string}}){
  const item=await db.contentItem.findUnique({where:{id:params.itemId},include:{section:{include:{screen:true}}}})
  if(!item || item.contentType!=='IMAGE_GALLERY' || !item.active || !item.section.screen.active)
    return NextResponse.json({error:'Not found'},{status:404})
  const settings=(item.settings??{}) as {folderIds?:unknown}
  const ids=Array.isArray(settings.folderIds)?settings.folderIds.filter((v):v is string=>typeof v==='string'):[]
  const selectedIds=Array.isArray((item.settings as any)?.imageIds)?(item.settings as any).imageIds.filter((v:unknown):v is string=>typeof v==='string'):[]
  if(!ids.length && !selectedIds.length)return NextResponse.json({data:[]})
  const files=await db.mediaFile.findMany({where:{schoolId:item.section.screen.schoolId,...(ids.length?{galleryId:{in:ids}}:{id:{in:selectedIds}}),mediaType:'IMAGE',hidden:false},select:{id:true,url:true,caption:true,originalName:true,uploadedAt:true,mimeType:true,galleryId:true},orderBy:{uploadedAt:'desc'}})
  return NextResponse.json({data:files.map(f=>({...f,uploadedAt:f.uploadedAt.toISOString()}))},{headers:{'Cache-Control':'no-store'}})
}
