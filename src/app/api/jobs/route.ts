import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { handleError, ok, parseQuery } from '@/lib/api'
import { requireAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const QuerySchema = z.object({
  status: z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

/** GET /api/jobs — the visible job/error log. */
export async function GET(req: Request) {
  try {
    await requireAdmin()
    const query = parseQuery(req.url, QuerySchema)

    const jobs = await prisma.monitoringJob.findMany({
      where: query.status ? { status: query.status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      include: { channel: { select: { id: true, title: true } }, video: { select: { id: true, title: true } } },
    })

    return ok(jobs)
  } catch (err) {
    return handleError(err)
  }
}
