import { cache } from 'react'
import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import type { AuthUser, JWTPayload } from '@/types'

const COOKIE = 'ss_token'
// The old public fallback value is rejected so tokens signed with it can never be accepted again.
const KNOWN_INSECURE_SECRET = 'schoolscreen-dev-secret-change-in-prod'
let secretErrorLogged = false

// Read lazily so a missing secret fails requests (sign throws, verify rejects) instead of the build.
function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET
  if (!secret || secret === KNOWN_INSECURE_SECRET) {
    if (!secretErrorLogged) {
      secretErrorLogged = true
      console.error('JWT_SECRET is missing or insecure; authentication is disabled until it is configured.')
    }
    throw new Error('JWT_SECRET is not configured')
  }
  return new TextEncoder().encode(secret)
}

export async function signJWT(payload: Omit<JWTPayload, 'iat' | 'exp'>): Promise<string> {
  // iatMs: issue time in milliseconds (iat has whole seconds only), so a change to the user
  // in the same second as a login is still detected by getSession.
  return new SignJWT({ ...payload, iatMs: Date.now() } as any)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getJwtSecret())
}

export async function verifyJWT(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret())
    return payload as unknown as JWTPayload
  } catch { return null }
}

// The token only says who the user is. Role and school are read from the database on every
// request, so a role or school change applies at once and a deleted user loses access. A token
// issued before the user's record last changed (password change, role or school change) is no
// longer accepted; change-password issues a fresh one for the session that made the change.
// One primary-key lookup per request (deduplicated within a server render by React cache).
// The proxy only checks the signature; this check runs where requireRole/getSession is used.
export const getSession = cache(async (): Promise<AuthUser | null> => {
  try {
    const token = (await cookies()).get(COOKIE)?.value
    if (!token) return null
    const payload = await verifyJWT(token)
    if (!payload) return null
    const { db } = await import('@/lib/db')
    const user = await db.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, role: true, schoolId: true, updatedAt: true },
    })
    if (!user) return null
    // Tokens from before this change carry only iat (seconds); they are compared at that precision.
    const issuedAtMs = (payload as { iatMs?: unknown }).iatMs
    if (typeof issuedAtMs === 'number') {
      if (issuedAtMs < user.updatedAt.getTime()) return null
    } else if (typeof payload.iat !== 'number' || payload.iat < Math.floor(user.updatedAt.getTime() / 1000)) return null
    return { id: user.id, email: user.email, name: user.name, role: user.role, schoolId: user.schoolId }
  } catch { return null }
})

// Alias — used by some pages
export const getCurrentUser = getSession

export async function requireRole(minRole: 'VIEWER' | 'EDITOR' | 'SCHOOL_ADMIN' | 'SUPER_ADMIN'): Promise<AuthUser> {
  const user = await getSession()
  if (!user) throw new Error('Unauthorized')
  const levels = { VIEWER: 0, EDITOR: 1, SCHOOL_ADMIN: 2, SUPER_ADMIN: 3 }
  if (levels[user.role] < levels[minRole]) throw new Error('Forbidden')
  return user
}

export async function setAuthCookie(token: string) {
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  })
}

export async function clearAuthCookie() {
  (await cookies()).set(COOKIE, '', { maxAge: 0, path: '/' })
}
