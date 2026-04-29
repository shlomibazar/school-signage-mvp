// src/middleware.ts
// Route protection — admin routes require auth, /screen/[slug] is public

import { NextRequest, NextResponse } from 'next/server'
import { getTokenFromRequest } from '@/lib/auth'

const PUBLIC_PATHS = [
  '/auth/login',
  '/screen',       // /screen/[slug] — public display
  '/api/auth',     // login/logout endpoints
  '/_next',
  '/favicon.ico',
]

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Allow public paths
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // All /admin/* routes and /api/* (except /api/auth) require auth
  const payload = await getTokenFromRequest(req)

  if (!payload) {
    const loginUrl = new URL('/auth/login', req.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Attach user info to request headers for server components
  const headers = new Headers(req.headers)
  headers.set('x-user-id', payload.sub)
  headers.set('x-user-role', payload.role)
  headers.set('x-school-id', payload.schoolId ?? '')

  return NextResponse.next({ request: { headers } })
}

export const config = {
  matcher: [
    /*
     * Match all paths except static files.
     * This applies auth logic only to real pages/API routes.
     */
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
}
