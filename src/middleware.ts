import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE } from '@/lib/session-cookie'

/**
 * UX-level gate only.
 *
 * Middleware runs on the Edge runtime, where node:crypto is unavailable, so it
 * cannot verify the cookie's HMAC signature. It therefore only checks that a
 * session cookie is PRESENT and redirects to /login when it is not.
 *
 * Real enforcement lives in `requireAdmin()`, which every protected page and
 * API route calls. A forged cookie gets past this file and is rejected there.
 */

const PUBLIC_PATHS = ['/login', '/setup', '/api/health', '/api/auth/login', '/api/setup', '/api/cron']

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next()
  }

  const hasCookie = Boolean(req.cookies.get(SESSION_COOKIE)?.value)
  if (hasCookie) return NextResponse.next()

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 })
  }

  const loginUrl = new URL('/login', req.url)
  if (pathname !== '/') loginUrl.searchParams.set('next', pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  // Everything except Next.js internals and static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)'],
}
