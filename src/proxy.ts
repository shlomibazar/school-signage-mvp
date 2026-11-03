// src/proxy.ts
import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'

const PUBLIC_PATHS = ['/auth/login', '/auth/logout', '/screen/', '/api/auth/', '/api/public/']
// Read-only services used by public TV screens. Exact paths, GET/HEAD only;
// any other method still requires a login (and the routes only implement GET).
const PUBLIC_READ_ONLY_PATHS = new Set(['/api/header-weather', '/api/weekly-parasha', '/api/rss'])

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Allow public paths
  const isPublic = PUBLIC_PATHS.some(p => pathname.startsWith(p))
  if (isPublic) return NextResponse.next()
  if (PUBLIC_READ_ONLY_PATHS.has(pathname) && (req.method === 'GET' || req.method === 'HEAD')) return NextResponse.next()

  // Only protect /admin/* and /api/* (except public above)
  const isProtected = pathname.startsWith('/admin') || pathname.startsWith('/api')
  if (!isProtected) return NextResponse.next()

  // Read JWT from cookie
  const token = req.cookies.get('ss_token')?.value
  if (!token) {
    if (pathname.startsWith('/api')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const loginUrl = new URL('/auth/login', req.url)
    loginUrl.searchParams.set('from', pathname)
    return NextResponse.redirect(loginUrl)
  }

  const payload = await verifyJWT(token)
  if (!payload) {
    if (pathname.startsWith('/api')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/auth/login', req.url))
  }

  return NextResponse.next()
}

// The upload endpoints (POST /api/media, announcement attachments) are excluded from the
// matcher: Next buffers the body of every request that passes through the proxy and cuts it at
// 10 MB (proxyClientMaxBodySize), which broke video and PDF uploads. Both routes call
// requireRole() before reading the body, so they stay authenticated.
export const config = {
  matcher: ['/admin/:path*', '/api/((?!media$|announcements/[^/]+/attachments$).*)'],
}
