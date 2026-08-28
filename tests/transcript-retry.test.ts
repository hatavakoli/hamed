import { describe, expect, it } from 'vitest'
import { MAX_AUTO_RETRIES, RETRY_DELAYS_MINUTES, isDueForRetry, planNextRetry } from '@/lib/transcript/retry'
import { normalizeTranscriptPayload } from '@/lib/transcript/providers'

const NOW = new Date('2025-01-01T12:00:00.000Z')
const minutesAfter = (m: number) => new Date(NOW.getTime() + m * 60_000)

describe('planNextRetry', () => {
  it('schedules the first retry 15 minutes out', () => {
    const decision = planNextRetry(0, NOW)
    expect(decision.status).toBe('RETRYING')
    expect(decision.retryCount).toBe(1)
    expect(decision.delayMinutes).toBe(15)
    expect(decision.nextRetryAt).toEqual(minutesAfter(15))
  })

  it('schedules the second retry 1 hour out', () => {
    expect(planNextRetry(1, NOW).nextRetryAt).toEqual(minutesAfter(60))
  })

  it('schedules the third retry 6 hours out', () => {
    expect(planNextRetry(2, NOW).nextRetryAt).toEqual(minutesAfter(360))
  })

  it('gives up after the third retry and leaves it for a manual retry', () => {
    const decision = planNextRetry(3, NOW)
    expect(decision.status).toBe('FAILED')
    expect(decision.nextRetryAt).toBeNull()
    expect(decision.delayMinutes).toBeNull()
  })

  it('matches the documented 15m / 1h / 6h schedule', () => {
    expect(RETRY_DELAYS_MINUTES).toEqual([15, 60, 360])
    expect(MAX_AUTO_RETRIES).toBe(3)
  })
})

describe('isDueForRetry', () => {
  it('is due once nextRetryAt has passed', () => {
    expect(isDueForRetry({ status: 'RETRYING', nextRetryAt: minutesAfter(-1), retryCount: 1 }, NOW)).toBe(true)
  })

  it('is not due before nextRetryAt', () => {
    expect(isDueForRetry({ status: 'RETRYING', nextRetryAt: minutesAfter(5), retryCount: 1 }, NOW)).toBe(false)
  })

  it('never retries statuses other than RETRYING', () => {
    expect(isDueForRetry({ status: 'AVAILABLE', nextRetryAt: minutesAfter(-1), retryCount: 1 }, NOW)).toBe(false)
    expect(isDueForRetry({ status: 'UNAVAILABLE', nextRetryAt: minutesAfter(-1), retryCount: 0 }, NOW)).toBe(false)
    expect(isDueForRetry({ status: 'FAILED', nextRetryAt: minutesAfter(-1), retryCount: 3 }, NOW)).toBe(false)
  })

  it('stops once the automatic retry budget is spent', () => {
    expect(isDueForRetry({ status: 'RETRYING', nextRetryAt: minutesAfter(-1), retryCount: 3 }, NOW)).toBe(false)
  })
})

describe('normalizeTranscriptPayload', () => {
  it('accepts { text }', () => {
    expect(normalizeTranscriptPayload({ text: 'hello world' })?.rawText).toBe('hello world')
  })

  it('accepts { transcript } as a string', () => {
    expect(normalizeTranscriptPayload({ transcript: 'hello' })?.rawText).toBe('hello')
  })

  it('accepts { segments } and joins them into raw text', () => {
    const result = normalizeTranscriptPayload({
      language: 'en',
      segments: [
        { start: 0, duration: 2, text: 'one' },
        { start: 2, duration: 2, text: 'two' },
      ],
    })
    expect(result?.rawText).toBe('one two')
    expect(result?.language).toBe('en')
    expect(result?.segments).toHaveLength(2)
  })

  it('accepts a bare array using the "dur"/"offset" field names', () => {
    const result = normalizeTranscriptPayload([{ offset: 5, dur: 1.5, text: 'hi' }])
    expect(result?.segments[0]).toEqual({ start: 5, duration: 1.5, text: 'hi' })
  })

  it('returns null for an unusable payload', () => {
    expect(normalizeTranscriptPayload({ nothing: true })).toBeNull()
    expect(normalizeTranscriptPayload(null)).toBeNull()
  })
})
