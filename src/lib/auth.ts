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
  return new SignJWT(payload as any)
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

export async function getSession(): Promise<AuthUser | null> {
  try {
    const token = (await cookies()).get(COOKIE)?.value
    if (!token) return null
    const payload = await verifyJWT(token)
    if (!payload) return null
    return { id: payload.sub, email: payload.email, name: payload.name, role: payload.role, schoolId: payload.schoolId }
  } catch { return null }
}

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
