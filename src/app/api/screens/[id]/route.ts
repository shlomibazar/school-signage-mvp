import {NextRequest,NextResponse} from 'next/server'
import { z } from 'zod'
import { errorResponse } from '@/lib/apiErrors'
import {db} from '@/lib/db'
import {requireRole} from '@/lib/auth'
import { deleteScreenSnapshot } from '@/lib/storage'
import { screenNameSchema } from '@/lib/screenIdentity'

const scope = (user: { role: string; schoolId: string | null }) => user.role === 'SUPER_ADMIN' ? {} : { schoolId: user.schoolId ?? '__none__' }

// Rename: only the display name changes. The id, slug (public URL), short code, pairing, layout,
// content and settings stay as they are. EDITOR and up, like creating a screen.
const RenameSchema = z.object({ name: screenNameSchema })
export async function PATCH(req:NextRequest,{ params }:{params: Promise<{id:string}>}){
 try{
  const user=await requireRole('EDITOR')
  const { id } = await params
  const parsed=RenameSchema.safeParse(await req.json().catch(()=>null))
  if(!parsed.success)return NextResponse.json({error:parsed.error.issues[0]?.message ?? 'שם לא תקין'},{status:400})
  const screen=await db.screen.findFirst({where:{id,...scope(user)},select:{id:true}})
  if(!screen)return NextResponse.json({error:'המסך לא נמצא'},{status:404})
  const updated=await db.screen.update({where:{id:screen.id},data:{name:parsed.data.name},select:{id:true,name:true}})
  return NextResponse.json({data:updated})
 }catch(e){return errorResponse(e,'Screen rename','שינוי שם המסך נכשל')}
}

export async function DELETE(_req:NextRequest,{ params: paramsPromise }:{params: Promise<{id:string}>}){
  const params = await paramsPromise;
 try{
  // Deleting a screen is a school-admin action (like disabling it); editors manage its content.
  const user=await requireRole('SCHOOL_ADMIN');const screen=await db.screen.findFirst({where:{id:params.id,...scope(user)}});if(!screen)return NextResponse.json({error:'המסך לא נמצא'},{status:404});await db.screen.delete({where:{id:screen.id}});
  // The screen's snapshot image is removed too (best effort: a failure only leaves one stray image).
  if(screen.snapshotUrl)await deleteScreenSnapshot(screen.id).catch(e=>console.error('Screen snapshot delete failed',e))
  return NextResponse.json({ok:true})}
 catch(e){return errorResponse(e,'Screen delete','מחיקת המסך נכשלה')}
}
