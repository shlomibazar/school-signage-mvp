import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'

const payload = z.object({ active: z.boolean() }).strict()
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole('SCHOOL_ADMIN')
    const parsed = payload.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: 'מצב מסך לא תקין' }, { status: 400 })
    const { id } = await params
    const where = { id, ...(user.role === 'SUPER_ADMIN' ? {} : { schoolId: user.schoolId ?? '__none__' }) }
    const result = await db.screen.updateMany({ where, data: { active: parsed.data.active } })
    if (!result.count) return NextResponse.json({ error: 'המסך לא נמצא' }, { status: 404 })
    return NextResponse.json({ ok: true, active: parsed.data.active })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500
    return NextResponse.json({ error: status === 500 ? 'עדכון מצב המסך נכשל' : 'אין הרשאה' }, { status })
  }
}
