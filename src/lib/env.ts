import { z } from 'zod'

/**
 * Central place where every environment variable is read.
 *
 * Design rule: only DATABASE_URL is truly mandatory. Everything else is
 * optional so the app boots and runs in MOCK_MODE with zero API keys.
 */

const boolish = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())))

const intish = (def: number) =>
  z
    .string()
    .optional()
    .transform((v) => {
      const n = Number(v)
      return v === undefined || v === '' || Number.isNaN(n) ? def : n
    })

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Auth / security
  NEXTAUTH_SECRET: z.string().default('dev-only-insecure-secret-change-me'),
  NEXTAUTH_URL: z.string().optional(),
  ADMIN_EMAIL: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  CRON_SECRET: z.string().optional(),

  // External services (all optional -> mock fallbacks)
  YOUTUBE_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-5'),
  AI_PROVIDER: z.enum(['anthropic', 'mock']).optional(),

  TRANSCRIPT_PROVIDER: z.enum(['api', 'youtube', 'mock', 'none']).optional(),
  TRANSCRIPT_API_URL: z.string().optional(),
  TRANSCRIPT_API_KEY: z.string().optional(),

  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

  APP_BASE_URL: z.string().default('http://localhost:3000'),
  APP_NAME: z.string().default('YouTube Content Intelligence Monitor'),

  // Jobs
  REDIS_URL: z.string().optional(),
  MOCK_MODE: boolish(false),
  MONITOR_INTERVAL_MINUTES: intish(60),
  MAX_VIDEOS_PER_CHECK: intish(5),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
})

export type Env = z.infer<typeof EnvSchema>

let cached: Env | null = null

/**
 * Drops variables that are present but empty.
 *
 * `.env.example` documents several optional variables as `FOO=""` ("leave blank
 * and a mock is used"). Zod treats '' as a real value, so `.optional()` would
 * reject it and `.default()` would keep the empty string. Stripping blanks here
 * makes a blank line behave exactly like a missing line, which is what anyone
 * reading the .env file expects.
 */
function withoutBlanks(source: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string' && value.trim() !== '') out[key] = value
  }
  return out
}

export function getEnv(): Env {
  if (cached) return cached
  const parsed = EnvSchema.safeParse(withoutBlanks(process.env))
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Invalid environment configuration:\n${issues}`)
  }
  cached = parsed.data
  return cached
}

/** Test helper: forget the memoised env so a changed process.env is re-read. */
export function resetEnvCache() {
  cached = null
}

export const env = new Proxy({} as Env, {
  get: (_t, prop: string) => getEnv()[prop as keyof Env],
})
