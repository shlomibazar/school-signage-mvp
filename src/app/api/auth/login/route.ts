import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { signJWT, setAuthCookie } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()
    if (!email || !password) return NextResponse.json({ error: 'נדרש אימייל וסיסמה' }, { status: 400 })

    const user = await db.user.findUnique({ where: { email: email.toLowerCase().trim() } })
    if (!user) return NextResponse.json({ error: 'אימייל או סיסמה שגויים' }, { status: 401 })

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return NextResponse.json({ error: 'אימייל או סיסמה שגויים' }, { status: 401 })

    const token = await signJWT({ sub: user.id, email: user.email, name: user.name, role: user.role, schoolId: user.schoolId })
    setAuthCookie(token)

    return NextResponse.json({ ok: true, user: { id: user.id, email: user.email, name: user.name, role: user.role, schoolId: user.schoolId } })
  } catch (e) {
    console.error('Login error:', e)
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}
