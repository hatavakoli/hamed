import { handleError, ok } from '@/lib/api'
import { requireAdmin, verifyCronSecret } from '@/lib/auth'
import { generateWeeklyDigest } from '@/lib/jobs/weekly-digest'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** POST /api/jobs/weekly-digest — build and send this week's digest now. */
export async function POST(req: Request) {
  try {
    const header = req.headers.get('authorization') ?? req.headers.get('x-cron-secret')
    if (!verifyCronSecret(header)) await requireAdmin()

    const result = await generateWeeklyDigest()
    return ok({
      ...result,
      message: `Digest generated from ${result.videoCount} video${result.videoCount === 1 ? '' : 's'}. ${result.emailMessage}`,
    })
  } catch (err) {
    return handleError(err)
  }
}
