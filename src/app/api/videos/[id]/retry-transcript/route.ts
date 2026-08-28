import { prisma } from '@/lib/prisma'
import { HttpError, handleError, ok } from '@/lib/api'
import { requireAdmin } from '@/lib/auth'
import { retrieveTranscript } from '@/lib/jobs/transcript-job'
import { enqueueJob } from '@/lib/jobs/helpers'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

type Params = { params: Promise<{ id: string }> }

/**
 * POST /api/videos/[id]/retry-transcript — manual retry.
 * Resets the automatic retry counter, and if the transcript arrives it queues a
 * fresh (higher-confidence) analysis.
 */
export async function POST(_req: Request, { params }: Params) {
  try {
    await requireAdmin()
    const { id } = await params

    const video = await prisma.video.findUnique({ where: { id } })
    if (!video) throw new HttpError(404, 'Video not found')

    const outcome = await retrieveTranscript(id, true)

    let queuedReanalysis = false
    if (outcome.status === 'AVAILABLE') {
      const { created } = await enqueueJob({ jobType: 'PROCESS_VIDEO', videoId: id, payload: { force: true } })
      queuedReanalysis = created
    }

    return ok({
      status: outcome.status,
      provider: outcome.provider,
      reason: outcome.reason,
      characters: outcome.characters,
      willRetryAt: outcome.willRetryAt,
      queuedReanalysis,
      message:
        outcome.status === 'AVAILABLE'
          ? `Transcript retrieved (${outcome.characters.toLocaleString()} characters). A fresh analysis has been queued.`
          : outcome.status === 'UNAVAILABLE'
            ? `No transcript available: ${outcome.reason}`
            : `Attempt failed: ${outcome.reason}`,
    })
  } catch (err) {
    return handleError(err)
  }
}
