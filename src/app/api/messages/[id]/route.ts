import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { MessageUpdateSchema } from '@/lib/messageSchema'
function err(m:string,s:number){return NextResponse.json({error:m},{status:s})}

export async function PUT(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  try {
    const user = await requireRole('EDITOR')
    const sc = user.schoolId
    const msg = await db.message.findFirst({ where: { id: params.id, ...(user.role !== 'SUPER_ADMIN' ? { schoolId: sc ?? '__none__' } : {}) } })
    if (!msg) return err('Not found', 404)
    const body = await req.json().catch(() => null)
    // Allowlisted fields only; unknown or server-managed keys (id, schoolId, createdAt...) are a 400.
    const parsed = MessageUpdateSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid message data', issues: parsed.error.issues.map(i => ({ path: i.path.join('.'), code: i.code })) }, { status: 400 })
    const updated = await db.message.update({ where: { id: msg.id }, data: parsed.data })
    return NextResponse.json({ data: { ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() } })
  } catch (e:any) {
    if (e.message === 'Unauthorized') return err('Unauthorized', 401)
    return err('Server error', 500)
  }
}

export async function DELETE(_req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  try {
    const user = await requireRole('EDITOR')
    const sc = user.schoolId
    const msg = await db.message.findFirst({ where: { id: params.id, ...(user.role !== 'SUPER_ADMIN' ? { schoolId: sc ?? '__none__' } : {}) } })
    if (!msg) return err('Not found', 404)
    await db.message.delete({ where: { id: params.id } })
    return NextResponse.json({ ok: true })
  } catch (e:any) {
    if (e.message === 'Unauthorized') return err('Unauthorized', 401)
    return err('Server error', 500)
  }
}
