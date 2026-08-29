import { fail, handleError, ok } from '@/lib/api'
import { verifyCronSecret } from '@/lib/auth'
import { checkAllChannels } from '@/lib/jobs/check-channels'
import { generateWeeklyDigest } from '@/lib/jobs/weekly-digest'
import { applyRetentionPolicy } from '@/lib/jobs/retention'
import { tick } from '@/lib/jobs/runner'

export const dynamic = 'force-dynamic'
// Kept at or below Vercel's Hobby limit so the deployment is accepted there.
export const maxDuration = 60
const JOB_BUDGET_MS = 45_000

type Params = { params: Promise<{ task: string }> }

/**
 * GET|POST /api/cron/[task]  — for an EXTERNAL scheduler (system crontab,
 * Vercel Cron, GitHub Actions...) instead of the worker container.
 *
 * Requires `Authorization: Bearer <CRON_SECRET>`. It never accepts a session
 * cookie, so a logged-in browser cannot trigger it via CSRF — which is also why
 * exposing GET is safe here: a cross-origin request cannot set that header.
 *
 * GET exists because Vercel Cron only ever sends GET requests.
 *
 * Tasks: check-channels | run-jobs | weekly-digest | retention
 */
export async function GET(req: Request, ctx: Params) {
  return handle(req, ctx)
}

export async function POST(req: Request, ctx: Params) {
  return handle(req, ctx)
}

async function handle(req: Request, { params }: Params) {
  try {
    const header = req.headers.get('authorization') ?? req.headers.get('x-cron-secret')
    if (!verifyCronSecret(header)) {
      return fail(401, 'Invalid or missing CRON_SECRET.')
    }
    const { task } = await params

    switch (task) {
      case 'check-channels': {
        const result = await checkAllChannels()
        return ok({ task, channelsChecked: result.channelsChecked, newVideos: result.totalNewVideos })
      }
      case 'run-jobs': {
        return ok({ task, ...(await tick({ limit: 5, budgetMs: JOB_BUDGET_MS })) })
      }
      case 'weekly-digest': {
        return ok({ task, ...(await generateWeeklyDigest()) })
      }
      case 'retention': {
        return ok({ task, ...(await applyRetentionPolicy()) })
      }
      default:
        return fail(404, `Unknown cron task "${task}". Use check-channels, run-jobs, weekly-digest or retention.`)
    }
  } catch (err) {
    return handleError(err)
  }
}
