import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { signJWT, setAuthCookie } from '@/lib/auth'
import { loginAttemptBlocked, clearLoginAttempts } from '@/lib/loginRateLimit'

// Compared against when the e-mail is unknown, so both cases take the same bcrypt time and the
// response time does not reveal which addresses have accounts. (Hash of a random string.)
const DUMMY_HASH = '$2a$12$Z.C9uVYzOTbxXlGdNdQtrOeIBId4PhLu03a05IX7wxzAofFUgBs4W'
const INVALID = 'אימייל או סיסמה שגויים'

export async function POST(req: NextRequest) {
  try {
    let body: unknown
    try { body = await req.json() } catch { return NextResponse.json({ error: 'נדרש אימייל וסיסמה' }, { status: 400 }) }
    const { email, password } = (body ?? {}) as { email?: unknown; password?: unknown }
    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password || email.length > 254 || password.length > 256) {
      return NextResponse.json({ error: 'נדרש אימייל וסיסמה' }, { status: 400 })
    }
    const normalized = email.toLowerCase().trim()

    // Counted before the password check, so parallel attempts cannot exceed the limit.
    if (await loginAttemptBlocked(normalized)) {
      return NextResponse.json({ error: 'יותר מדי ניסיונות התחברות. נסה שוב בעוד מספר דקות' }, { status: 429 })
    }

    const user = await db.user.findUnique({ where: { email: normalized } })
    const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH)
    if (!user || !valid) return NextResponse.json({ error: INVALID }, { status: 401 })

    await clearLoginAttempts(normalized)
    const token = await signJWT({ sub: user.id, email: user.email, name: user.name, role: user.role, schoolId: user.schoolId })
    await setAuthCookie(token)

    return NextResponse.json({ ok: true, user: { id: user.id, email: user.email, name: user.name, role: user.role, schoolId: user.schoolId } })
  } catch (e) {
    console.error('Login error:', e)
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}
