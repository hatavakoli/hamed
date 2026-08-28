import { cookies } from 'next/headers'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { fail, handleError, ok, parseBody } from '@/lib/api'
import { PreferencesSchema, getPreferences, getSecretStatuses, isSetupCompleted, savePreferences, setSecret } from '@/lib/settings'
import { hashPassword } from '@/lib/crypto'
import { SESSION_COOKIE, createSessionToken, requireAdmin, sessionCookieOptions } from '@/lib/auth'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'

const SetupSchema = z.object({
  appName: z.string().min(1).max(80),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8, 'Use at least 8 characters').optional(),
  youtubeApiKey: z.string().optional(),
  anthropicApiKey: z.string().optional(),
  transcriptApiUrl: z.string().url().optional().or(z.literal('')),
  transcriptApiKey: z.string().optional(),
  resendApiKey: z.string().optional(),
  emailFrom: z.string().optional(),
  aiModel: z.string().optional(),
})

/**
 * GET /api/setup  (public — reports whether first-run setup is still needed)
 */
export async function GET() {
  try {
    const completed = await isSetupCompleted()
    const prefs = await getPreferences()
    return ok({
      setupCompleted: completed,
      appName: prefs.appName,
      hasEnvAdmin: Boolean(env.ADMIN_EMAIL && env.ADMIN_PASSWORD),
    })
  } catch (err) {
    return handleError(err)
  }
}

/**
 * POST /api/setup
 * Allowed while setup is incomplete (first run). Once completed it requires an
 * admin session, so nobody can reset your instance from the internet.
 */
export async function POST(req: Request) {
  try {
    const alreadyCompleted = await isSetupCompleted()
    // Re-running setup on a configured instance requires being logged in.
    if (alreadyCompleted) await requireAdmin()
    return await runSetup(req, alreadyCompleted)
  } catch (err) {
    return handleError(err)
  }
}

async function runSetup(req: Request, alreadyCompleted: boolean) {
  const body = await parseBody(req, SetupSchema)

  if (!alreadyCompleted && !body.adminPassword && !(env.ADMIN_EMAIL && env.ADMIN_PASSWORD)) {
    return fail(400, 'Set an admin password (at least 8 characters), or configure ADMIN_EMAIL and ADMIN_PASSWORD in .env.')
  }

  const email = body.adminEmail.trim().toLowerCase()

  await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: 'Admin',
      role: 'ADMIN',
      passwordHash: body.adminPassword ? hashPassword(body.adminPassword) : null,
    },
    update: {
      ...(body.adminPassword ? { passwordHash: hashPassword(body.adminPassword) } : {}),
      role: 'ADMIN',
    },
  })

  // Secrets are stored AES-encrypted; env vars still take precedence at read time.
  if (body.youtubeApiKey) await setSecret('YOUTUBE_API_KEY', body.youtubeApiKey.trim())
  if (body.anthropicApiKey) await setSecret('ANTHROPIC_API_KEY', body.anthropicApiKey.trim())
  if (body.transcriptApiUrl) await setSecret('TRANSCRIPT_API_URL', body.transcriptApiUrl.trim())
  if (body.transcriptApiKey) await setSecret('TRANSCRIPT_API_KEY', body.transcriptApiKey.trim())
  if (body.resendApiKey) await setSecret('RESEND_API_KEY', body.resendApiKey.trim())
  if (body.emailFrom) await setSecret('EMAIL_FROM', body.emailFrom.trim())

  const anthropicConfigured = Boolean(body.anthropicApiKey) || Boolean(env.ANTHROPIC_API_KEY)
  const transcriptConfigured = Boolean(body.transcriptApiUrl) || Boolean(env.TRANSCRIPT_API_URL)

  await savePreferences(
    PreferencesSchema.partial().parse({
      appName: body.appName,
      adminEmail: email,
      setupCompleted: true,
      ...(body.aiModel ? { aiModel: body.aiModel } : {}),
      ...(env.MOCK_MODE ? {} : { aiProvider: anthropicConfigured ? 'anthropic' : 'mock' }),
      ...(env.MOCK_MODE ? {} : { transcriptProvider: transcriptConfigured ? 'api' : 'mock' }),
    }),
  )

  // Log the admin straight in after first-run setup.
  if (!alreadyCompleted) {
    const store = await cookies()
    store.set(SESSION_COOKIE, createSessionToken(email, 'ADMIN'), sessionCookieOptions())
  }

  return ok({ setupCompleted: true, secrets: await getSecretStatuses() })
}
