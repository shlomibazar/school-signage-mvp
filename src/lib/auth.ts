import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import type { AuthUser, JWTPayload } from '@/types'

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? 'schoolscreen-dev-secret-change-in-prod')
const COOKIE = 'ss_token'

export async function signJWT(payload: Omit<JWTPayload, 'iat' | 'exp'>): Promise<string> {
  return new SignJWT(payload as any)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(SECRET)
}

export async function verifyJWT(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET)
    return payload as unknown as JWTPayload
  } catch { return null }
}

export async function getSession(): Promise<AuthUser | null> {
  try {
    const token = cookies().get(COOKIE)?.value
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

export function setAuthCookie(token: string) {
  cookies().set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  })
}

export function clearAuthCookie() {
  cookies().set(COOKIE, '', { maxAge: 0, path: '/' })
}
