import { NextRequest,NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { z } from 'zod'
import { schema } from '@/lib/announcementSchema'
export const dynamic='force-dynamic'

export async function GET(){try{const u=await requireRole('VIEWER');const data=await db.announcement.findMany({where:u.schoolId?{schoolId:u.schoolId}:{},orderBy:{createdAt:'desc'}});return NextResponse.json({data})}catch{return NextResponse.json({error:'Unauthorized'},{status:401})}}
export async function POST(req:NextRequest){try{const u=await requireRole('EDITOR');if(!u.schoolId)return NextResponse.json({error:'Missing school'},{status:400});const input=await req.json();const v=schema.parse(input);if(!v.body.replace(/<[^>]*>/g,'').trim()&&!input.hasPendingAttachments)return NextResponse.json({error:'יש להזין תוכן הודעה או לצרף תמונה / PDF'},{status:400});const data=await db.announcement.create({data:{...v,schoolId:u.schoolId,startAt:new Date(v.startAt),endAt:new Date(v.endAt),daysOfWeek:[]}});return NextResponse.json({data},{status:201})}catch(e){return NextResponse.json({error:e instanceof z.ZodError?e.issues:'Failed to save'},{status:400})}}
