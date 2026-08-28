import { fail, handleError, ok } from '@/lib/api'
import { verifyCronSecret } from '@/lib/auth'
import { checkAllChannels } from '@/lib/jobs/check-channels'
import { generateWeeklyDigest } from '@/lib/jobs/weekly-digest'
import { applyRetentionPolicy } from '@/lib/jobs/retention'
import { tick } from '@/lib/jobs/runner'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

type Params = { params: Promise<{ task: string }> }

/**
 * POST /api/cron/[task]  — for an EXTERNAL scheduler (system crontab, Vercel
 * Cron, GitHub Actions...) instead of the worker container.
 *
 * Requires `Authorization: Bearer <CRON_SECRET>`. Never uses a session, so it
 * cannot be triggered by a logged-in browser via CSRF.
 *
 * Tasks: check-channels | run-jobs | weekly-digest | retention
 */
export async function POST(req: Request, { params }: Params) {
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
        return ok({ task, ...(await tick({ limit: 5 })) })
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
