import { prisma } from '@/lib/prisma'
import { HttpError, handleError, ok } from '@/lib/api'
import { requireAdmin } from '@/lib/auth'
import { checkChannel } from '@/lib/jobs/check-channels'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

type Params = { params: Promise<{ id: string }> }

/**
 * POST /api/channels/[id]/check — "Check now".
 *
 * Detection runs synchronously (a couple of fast YouTube calls) so the user
 * gets an immediate answer. The slow part — transcript + AI — is queued and
 * picked up by the worker within a minute.
 */
export async function POST(_req: Request, { params }: Params) {
  try {
    await requireAdmin()
    const { id } = await params

    const channel = await prisma.channel.findUnique({ where: { id } })
    if (!channel) throw new HttpError(404, 'Channel not found')

    const result = await checkChannel(id)
    if (result.error) throw new HttpError(502, result.error)

    return ok({
      newVideos: result.newVideos,
      skipped: result.skipped,
      message:
        result.newVideos > 0
          ? `Found ${result.newVideos} new video${result.newVideos === 1 ? '' : 's'}. Analysis has been queued.`
          : 'No new videos since the last check.',
    })
  } catch (err) {
    return handleError(err)
  }
}
