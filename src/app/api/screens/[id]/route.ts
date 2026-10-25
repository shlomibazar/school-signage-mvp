import {NextRequest,NextResponse} from 'next/server'
import {db} from '@/lib/db'
import {requireRole} from '@/lib/auth'
export async function DELETE(_req:NextRequest,{params}:{params:{id:string}}){
 try{const user=await requireRole('EDITOR');const screen=await db.screen.findFirst({where:{id:params.id,...(user.role==='SUPER_ADMIN'?{}:{schoolId:user.schoolId??'__none__'})}});if(!screen)return NextResponse.json({error:'המסך לא נמצא'},{status:404});await db.screen.delete({where:{id:screen.id}});return NextResponse.json({ok:true})}
 catch(e:any){return NextResponse.json({error:e?.message==='Unauthorized'?'אין הרשאה':'מחיקת המסך נכשלה'},{status:e?.message==='Unauthorized'?401:500})}
}
