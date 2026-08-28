import { prisma } from '@/lib/prisma'
import { HttpError, handleError, ok } from '@/lib/api'
import { requireAdmin } from '@/lib/auth'
import { enqueueJob } from '@/lib/jobs/helpers'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/**
 * POST /api/videos/[id]/regenerate-analysis
 * Queues a forced re-run. The worker picks it up within a minute; if you are
 * running without a worker, press "Run queued jobs now" on the dashboard.
 */
export async function POST(_req: Request, { params }: Params) {
  try {
    await requireAdmin()
    const { id } = await params

    const video = await prisma.video.findUnique({ where: { id } })
    if (!video) throw new HttpError(404, 'Video not found')

    const { job, created } = await enqueueJob({ jobType: 'PROCESS_VIDEO', videoId: id, payload: { force: true } })
    await prisma.video.update({ where: { id }, data: { analysisStatus: 'PENDING' } })

    return ok({
      jobId: job.id,
      queued: created,
      message: created ? 'Re-analysis queued.' : 'A re-analysis is already queued for this video.',
    })
  } catch (err) {
    return handleError(err)
  }
}
