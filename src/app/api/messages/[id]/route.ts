import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
function err(m:string,s:number){return NextResponse.json({error:m},{status:s})}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('EDITOR')
    const sc = user.schoolId
    const msg = await db.message.findFirst({ where: { id: params.id, ...(user.role !== 'SUPER_ADMIN' && sc ? { schoolId: sc } : {}) } })
    if (!msg) return err('Not found', 404)
    const body = await req.json()
    const updated = await db.message.update({ where: { id: params.id }, data: body })
    return NextResponse.json({ data: { ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() } })
  } catch (e:any) {
    if (e.message === 'Unauthorized') return err('Unauthorized', 401)
    return err('Server error', 500)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('EDITOR')
    const sc = user.schoolId
    const msg = await db.message.findFirst({ where: { id: params.id, ...(user.role !== 'SUPER_ADMIN' && sc ? { schoolId: sc } : {}) } })
    if (!msg) return err('Not found', 404)
    await db.message.delete({ where: { id: params.id } })
    return NextResponse.json({ ok: true })
  } catch (e:any) {
    if (e.message === 'Unauthorized') return err('Unauthorized', 401)
    return err('Server error', 500)
  }
}
