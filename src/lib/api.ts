import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { ZodError, type ZodTypeAny, type z } from 'zod'
import { UnauthorizedError, requireAdmin, verifyCronSecret, type Session } from './auth'
import { YouTubeError } from './youtube/types'
import { AiError } from './ai/provider'
import { safeErrorMessage, createLogger } from './logger'
import { serialize } from './prisma'

const log = createLogger('api')

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data: serialize(data) }, { status })
}

export function fail(status: number, error: string, details?: unknown) {
  return NextResponse.json({ ok: false, error, ...(details ? { details } : {}) }, { status })
}

/** Turn any thrown value into a safe JSON response. */
export function handleError(err: unknown) {
  if (err instanceof UnauthorizedError) return fail(401, 'Authentication required')
  if (err instanceof HttpError) return fail(err.status, err.message)
  if (err instanceof ZodError) {
    return fail(400, 'Validation failed', err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })))
  }
  // These carry messages written for humans and never contain a key, so they
  // are safe to surface directly instead of hiding behind a generic 500.
  if (err instanceof YouTubeError) {
    return fail(err.retryable ? 503 : 400, safeErrorMessage(err))
  }
  if (err instanceof AiError) {
    return fail(err.retryable ? 503 : 400, safeErrorMessage(err))
  }
  const database = describeDatabaseError(err)
  if (database) {
    log.error('Database error', { message: database })
    return fail(503, database)
  }

  const message = safeErrorMessage(err)
  log.error('Unhandled API error', { message })
  return fail(500, 'Something went wrong on the server. Check the server logs for details.')
}

type Handler<Ctx> = (ctx: Ctx & { session: Session }) => Promise<Response> | Response

/** Wraps an admin-only route: verifies the session and normalises errors. */
export function withAdmin<Ctx = Record<string, never>>(handler: Handler<Ctx>) {
  return async (ctx: Ctx): Promise<Response> => {
    try {
      const session = await requireAdmin()
      return await handler({ ...(ctx as Ctx), session })
    } catch (err) {
      return handleError(err)
    }
  }
}

/** Route that accepts EITHER an admin session OR a valid CRON_SECRET header. */
export function withAdminOrCron(handler: () => Promise<Response> | Response) {
  return async (req: Request): Promise<Response> => {
    try {
      const header = req.headers.get('authorization') ?? req.headers.get('x-cron-secret')
      if (!verifyCronSecret(header)) await requireAdmin()
      return await handler()
    } catch (err) {
      return handleError(err)
    }
  }
}

/**
 * Note the generic: we infer from the SCHEMA, not from a target type. That way
 * Zod `.default()` values are reflected in the result type (required, not
 * optional), which is what callers actually get back.
 */
export async function parseBody<S extends ZodTypeAny>(req: Request, schema: S): Promise<z.infer<S>> {
  let json: unknown
  try {
    json = await req.json()
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON')
  }
  return schema.parse(json)
}

export function parseQuery<S extends ZodTypeAny>(url: string, schema: S): z.infer<S> {
  const params = Object.fromEntries(new URL(url).searchParams.entries())
  return schema.parse(params)
}

/**
 * Turns Prisma's error codes into something a person can act on.
 *
 * Without this, "you forgot to run the migrations" reaches the browser as
 * "Something went wrong on the server" — which is true, unhelpful, and sends
 * people digging through logs for a one-command fix.
 */
export function describeDatabaseError(err: unknown): string | null {
  if (err instanceof Prisma.PrismaClientInitializationError) {
    if (err.errorCode === 'P1000') {
      return 'The database rejected our credentials. Check the username and password in DATABASE_URL.'
    }
    if (err.errorCode === 'P1003') {
      return 'That database does not exist yet. Create it, then run: npm run prisma:deploy'
    }
    return 'Cannot reach the database. Check that PostgreSQL is running and that DATABASE_URL in your .env is correct.'
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2021':
      case 'P2022':
        return 'The database is reachable but its tables are missing. Run the migrations:  npm run prisma:deploy'
      case 'P1001':
        return 'Cannot reach the database. Check that PostgreSQL is running and that DATABASE_URL in your .env is correct.'
      case 'P2002':
        return 'That record already exists.'
      case 'P2025':
        return 'That record no longer exists.'
      default:
        return null
    }
  }
  return null
}
