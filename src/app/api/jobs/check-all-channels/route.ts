import { handleError, ok } from '@/lib/api'
import { requireAdmin, verifyCronSecret } from '@/lib/auth'
import { checkAllChannels } from '@/lib/jobs/check-channels'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/jobs/check-all-channels
 * Auth: an admin session OR `Authorization: Bearer <CRON_SECRET>`.
 *
 * Detection is synchronous; analysis is queued for the worker.
 */
export async function POST(req: Request) {
  try {
    const header = req.headers.get('authorization') ?? req.headers.get('x-cron-secret')
    if (!verifyCronSecret(header)) await requireAdmin()

    const result = await checkAllChannels()
    return ok({
      channelsChecked: result.channelsChecked,
      newVideos: result.totalNewVideos,
      results: result.results,
      message:
        result.totalNewVideos > 0
          ? `Found ${result.totalNewVideos} new video${result.totalNewVideos === 1 ? '' : 's'} across ${result.channelsChecked} channels. Analysis queued.`
          : `Checked ${result.channelsChecked} channels — no new videos.`,
    })
  } catch (err) {
    return handleError(err)
  }
}
