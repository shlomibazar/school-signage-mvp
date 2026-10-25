import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
function err(m:string,s:number){return NextResponse.json({error:m},{status:s})}

const Schema = z.object({
  title:     z.string().min(1),
  body:      z.string().min(1),
  priority:  z.enum(['info','warning','urgent']).default('info'),
  icon:      z.string().default('📢'),
  bgColor:   z.string().default('#1e3a5f'),
  textColor: z.string().default('#ffffff'),
  active:    z.boolean().default(true),
})

export async function GET() {
  try {
    const user = await requireRole('VIEWER')
    const schoolId = user.role === 'SUPER_ADMIN' ? undefined : (user.schoolId ?? undefined)
    const messages = await db.message.findMany({
      where: schoolId ? { schoolId } : {},
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ data: messages.map(m => ({ ...m, createdAt: m.createdAt.toISOString(), updatedAt: m.updatedAt.toISOString() })) })
  } catch (e:any) {
    if (e.message === 'Unauthorized') return err('Unauthorized', 401)
    return err('Server error', 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole('EDITOR')
    if (!user.schoolId && user.role !== 'SUPER_ADMIN') return err('No school', 400)
    const body = await req.json()
    const data = Schema.parse(body)
    const msg = await db.message.create({ data: { ...data, schoolId: user.schoolId! } })
    return NextResponse.json({ data: { ...msg, createdAt: msg.createdAt.toISOString(), updatedAt: msg.updatedAt.toISOString() } }, { status: 201 })
  } catch (e:any) {
    if (e.message === 'Unauthorized') return err('Unauthorized', 401)
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.errors }, { status: 400 })
    return err('Server error', 500)
  }
}
