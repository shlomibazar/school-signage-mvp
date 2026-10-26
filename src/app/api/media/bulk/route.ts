import { NextRequest,NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { unlink } from 'fs/promises'
import path from 'path'
export async function POST(req:NextRequest){
 try{
 const user=await requireRole('EDITOR');const {ids,action,galleryId}=await req.json();
 if(!Array.isArray(ids)||ids.length<1||ids.length>500||ids.some(x=>typeof x!=='string')||!['delete','move'].includes(action))return NextResponse.json({error:'Invalid request'},{status:400})
 const where={id:{in:ids},...(user.role!=='SUPER_ADMIN'?{schoolId:user.schoolId??'__none__'}:{})}
 const files=await db.mediaFile.findMany({where,select:{id:true,url:true,schoolId:true}})
 if(files.length!==new Set(ids).size)return NextResponse.json({error:'Unauthorized items'},{status:403})
 if(action==='move'){
 if(typeof galleryId!=='string')return NextResponse.json({error:'Missing gallery'},{status:400})
 const gallery=await db.gallery.findFirst({where:{id:galleryId,...(user.role!=='SUPER_ADMIN'?{schoolId:user.schoolId??'__none__'}:{})}})
 if(!gallery||files.some(f=>f.schoolId!==gallery.schoolId))return NextResponse.json({error:'Invalid destination'},{status:403})
 await db.mediaFile.updateMany({where,data:{galleryId}})
 }else{
 await db.mediaFile.deleteMany({where})
 for(const f of files)if(/^\/uploads\/[a-zA-Z0-9._-]+$/.test(f.url)){try{await unlink(path.join(process.cwd(),'public',f.url.slice(1)))}catch{}}
 }
 return NextResponse.json({ok:true,count:files.length})
 }catch(e:any){return NextResponse.json({error:e.message==='Unauthorized'?'Unauthorized':'Server error'},{status:e.message==='Unauthorized'?401:500})}
}
