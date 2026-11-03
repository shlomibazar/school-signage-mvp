import { NextRequest, NextResponse } from 'next/server'
import { errorResponse } from '@/lib/apiErrors'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { MessageCreateSchema } from '@/lib/messageSchema'
function err(m:string,s:number){return NextResponse.json({error:m},{status:s})}

export async function GET() {
  try {
    const user = await requireRole('VIEWER')
    // Non-SUPER_ADMIN users only ever see their own school (none if they have no school).
    const messages = await db.message.findMany({
      where: user.role === 'SUPER_ADMIN' ? {} : { schoolId: user.schoolId ?? '__none__' },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ data: messages.map(m => ({ ...m, createdAt: m.createdAt.toISOString(), updatedAt: m.updatedAt.toISOString() })) })
  } catch (e) {
    return errorResponse(e, 'messages')
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole('EDITOR')
    // A message always belongs to the creator's school (never taken from the request).
    if (!user.schoolId) return err('No school', 400)
    const body = await req.json().catch(() => null)
    if (body === null) return err('Invalid JSON', 400)
    const data = MessageCreateSchema.parse(body)
    const msg = await db.message.create({ data: { ...data, schoolId: user.schoolId } })
    return NextResponse.json({ data: { ...msg, createdAt: msg.createdAt.toISOString(), updatedAt: msg.updatedAt.toISOString() } }, { status: 201 })
  } catch (e) {
    return errorResponse(e, 'messages')
  }
}
