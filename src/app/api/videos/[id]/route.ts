import { prisma } from '@/lib/prisma'
import { HttpError, handleError, ok } from '@/lib/api'
import { requireAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/** GET /api/videos/[id] — full detail: metadata, transcript, report, recent jobs. */
export async function GET(_req: Request, { params }: Params) {
  try {
    await requireAdmin()
    const { id } = await params

    const video = await prisma.video.findUnique({
      where: { id },
      include: {
        channel: true,
        transcript: true,
        report: true,
        jobs: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    })
    if (!video) throw new HttpError(404, 'Video not found')

    return ok(video)
  } catch (err) {
    return handleError(err)
  }
}
