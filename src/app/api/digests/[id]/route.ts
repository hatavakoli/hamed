import { prisma } from '@/lib/prisma'
import { HttpError, handleError, ok } from '@/lib/api'
import { requireAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/** GET /api/digests/[id] */
export async function GET(_req: Request, { params }: Params) {
  try {
    await requireAdmin()
    const { id } = await params
    const digest = await prisma.weeklyDigest.findUnique({ where: { id } })
    if (!digest) throw new HttpError(404, 'Digest not found')
    return ok(digest)
  } catch (err) {
    return handleError(err)
  }
}
