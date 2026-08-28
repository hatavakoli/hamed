import { handleError, ok } from '@/lib/api'
import { requireAdmin } from '@/lib/auth'
import { getYouTubeClient } from '@/lib/youtube'

export const dynamic = 'force-dynamic'

/** POST /api/settings/test-youtube */
export async function POST() {
  try {
    await requireAdmin()
    const client = await getYouTubeClient()
    const result = await client.testConnection()
    return ok({ provider: client.name, ...result })
  } catch (err) {
    return handleError(err)
  }
}
