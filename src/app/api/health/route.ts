import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'

/**
 * GET /api/health  (public — used by Docker's healthcheck)
 * Returns 200 when the app is up and the database answers, 503 otherwise.
 */
export async function GET() {
  const startedAt = Date.now()
  let database: 'up' | 'down' = 'down'
  let databaseError: string | null = null

  try {
    await prisma.$queryRaw`SELECT 1`
    database = 'up'
  } catch (err) {
    databaseError = err instanceof Error ? err.message.slice(0, 200) : 'unknown error'
  }

  const body = {
    status: database === 'up' ? 'ok' : 'degraded',
    version: '1.0.0',
    uptimeSeconds: Math.round(process.uptime()),
    responseTimeMs: Date.now() - startedAt,
    database,
    databaseError,
    mockMode: env.MOCK_MODE,
    timestamp: new Date().toISOString(),
  }

  return NextResponse.json(body, { status: database === 'up' ? 200 : 503 })
}
