import { handleError, ok } from '@/lib/api'
import { requireAdmin } from '@/lib/auth'
import { getDashboardSummary } from '@/lib/dashboard'

export const dynamic = 'force-dynamic'

/** GET /api/dashboard/summary — counters, latest reports and recent job activity. */
export async function GET() {
  try {
    await requireAdmin()
    return ok(await getDashboardSummary())
  } catch (err) {
    return handleError(err)
  }
}
