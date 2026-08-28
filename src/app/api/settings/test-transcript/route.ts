import { handleError, ok } from '@/lib/api'
import { requireAdmin } from '@/lib/auth'
import { testTranscriptProvider } from '@/lib/transcript'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** POST /api/settings/test-transcript */
export async function POST() {
  try {
    await requireAdmin()
    return ok(await testTranscriptProvider())
  } catch (err) {
    return handleError(err)
  }
}
