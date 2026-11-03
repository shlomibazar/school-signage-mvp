import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { errorResponse } from '@/lib/apiErrors'
import { unlink } from 'fs/promises'
import path from 'path'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
// A caption is plain text shown under the image; empty or null clears it.
const captionSchema=z.object({caption:z.string().trim().max(300).nullish()})
function err(m:string,s:number){return NextResponse.json({error:m},{status:s})}
export async function DELETE(_req:NextRequest,{ params: paramsPromise }:{params: Promise<{id:string}>}){
  const params = await paramsPromise;
  try{const user=await requireRole('EDITOR');const sc=user.schoolId
  const file=await db.mediaFile.findFirst({where:{id:params.id,...(user.role!=='SUPER_ADMIN'?{schoolId:sc??'__none__'}:{})}})
  if(!file)return err('Not found',404)
  try{await unlink(path.join(process.cwd(),'public',file.url))}catch{}
  await db.mediaFile.delete({where:{id:params.id}});return NextResponse.json({ok:true})}
  catch(e){return errorResponse(e,'Media item')}
}
export async function PATCH(req:NextRequest,{ params: paramsPromise }:{params: Promise<{id:string}>}){
  const params = await paramsPromise;
  try{const user=await requireRole('EDITOR');const sc=user.schoolId
  const file=await db.mediaFile.findFirst({where:{id:params.id,...(user.role!=='SUPER_ADMIN'?{schoolId:sc??'__none__'}:{})}})
  if(!file)return err('Not found',404)
  const {caption}=captionSchema.parse(await req.json());const updated=await db.mediaFile.update({where:{id:params.id},data:{caption:caption||null}})
  return NextResponse.json({data:{id:updated.id,filename:updated.filename,originalName:updated.originalName,url:updated.url,size:updated.size,caption:updated.caption,uploadedAt:updated.uploadedAt.toISOString()}})}
  catch(e){return errorResponse(e,'Media item')}
}
