import { NextRequest,NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { schema } from '@/lib/announcementSchema'
import { z } from 'zod'
export async function PUT(req:NextRequest,{params}:{params:{id:string}}){try{const u=await requireRole('EDITOR');const old=await db.announcement.findFirst({where:{id:params.id,...(u.schoolId?{schoolId:u.schoolId}:{})}});if(!old)return NextResponse.json({error:'Not found'},{status:404});const v=schema.parse(await req.json());const data=await db.announcement.update({where:{id:old.id},data:{...v,startAt:new Date(v.startAt),endAt:new Date(v.endAt)}});return NextResponse.json({data})}catch(e){return NextResponse.json({error:e instanceof z.ZodError?e.issues:'Failed to save'},{status:400})}}
export async function DELETE(_req:NextRequest,{params}:{params:{id:string}}){try{const u=await requireRole('EDITOR');const old=await db.announcement.findFirst({where:{id:params.id,...(u.schoolId?{schoolId:u.schoolId}:{})}});if(!old)return NextResponse.json({error:'Not found'},{status:404});await db.announcement.delete({where:{id:old.id}});return NextResponse.json({ok:true})}catch{return NextResponse.json({error:'Failed'},{status:400})}}
