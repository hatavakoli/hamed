import { handleError, ok } from '@/lib/api'
import { requireAdmin } from '@/lib/auth'
import { testAiConnection } from '@/lib/ai'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** POST /api/settings/test-ai */
export async function POST() {
  try {
    await requireAdmin()
    return ok(await testAiConnection())
  } catch (err) {
    return handleError(err)
  }
}
