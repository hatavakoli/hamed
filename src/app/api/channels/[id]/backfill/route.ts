import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { HttpError, handleError, ok, parseBody } from '@/lib/api'
import { requireAdmin } from '@/lib/auth'
import { backfillChannel } from '@/lib/jobs/check-channels'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

type Params = { params: Promise<{ id: string }> }

const BackfillSchema = z.object({ count: z.number().int().min(1).max(25).default(5) })

/**
 * POST /api/channels/[id]/backfill — analyse videos published BEFORE monitoring
 * started. Ignores the "newer than last processed" cutoff that normal checks use.
 */
export async function POST(req: Request, { params }: Params) {
  try {
    await requireAdmin()
    const { id } = await params

    const channel = await prisma.channel.findUnique({ where: { id } })
    if (!channel) throw new HttpError(404, 'Channel not found')

    const body = await parseBody(req, BackfillSchema)
    const result = await backfillChannel(id, body.count)
    if (result.error) throw new HttpError(502, result.error)

    return ok({
      newVideos: result.newVideos,
      skipped: result.skipped,
      message:
        result.newVideos > 0
          ? `Queued ${result.newVideos} past video${result.newVideos === 1 ? '' : 's'} for analysis.`
          : 'No further past videos were found that are not already stored.',
    })
  } catch (err) {
    return handleError(err)
  }
}
