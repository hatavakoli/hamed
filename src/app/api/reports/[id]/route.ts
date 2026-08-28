import { prisma } from '@/lib/prisma'
import { HttpError, handleError, ok } from '@/lib/api'
import { requireAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/**
 * GET /api/reports/[id]
 * Accepts either an AnalysisReport id or the video id it belongs to, because
 * both appear in links across the UI.
 */
export async function GET(_req: Request, { params }: Params) {
  try {
    await requireAdmin()
    const { id } = await params

    const report =
      (await prisma.analysisReport.findUnique({
        where: { id },
        include: { video: { include: { channel: true, transcript: { select: { status: true, language: true, provider: true } } } } },
      })) ??
      (await prisma.analysisReport.findUnique({
        where: { videoId: id },
        include: { video: { include: { channel: true, transcript: { select: { status: true, language: true, provider: true } } } } },
      }))

    if (!report) throw new HttpError(404, 'Report not found')
    return ok(report)
  } catch (err) {
    return handleError(err)
  }
}
