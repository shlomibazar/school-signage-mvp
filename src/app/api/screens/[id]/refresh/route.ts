import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'

const schema = z.object({ refreshSecs: z.union([z.literal(300), z.literal(600), z.literal(900)]) })
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole('SCHOOL_ADMIN')
    const parsed = schema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: 'Invalid interval' }, { status: 400 })
    const { id } = await params
    const existing = await db.screen.findFirst({ where: { id, ...(user.role === 'SUPER_ADMIN' ? {} : { schoolId: user.schoolId ?? '__none__' }) }, select: { id: true } })
    if (!existing) return NextResponse.json({ error: 'Screen not found' }, { status: 404 })
    const updated = await db.screen.update({ where: { id }, data: { refreshSecs: parsed.data.refreshSecs }, select: { id: true, refreshSecs: true } })
    return NextResponse.json({ data: updated })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : ''
    return NextResponse.json({ error: message === 'Unauthorized' ? 'Unauthorized' : message === 'Forbidden' ? 'Forbidden' : 'Server error' }, { status: message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500 })
  }
}
