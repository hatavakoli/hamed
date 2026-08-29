import { prisma } from './prisma'
import { safeErrorMessage } from './logger'

/**
 * Is the database usable?
 *
 * Two separate questions, because they have different fixes:
 *   reachable   - can we open a connection at all?      -> is Postgres running / is DATABASE_URL right?
 *   schemaReady - do our tables actually exist?         -> have migrations been applied?
 *
 * The second one matters more than it looks: reads in `settings.ts` swallow
 * errors so the UI can still render on a fresh install, which means a database
 * with no tables looks perfectly healthy right up until the first write fails.
 */

export type DatabaseStatus = {
  reachable: boolean
  schemaReady: boolean
  error: string | null
  hint: string | null
}

const REQUIRED_TABLES = ['users', 'channels', 'videos', 'app_settings']

export async function checkDatabase(): Promise<DatabaseStatus> {
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch (err) {
    return {
      reachable: false,
      schemaReady: false,
      error: safeErrorMessage(err),
      hint:
        'The app cannot reach PostgreSQL. Check that your database is running ' +
        '(docker compose -f docker-compose.dev.yml up -d) and that DATABASE_URL in .env is correct.',
    }
  }

  try {
    const rows = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY(${REQUIRED_TABLES})
    `
    const found = new Set(rows.map((r) => r.table_name))
    const missing = REQUIRED_TABLES.filter((t) => !found.has(t))

    if (missing.length) {
      return {
        reachable: true,
        schemaReady: false,
        error: `Database tables are missing: ${missing.join(', ')}.`,
        hint: 'Migrations have not been applied to this database yet. Run:  npm run prisma:deploy',
      }
    }
    return { reachable: true, schemaReady: true, error: null, hint: null }
  } catch (err) {
    return {
      reachable: true,
      schemaReady: false,
      error: safeErrorMessage(err),
      hint: 'Could not inspect the database schema. Try running:  npm run prisma:deploy',
    }
  }
}
