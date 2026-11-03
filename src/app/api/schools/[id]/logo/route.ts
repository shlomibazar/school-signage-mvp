import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { db } from '@/lib/db'
import { randomUUID } from 'crypto'
import { checkUpload } from '@/lib/uploadValidation'
import { storeUpload } from '@/lib/storage'
import { errorResponse } from '@/lib/apiErrors'

export const runtime = 'nodejs'
const MAX_LOGO_BYTES = 3 * 1024 * 1024

// The logo is stored like other uploads (Cloudinary when configured), so it survives redeploys
// on hosts with an ephemeral disk. Existing logo URLs are left as they are.
export async function POST(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  try {
    const user = await requireRole('EDITOR')
    if (user.role !== 'SUPER_ADMIN' && user.schoolId !== params.id) return NextResponse.json({error:'אין הרשאה'}, {status:403})
    const school = await db.school.findUnique({where:{id:params.id},select:{id:true}})
    if (!school) return NextResponse.json({error:'בית ספר לא נמצא'}, {status:404})
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return NextResponse.json({error:'חסר קובץ'}, {status:400})
    const check = await checkUpload(file, ['image/png', 'image/jpeg', 'image/webp'])
    if (!check.ok || file.size > MAX_LOGO_BYTES) return NextResponse.json({error:'קובץ לא תקין (PNG, JPG או WEBP עד 3MB)'}, {status:400})
    const logoUrl = await storeUpload(file, { folder: '', name: `school-logo-${randomUUID()}.${check.type.ext}`, mime: check.type.mime })
    await db.school.update({where:{id:params.id},data:{logoUrl}})
    return NextResponse.json({logoUrl})
  } catch (e) {
    const response = errorResponse(e, 'School logo upload')
    return response.status === 500 ? NextResponse.json({error:'שמירת הלוגו נכשלה'}, {status:500}) : response
  }
}
