import { prisma } from '@/lib/prisma'
import { handleError, ok } from '@/lib/api'
import { requireAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** GET /api/digests — all saved weekly digests, newest first. */
export async function GET() {
  try {
    await requireAdmin()
    const digests = await prisma.weeklyDigest.findMany({
      orderBy: { weekStart: 'desc' },
      take: 52,
      select: { id: true, weekStart: true, weekEnd: true, summary: true, videoCount: true, sentAt: true, createdAt: true },
    })
    return ok(digests)
  } catch (err) {
    return handleError(err)
  }
}
