import { randomBytes } from 'crypto'
import { errorResponse } from '@/lib/apiErrors'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'

export async function POST(_req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  try {
    const user = await requireRole('EDITOR')
    const screen = await db.screen.findFirst({
      where: { id: params.id, ...(user.role === 'SUPER_ADMIN' ? {} : { schoolId: user.schoolId ?? '__none__' }) },
      select: { id: true, shortCode: true },
    })
    if (!screen) return NextResponse.json({ error: 'המסך לא נמצא' }, { status: 404 })
    // Existing codes are stable; a separate explicit regeneration flow can be added later.
    if (screen.shortCode) return NextResponse.json({ code: screen.shortCode })
    for (let i = 0; i < 6; i++) {
      const code = randomBytes(5).toString('hex').slice(0, 8)
      try {
        const updated = await db.screen.updateMany({
          where: { id: screen.id, shortCode: null },
          data: { shortCode: code },
        })
        if (updated.count) return NextResponse.json({ code })
        const current = await db.screen.findUnique({ where: { id: screen.id }, select: { shortCode: true } })
        if (current?.shortCode) return NextResponse.json({ code: current.shortCode })
      } catch (e: any) {
        if (e?.code !== 'P2002') throw e
      }
    }
    return NextResponse.json({ error: 'לא ניתן להפיק קוד כעת' }, { status: 503 })
  } catch (e) {
    return errorResponse(e, 'Short link', 'שגיאה ביצירת הקישור')
  }
}
