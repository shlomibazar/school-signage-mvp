// src/app/api/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { db } from '@/lib/db'
import { signToken, setAuthCookie } from '@/lib/auth'

const LoginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
})

// Simple in-memory rate limiter (works per-instance; use Redis in production)
const loginAttempts = new Map<string, { count: number; resetAt: number }>()
const MAX_ATTEMPTS   = 10
const WINDOW_MS      = 15 * 60 * 1000 // 15 minutes

function checkRateLimit(ip: string): boolean {
  const now    = Date.now()
  const record = loginAttempts.get(ip)
  if (!record || now > record.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return true // allowed
  }
  if (record.count >= MAX_ATTEMPTS) return false // blocked
  record.count++
  return true
}

export async function POST(req: NextRequest) {
  // Rate limit by IP
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'יותר מדי ניסיונות כניסה. נסה שוב בעוד 15 דקות.' },
      { status: 429 },
    )
  }

  try {
    const body = await req.json()
    const { email, password } = LoginSchema.parse(body)

    const user = await db.user.findUnique({ where: { email } })

    // Constant-time check to avoid timing attacks
    const dummyHash = '$2a$12$dummy.hash.to.prevent.timing.attack.on.email.enum'
    const validPassword = user
      ? await bcrypt.compare(password, user.passwordHash)
      : await bcrypt.compare(password, dummyHash).then(() => false)

    if (!user || !validPassword) {
      return NextResponse.json(
        { error: 'אימייל או סיסמה שגויים' },
        { status: 401 },
      )
    }

    const token = await signToken({
      sub:      user.id,
      email:    user.email,
      name:     user.name,
      role:     user.role,
      schoolId: user.schoolId,
    })

    const response = NextResponse.json({
      ok:   true,
      user: { id: user.id, name: user.name, role: user.role },
    })
    setAuthCookie(response, token)
    return response
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'נתונים לא תקינים' }, { status: 400 })
    }
    console.error('Login error:', err)
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}
