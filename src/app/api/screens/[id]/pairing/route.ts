import { NextRequest, NextResponse } from 'next/server'
import { randomInt } from 'node:crypto'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { hashPairingCode } from '@/lib/pairing'

export const runtime = 'nodejs'

type Context = { params: Promise<{ id: string }> }
async function authorizedScreen(id: string) {
  const user = await requireRole('SCHOOL_ADMIN')
  const screen = await db.screen.findFirst({
    where: { id, ...(user.role === 'SUPER_ADMIN' ? {} : { schoolId: user.schoolId || '__none__' }) },
    select: { id: true },
  })
  return screen
}
function failure(error: unknown) {
  if (error instanceof Error && error.message === 'Unauthorized') return NextResponse.json({ error: 'נדרשת התחברות' }, { status: 401 })
  if (error instanceof Error && error.message === 'Forbidden') return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  console.error('pairing admin', error)
  return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
}
export async function POST(_req: NextRequest, { params }: Context) {
  try {
    const { id } = await params
    if (!await authorizedScreen(id)) return NextResponse.json({ error: 'מסך לא נמצא' }, { status: 404 })
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 10 * 60_000)
    // Generating a new code invalidates any previous code for this screen.
    for (let i = 0; i < 10; i++) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
      try {
        await db.$transaction(async tx => {
          await tx.screenPairingCode.deleteMany({ where: { screenId: id } })
          await tx.screenPairingCode.create({ data: { screenId: id, codeHash: hashPairingCode(code), expiresAt } })
        })
        return NextResponse.json({ code, expiresAt: expiresAt.toISOString() }, { headers: { 'Cache-Control': 'no-store' } })
      } catch (err: any) {
        if (err?.code !== 'P2002') throw err
      }
    }
    return NextResponse.json({ error: 'נסה שוב' }, { status: 503 })
  } catch (err) { return failure(err) }
}
export async function DELETE(_req: NextRequest, { params }: Context) {
  try {
    const { id } = await params
    if (!await authorizedScreen(id)) return NextResponse.json({ error: 'מסך לא נמצא' }, { status: 404 })
    await db.screenPairingCode.deleteMany({ where: { screenId: id } })
    return NextResponse.json({ ok: true })
  } catch (err) { return failure(err) }
}
