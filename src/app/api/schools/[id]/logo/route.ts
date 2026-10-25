import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { db } from '@/lib/db'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('EDITOR')
    if (user.role !== 'SUPER_ADMIN' && user.schoolId !== params.id) return NextResponse.json({error:'אין הרשאה'}, {status:403})
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return NextResponse.json({error:'חסר קובץ'}, {status:400})
    const allowed: Record<string,string> = {'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}
    const ext = allowed[file.type]
    if (!ext || file.size > 3*1024*1024 || file.size === 0) return NextResponse.json({error:'קובץ לא תקין (עד 3MB)'}, {status:400})
    const school = await db.school.findUnique({where:{id:params.id},select:{id:true}})
    if (!school) return NextResponse.json({error:'בית ספר לא נמצא'}, {status:404})
    const bytes = Buffer.from(await file.arrayBuffer())
    const signatures: Record<string,boolean> = {
      png:bytes.length>8 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),
      jpg:bytes.length>3 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255,
      webp:bytes.length>12 && bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP'
    }
    if (!signatures[ext]) return NextResponse.json({error:'תוכן התמונה אינו תואם לסוג הקובץ'}, {status:400})
    const filename=`school-logo-${randomUUID()}.${ext}`
    const folder=path.join(process.cwd(),'public','uploads')
    await mkdir(folder,{recursive:true})
    await writeFile(path.join(folder,filename),bytes)
    const logoUrl=`/uploads/${filename}`
    await db.school.update({where:{id:params.id},data:{logoUrl}})
    return NextResponse.json({logoUrl})
  } catch (e) {console.error(e);return NextResponse.json({error:'שמירת הלוגו נכשלה'}, {status:500})}
}
