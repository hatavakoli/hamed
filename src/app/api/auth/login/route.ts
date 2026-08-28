import { cookies } from 'next/headers'
import { z } from 'zod'
import { SESSION_COOKIE, attemptLogin, sessionCookieOptions } from '@/lib/auth'
import { fail, handleError, ok, parseBody } from '@/lib/api'
import { createLogger } from '@/lib/logger'

const log = createLogger('auth')

const LoginSchema = z.object({
  email: z.string().min(1, 'Email is required'),
  password: z.string().min(1, 'Password is required'),
})

/** POST /api/auth/login  (public) */
export async function POST(req: Request) {
  try {
    const body = await parseBody(req, LoginSchema)
    const result = await attemptLogin(body.email, body.password)
    if (!result.ok) {
      log.warn('Failed login attempt', { email: body.email.slice(0, 40) })
      return fail(401, result.error)
    }
    const store = await cookies()
    store.set(SESSION_COOKIE, result.token, sessionCookieOptions())
    return ok({ email: body.email.trim().toLowerCase() })
  } catch (err) {
    return handleError(err)
  }
}
