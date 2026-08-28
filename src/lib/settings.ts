import { z } from 'zod'
import { prisma } from './prisma'
import { env } from './env'
import { decryptSecret, encryptSecret, maskSecret } from './crypto'

/**
 * Configuration resolution.
 *
 * Two kinds of settings:
 *  1. Preferences  -> plain text in the `app_settings` table, editable in the UI.
 *  2. Secrets      -> environment variable wins; otherwise an AES-encrypted
 *                     value in `app_settings` (so a beginner can paste keys in
 *                     the Setup page instead of editing .env).
 */

export const SECRET_KEYS = [
  'YOUTUBE_API_KEY',
  'ANTHROPIC_API_KEY',
  'TRANSCRIPT_API_KEY',
  'TRANSCRIPT_API_URL',
  'RESEND_API_KEY',
  'EMAIL_FROM',
] as const
export type SecretKey = (typeof SECRET_KEYS)[number]

export const PreferencesSchema = z.object({
  appName: z.string().min(1).max(80).default('YouTube Content Intelligence Monitor'),
  adminEmail: z.string().email().or(z.literal('')).default(''),
  monitorIntervalMinutes: z.number().int().min(15).max(1440).default(60),
  maxVideosPerCheck: z.number().int().min(1).max(25).default(5),
  notifyOnNewReport: z.boolean().default(true),
  weeklyDigestEnabled: z.boolean().default(true),
  aiProvider: z.enum(['anthropic', 'mock']).default('anthropic'),
  aiModel: z.string().min(1).default('claude-sonnet-4-5'),
  transcriptProvider: z.enum(['api', 'youtube', 'mock', 'none']).default('api'),
  dataRetentionDays: z.number().int().min(0).max(3650).default(0), // 0 = keep forever
  setupCompleted: z.boolean().default(false),
})
export type Preferences = z.infer<typeof PreferencesSchema>

const PREF_KEY_PREFIX = 'pref:'
const SECRET_KEY_PREFIX = 'secret:'

function coerce(raw: string | null | undefined, fallback: unknown): unknown {
  if (raw === null || raw === undefined || raw === '') return fallback
  if (typeof fallback === 'number') {
    const n = Number(raw)
    return Number.isNaN(n) ? fallback : n
  }
  if (typeof fallback === 'boolean') return raw === 'true'
  return raw
}

/** Defaults come from env so a fresh install already reflects your .env file. */
function envDefaults(): Preferences {
  return PreferencesSchema.parse({
    appName: env.APP_NAME,
    adminEmail: env.ADMIN_EMAIL ?? '',
    monitorIntervalMinutes: env.MONITOR_INTERVAL_MINUTES,
    maxVideosPerCheck: env.MAX_VIDEOS_PER_CHECK,
    notifyOnNewReport: true,
    weeklyDigestEnabled: true,
    aiProvider: env.AI_PROVIDER ?? (env.MOCK_MODE || !env.ANTHROPIC_API_KEY ? 'mock' : 'anthropic'),
    aiModel: env.ANTHROPIC_MODEL,
    transcriptProvider: env.TRANSCRIPT_PROVIDER ?? (env.MOCK_MODE ? 'mock' : 'api'),
    dataRetentionDays: 0,
    setupCompleted: false,
  })
}

export async function getPreferences(): Promise<Preferences> {
  const defaults = envDefaults()
  let rows: { key: string; value: string | null }[] = []
  try {
    rows = await prisma.appSetting.findMany({ where: { key: { startsWith: PREF_KEY_PREFIX } } })
  } catch {
    // Database not migrated yet (very first boot) -> fall back to env defaults.
    return defaults
  }
  const stored = new Map(rows.map((r) => [r.key.slice(PREF_KEY_PREFIX.length), r.value]))
  const merged: Record<string, unknown> = { ...defaults }
  for (const [k, fallback] of Object.entries(defaults)) {
    if (stored.has(k)) merged[k] = coerce(stored.get(k), fallback)
  }
  const parsed = PreferencesSchema.safeParse(merged)
  return parsed.success ? parsed.data : defaults
}

export async function savePreferences(patch: Partial<Preferences>): Promise<Preferences> {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined)
  await prisma.$transaction(
    entries.map(([k, v]) =>
      prisma.appSetting.upsert({
        where: { key: PREF_KEY_PREFIX + k },
        create: { key: PREF_KEY_PREFIX + k, value: String(v), isEncrypted: false },
        update: { value: String(v) },
      }),
    ),
  )
  return getPreferences()
}

/** Environment variable first, then the encrypted DB value. */
export async function getSecret(name: SecretKey): Promise<string | null> {
  const fromEnv = (env as unknown as Record<string, string | undefined>)[name]
  if (fromEnv) return fromEnv
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: SECRET_KEY_PREFIX + name } })
    if (!row?.value) return null
    return row.isEncrypted ? decryptSecret(row.value) : row.value
  } catch {
    return null
  }
}

export async function setSecret(name: SecretKey, value: string | null): Promise<void> {
  const key = SECRET_KEY_PREFIX + name
  if (!value) {
    await prisma.appSetting.deleteMany({ where: { key } })
    return
  }
  const encrypted = encryptSecret(value)
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value: encrypted, isEncrypted: true },
    update: { value: encrypted, isEncrypted: true },
  })
}

export type SecretStatus = {
  name: SecretKey
  configured: boolean
  source: 'env' | 'database' | 'unset'
  masked: string | null
}

/** Safe for the browser: reports whether a key exists, never its value. */
export async function getSecretStatuses(): Promise<SecretStatus[]> {
  const out: SecretStatus[] = []
  for (const name of SECRET_KEYS) {
    const fromEnv = (env as unknown as Record<string, string | undefined>)[name]
    if (fromEnv) {
      out.push({ name, configured: true, source: 'env', masked: maskSecret(fromEnv) })
      continue
    }
    const value = await getSecret(name)
    out.push({
      name,
      configured: Boolean(value),
      source: value ? 'database' : 'unset',
      masked: maskSecret(value),
    })
  }
  return out
}

export async function isSetupCompleted(): Promise<boolean> {
  const prefs = await getPreferences()
  return prefs.setupCompleted
}
