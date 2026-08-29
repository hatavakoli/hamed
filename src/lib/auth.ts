import crypto from 'node:crypto'
import { cookies } from 'next/headers'
import { prisma } from './prisma'
import { env } from './env'
import { safeEqual, verifyPassword } from './crypto'
import { getPreferences } from './settings'
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from './session-cookie'

/**
 * Minimal single-admin session:  base64(payload).hmacSHA256(payload)
 * stored in an HttpOnly cookie. No third-party auth library needed.
 *
 * SECURITY NOTE: `src/middleware.ts` only checks that a cookie *exists* (it
 * runs on the Edge runtime where node:crypto is unavailable). The real
 * signature check happens here, and every protected API route calls
 * `requireAdmin()`. Never rely on the middleware alone.
 */

export { SESSION_COOKIE }

export type Session = { email: string; role: 'ADMIN' | 'MEMBER'; exp: number }

function sign(data: string): string {
  return crypto.createHmac('sha256', env.NEXTAUTH_SECRET).update(data).digest('base64url')
}

export function createSessionToken(email: string, role: 'ADMIN' | 'MEMBER' = 'ADMIN'): string {
  const payload: Session = { email, role, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${sign(body)}`
}

export function verifySessionToken(token?: string | null): Session | null {
  if (!token) return null
  const [body, signature] = token.split('.')
  if (!body || !signature) return null
  if (!safeEqual(signature, sign(body))) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Session
    if (!payload.exp || payload.exp * 1000 < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies()
  return verifySessionToken(store.get(SESSION_COOKIE)?.value)
}

/** Throws `UnauthorizedError`; `withAdmin()` in lib/api.ts turns that into a 401. */
export class UnauthorizedError extends Error {
  constructor(message = 'Authentication required') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

export async function requireAdmin(): Promise<Session> {
  const session = await getSession()
  if (!session) throw new UnauthorizedError()
  return session
}

export type LoginResult = { ok: true; token: string } | { ok: false; error: string }

/**
 * Credentials are checked against, in order:
 *   1. the `users` table (scrypt hash) -- set by the Setup page
 *   2. ADMIN_EMAIL + ADMIN_PASSWORD environment variables
 */
export async function attemptLogin(email: string, password: string): Promise<LoginResult> {
  const normalized = email.trim().toLowerCase()

  const user = await prisma.user.findUnique({ where: { email: normalized } })
  if (user?.passwordHash) {
    if (verifyPassword(password, user.passwordHash)) {
      return { ok: true, token: createSessionToken(user.email, user.role) }
    }
    return { ok: false, error: 'Invalid email or password.' }
  }

  const prefs = await getPreferences().catch(() => null)
  const adminPassword = env.ADMIN_PASSWORD

  // Both addresses count as "the admin": the one in .env AND the one saved in
  // Settings/Setup. Otherwise changing your email in the setup wizard without
  // also choosing a password would lock you out on the next sign-in, because
  // ADMIN_EMAIL from .env would silently keep winning.
  // Same privilege either way — only a signed-in admin can change the saved one.
  const adminEmails = new Set(
    [env.ADMIN_EMAIL, prefs?.adminEmail].map((value) => (value ?? '').trim().toLowerCase()).filter(Boolean),
  )

  if (!adminEmails.size || !adminPassword) {
    return {
      ok: false,
      error: 'No admin account configured. Set ADMIN_EMAIL and ADMIN_PASSWORD in your .env file, then restart.',
    }
  }
  if (adminEmails.has(normalized) && safeEqual(password, adminPassword)) {
    return { ok: true, token: createSessionToken(normalized, 'ADMIN') }
  }
  return { ok: false, error: 'Invalid email or password.' }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  }
}

/** Used by /api/cron/* so an external scheduler can trigger jobs without a session. */
export function verifyCronSecret(header: string | null): boolean {
  const expected = env.CRON_SECRET
  if (!expected) return false
  const provided = header?.replace(/^Bearer\s+/i, '') ?? ''
  return safeEqual(provided, expected)
}
