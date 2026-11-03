import {NextRequest,NextResponse} from 'next/server'
import { errorResponse } from '@/lib/apiErrors'
import {db} from '@/lib/db'
import {requireRole} from '@/lib/auth'
export async function DELETE(_req:NextRequest,{ params: paramsPromise }:{params: Promise<{id:string}>}){
  const params = await paramsPromise;
 try{const user=await requireRole('EDITOR');const screen=await db.screen.findFirst({where:{id:params.id,...(user.role==='SUPER_ADMIN'?{}:{schoolId:user.schoolId??'__none__'})}});if(!screen)return NextResponse.json({error:'המסך לא נמצא'},{status:404});await db.screen.delete({where:{id:screen.id}});return NextResponse.json({ok:true})}
 catch(e){return errorResponse(e,'Screen delete','מחיקת המסך נכשלה')}
}
