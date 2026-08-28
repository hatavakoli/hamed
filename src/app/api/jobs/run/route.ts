import { z } from 'zod'
import { handleError, ok, parseBody } from '@/lib/api'
import { requireAdmin, verifyCronSecret } from '@/lib/auth'
import { tick } from '@/lib/jobs/runner'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

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
    const result = await tick({ limit: body.limit })

    return ok({
      ...result,
      message: result.ran ? `Processed ${result.ran} queued job${result.ran === 1 ? '' : 's'}.` : 'Nothing was waiting in the queue.',
    })
  } catch (err) {
    return handleError(err)
  }
}
