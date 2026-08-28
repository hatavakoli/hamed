/**
 * Tiny structured logger. One JSON line per event in production (easy to grep
 * or ship to a log service), human-readable text in development.
 */

type Level = 'debug' | 'info' | 'warn' | 'error'
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }

function threshold(): number {
  const raw = (process.env.LOG_LEVEL || 'info') as Level
  return ORDER[raw] ?? ORDER.info
}

function emit(level: Level, scope: string, message: string, data?: Record<string, unknown>) {
  if (ORDER[level] < threshold()) return
  const entry = { ts: new Date().toISOString(), level, scope, message, ...(data ?? {}) }
  const line =
    process.env.NODE_ENV === 'production'
      ? JSON.stringify(entry)
      : `${entry.ts} [${level.toUpperCase()}] (${scope}) ${message}` +
        (data && Object.keys(data).length ? ` ${JSON.stringify(data)}` : '')
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export function createLogger(scope: string) {
  return {
    debug: (m: string, d?: Record<string, unknown>) => emit('debug', scope, m, d),
    info: (m: string, d?: Record<string, unknown>) => emit('info', scope, m, d),
    warn: (m: string, d?: Record<string, unknown>) => emit('warn', scope, m, d),
    error: (m: string, d?: Record<string, unknown>) => emit('error', scope, m, d),
  }
}

export const logger = createLogger('app')

/** Never let a raw error object (which may embed an API key) reach the client. */
export function safeErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  return raw
    .replace(/key=[^&\s]+/gi, 'key=***')
    .replace(/(sk-[A-Za-z0-9_-]{6})[A-Za-z0-9_-]+/g, '$1***')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer ***')
    .slice(0, 500)
}
