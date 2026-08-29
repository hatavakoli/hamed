import { z } from 'zod'
import { handleError, ok, parseBody } from '@/lib/api'
import { requireAdmin, verifyCronSecret } from '@/lib/auth'
import { tick } from '@/lib/jobs/runner'

export const dynamic = 'force-dynamic'
// Vercel's Hobby plan caps functions at 60s; a higher value fails the deploy.
// Raise this (and JOB_BUDGET_MS below) if you are on a plan that allows more.
export const maxDuration = 60
/** Stop starting new jobs with ~15s of headroom so nothing is cut off mid-run. */
const JOB_BUDGET_MS = 45_000

const BodySchema = z.object({ limit: z.number().int().min(1).max(10).default(3) })

/**
 * POST /api/jobs/run — drain the queue right now.
 *
 * The worker container does this every minute. This endpoint exists so you can
 * develop with `npm run dev` alone (no worker) and still push jobs through, and
 * so an external cron can drive the app if you prefer that to a worker.
 */
export async function POST(req: Request) {
  try {
    const header = req.headers.get('authorization') ?? req.headers.get('x-cron-secret')
    if (!verifyCronSecret(header)) await requireAdmin()

    const body = await parseBody(req, BodySchema).catch(() => ({ limit: 3 }))
    const result = await tick({ limit: body.limit, budgetMs: JOB_BUDGET_MS })

    return ok({
      ...result,
      message: result.ran
        ? `Processed ${result.ran} queued job${result.ran === 1 ? '' : 's'}.` +
          (result.stoppedEarly ? ' More are still queued — run this again.' : '')
        : 'Nothing was waiting in the queue.',
    })
  } catch (err) {
    return handleError(err)
  }
}
