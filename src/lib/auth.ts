// src/lib/auth.ts
// JWT-based auth using jose (Edge-compatible)

import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import type { JWTPayload, AuthUser, Role } from '@/types'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'change-me-in-production-please-use-long-random-secret'
)
const COOKIE_NAME = 'signage_session'
const TOKEN_EXPIRES = '7d'

// ─── Token ───────────────────────────────────────────────

export async function signToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRES)
    .sign(JWT_SECRET)
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return payload as unknown as JWTPayload
  } catch {
    return null
  }
}

// ─── Cookie helpers ───────────────────────────────────────

export function setAuthCookie(response: NextResponse, token: string): void {
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  })
}

export function clearAuthCookie(response: NextResponse): void {
  response.cookies.delete(COOKIE_NAME)
}

// ─── Get current user ────────────────────────────────────

export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null
  const payload = await verifyToken(token)
  if (!payload) return null
  return {
    id: payload.sub,
    email: payload.email,
    name: payload.name,
    role: payload.role,
    schoolId: payload.schoolId,
  }
}

export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser()
  if (!user) throw new Error('Unauthorized')
  return user
}

export async function requireRole(role: Role): Promise<AuthUser> {
  const user = await requireUser()
  const hierarchy: Role[] = ['VIEWER', 'EDITOR', 'SCHOOL_ADMIN', 'SUPER_ADMIN']
  if (hierarchy.indexOf(user.role) < hierarchy.indexOf(role)) {
    throw new Error('Forbidden')
  }
  return user
}

// ─── Middleware helper ────────────────────────────────────

export async function getTokenFromRequest(req: NextRequest): Promise<JWTPayload | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return null
  return verifyToken(token)
}

// ─── Role guards ─────────────────────────────────────────

export const canEdit = (role: Role) =>
  ['EDITOR', 'SCHOOL_ADMIN', 'SUPER_ADMIN'].includes(role)

export const canAdmin = (role: Role) =>
  ['SCHOOL_ADMIN', 'SUPER_ADMIN'].includes(role)

export const isSuperAdmin = (role: Role) => role === 'SUPER_ADMIN'
