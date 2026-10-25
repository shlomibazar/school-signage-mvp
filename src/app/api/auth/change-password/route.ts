import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return error('יש להתחבר למערכת', 401)

    // Reject cross-origin browser requests. The host check also supports reverse proxies.
    const origin = req.headers.get('origin')
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host')
    if (!origin || !host) return error('בקשה ממקור לא מורשה', 403)
    try {
      if (new URL(origin).host.toLowerCase() !== host.toLowerCase()) {
        return error('בקשה ממקור לא מורשה', 403)
      }
    } catch {
      return error('בקשה ממקור לא מורשה', 403)
    }

    let body: unknown
    try { body = await req.json() } catch { return error('נתוני בקשה לא תקינים', 400) }
    if (!body || typeof body !== 'object') return error('נתוני בקשה לא תקינים', 400)
    const data = body as Record<string, unknown>
    const { currentPassword, newPassword, confirmPassword } = data

    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || typeof confirmPassword !== 'string') {
      return error('יש למלא את כל השדות', 400)
    }
    if (newPassword.length < 8 || newPassword.length > 128) {
      return error('הסיסמה החדשה חייבת להכיל בין 8 ל־128 תווים', 400)
    }
    if (newPassword !== confirmPassword) return error('אימות הסיסמה אינו תואם', 400)
    if (newPassword === currentPassword) return error('יש לבחור סיסמה שונה מהסיסמה הנוכחית', 400)

    const user = await db.user.findUnique({
      where: { id: session.id },
      select: { id: true, passwordHash: true },
    })
    if (!user) return error('המשתמש לא נמצא', 404)

    const valid = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!valid) return error('הסיסמה הנוכחית שגויה', 400)

    const passwordHash = await bcrypt.hash(newPassword, 12)
    // Prevent overwriting a password that was changed in another request.
    const updated = await db.user.updateMany({
      where: { id: user.id, passwordHash: user.passwordHash },
      data: { passwordHash },
    })
    if (updated.count !== 1) return error('הסיסמה השתנתה בינתיים. נסה שוב', 409)

    return NextResponse.json({ success: true, message: 'הסיסמה עודכנה בהצלחה' })
  } catch (e) {
    console.error('Change password failed:', e)
    return error('אירעה שגיאה בעדכון הסיסמה', 500)
  }
}
