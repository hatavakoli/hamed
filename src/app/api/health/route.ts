import { NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { checkDatabase } from '@/lib/db-status'

export const dynamic = 'force-dynamic'

/**
 * GET /api/health  (public — used by Docker's healthcheck)
 * Returns 200 when the app is up and the database answers, 503 otherwise.
 */
export async function GET() {
  const startedAt = Date.now()
  const db = await checkDatabase()

  // A reachable database with no tables is NOT healthy — the app cannot write
  // anything. Reporting that separately turns a confusing 500 later into an
  // obvious answer now.
  const status = !db.reachable ? 'degraded' : !db.schemaReady ? 'setup_required' : 'ok'

  const body = {
    status,
    version: '1.0.0',
    uptimeSeconds: Math.round(process.uptime()),
    responseTimeMs: Date.now() - startedAt,
    database: db.reachable ? 'up' : 'down',
    migrations: db.schemaReady ? 'applied' : 'missing',
    databaseError: db.error,
    hint: db.hint,
    mockMode: env.MOCK_MODE,
    timestamp: new Date().toISOString(),
  }

  return NextResponse.json(body, { status: status === 'ok' ? 200 : 503 })
}
