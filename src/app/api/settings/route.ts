import { z } from 'zod'
import { handleError, ok, parseBody } from '@/lib/api'
import { requireAdmin } from '@/lib/auth'
import { PreferencesSchema, SECRET_KEYS, getPreferences, getSecretStatuses, savePreferences, setSecret } from '@/lib/settings'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'

const UpdateSchema = PreferencesSchema.partial().extend({
  /** Optional secret updates. Empty string clears the stored value. */
  secrets: z.record(z.enum(SECRET_KEYS), z.string()).optional(),
})

/** GET /api/settings — preferences plus which secrets are configured (never their values). */
export async function GET() {
  try {
    await requireAdmin()
    return ok({
      preferences: await getPreferences(),
      secrets: await getSecretStatuses(),
      environment: {
        mockMode: env.MOCK_MODE,
        appBaseUrl: env.APP_BASE_URL,
        nodeEnv: env.NODE_ENV,
        cronSecretConfigured: Boolean(env.CRON_SECRET),
        redisConfigured: Boolean(env.REDIS_URL),
      },
    })
  } catch (err) {
    return handleError(err)
  }
}

/** PATCH /api/settings */
export async function PATCH(req: Request) {
  try {
    await requireAdmin()
    const body = await parseBody(req, UpdateSchema)
    const { secrets, ...preferences } = body

    if (secrets) {
      for (const [name, value] of Object.entries(secrets)) {
        // Env vars always win, so writing a DB secret that env overrides is pointless.
        if ((env as unknown as Record<string, string | undefined>)[name]) continue
        await setSecret(name as (typeof SECRET_KEYS)[number], value.trim() || null)
      }
    }

    const updated = Object.keys(preferences).length ? await savePreferences(preferences) : await getPreferences()
    return ok({ preferences: updated, secrets: await getSecretStatuses() })
  } catch (err) {
    return handleError(err)
  }
}
