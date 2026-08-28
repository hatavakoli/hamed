/**
 * Transcript retry policy (pure -> unit tested).
 *
 * Attempt 1 fails -> retry in 15 minutes
 * Attempt 2 fails -> retry in 1 hour
 * Attempt 3 fails -> retry in 6 hours
 * Attempt 4 fails -> give up automatically; the UI offers a manual retry button.
 */

export const RETRY_DELAYS_MINUTES = [15, 60, 360] as const
export const MAX_AUTO_RETRIES = RETRY_DELAYS_MINUTES.length

export type RetryDecision = {
  status: 'RETRYING' | 'FAILED'
  nextRetryAt: Date | null
  retryCount: number
  delayMinutes: number | null
}

/**
 * @param previousRetryCount how many automatic retries have already happened (0 on first failure)
 * @param now injected for deterministic tests
 */
export function planNextRetry(previousRetryCount: number, now: Date = new Date()): RetryDecision {
  const retryCount = previousRetryCount + 1
  const delayMinutes = RETRY_DELAYS_MINUTES[previousRetryCount] ?? null

  if (delayMinutes === null) {
    return { status: 'FAILED', nextRetryAt: null, retryCount, delayMinutes: null }
  }
  return {
    status: 'RETRYING',
    nextRetryAt: new Date(now.getTime() + delayMinutes * 60_000),
    retryCount,
    delayMinutes,
  }
}

/** Is this transcript row due for another automatic attempt? */
export function isDueForRetry(
  row: { status: string; nextRetryAt: Date | null; retryCount: number },
  now: Date = new Date(),
): boolean {
  if (row.status !== 'RETRYING') return false
  if (row.retryCount >= MAX_AUTO_RETRIES) return false
  if (!row.nextRetryAt) return false
  return row.nextRetryAt.getTime() <= now.getTime()
}
