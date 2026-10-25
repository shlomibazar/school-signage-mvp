import { NextRequest, NextResponse } from 'next/server'
import { unlink } from 'fs/promises'
import path from 'path'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
function err(m:string,s:number){return NextResponse.json({error:m},{status:s})}
export async function DELETE(_req:NextRequest,{params}:{params:{id:string}}){
  try{const user=await requireRole('EDITOR');const sc=user.schoolId
  const file=await db.mediaFile.findFirst({where:{id:params.id,...(user.role!=='SUPER_ADMIN'&&sc?{schoolId:sc}:{})}})
  if(!file)return err('Not found',404)
  try{await unlink(path.join(process.cwd(),'public',file.url))}catch{}
  await db.mediaFile.delete({where:{id:params.id}});return NextResponse.json({ok:true})}
  catch(e:any){if(e.message==='Unauthorized')return err('Unauthorized',401);return err('Server error',500)}
}
export async function PATCH(req:NextRequest,{params}:{params:{id:string}}){
  try{const user=await requireRole('EDITOR');const sc=user.schoolId
  const file=await db.mediaFile.findFirst({where:{id:params.id,...(user.role!=='SUPER_ADMIN'&&sc?{schoolId:sc}:{})}})
  if(!file)return err('Not found',404)
  const body=await req.json();const updated=await db.mediaFile.update({where:{id:params.id},data:{caption:body.caption??null}})
  return NextResponse.json({data:{id:updated.id,filename:updated.filename,originalName:updated.originalName,url:updated.url,size:updated.size,caption:updated.caption,uploadedAt:updated.uploadedAt.toISOString()}})}
  catch(e:any){if(e.message==='Unauthorized')return err('Unauthorized',401);return err('Server error',500)}
}
