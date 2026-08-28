import { createLogger, safeErrorMessage } from '../logger'
import type { TranscriptProvider, TranscriptResult, TranscriptSegment } from './types'

const log = createLogger('transcript')

// ---------------------------------------------------------------------------
// 1. Configured third-party transcript API
// ---------------------------------------------------------------------------

/**
 * Generic adapter for a transcript API you configure via
 * TRANSCRIPT_API_URL + TRANSCRIPT_API_KEY.
 *
 * It sends:  GET {TRANSCRIPT_API_URL}?videoId=<id>&lang=en
 *            Authorization: Bearer <TRANSCRIPT_API_KEY>
 *
 * and accepts any of these response shapes (most providers use one of them):
 *   { "text": "..." }
 *   { "transcript": "..." }
 *   { "segments": [{ "start": 0, "duration": 3.2, "text": "..." }] }
 *   [ { "start": 0, "dur": 3.2, "text": "..." } ]
 */
export class ApiTranscriptProvider implements TranscriptProvider {
  readonly name = 'transcript-api'

  constructor(
    private apiUrl: string,
    private apiKey: string | null,
  ) {}

  async fetchTranscript(input: { youtubeVideoId: string }): Promise<TranscriptResult> {
    try {
      const url = new URL(this.apiUrl)
      url.searchParams.set('videoId', input.youtubeVideoId)
      if (!url.searchParams.has('lang')) url.searchParams.set('lang', 'en')

      const res = await fetch(url, {
        headers: {
          accept: 'application/json',
          ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}`, 'x-api-key': this.apiKey } : {}),
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(45_000),
      })

      if (res.status === 404) {
        return { status: 'UNAVAILABLE', provider: this.name, reason: 'The transcript provider has no captions for this video.' }
      }
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        return {
          status: 'ERROR',
          provider: this.name,
          reason: `Transcript API responded ${res.status}. ${body.slice(0, 200)}`,
        }
      }

      const json: unknown = await res.json()
      const normalized = normalizeTranscriptPayload(json)
      if (!normalized || !normalized.rawText.trim()) {
        return { status: 'UNAVAILABLE', provider: this.name, reason: 'Transcript provider returned an empty transcript.' }
      }
      return {
        status: 'AVAILABLE',
        provider: this.name,
        language: normalized.language,
        rawText: normalized.rawText,
        segments: normalized.segments,
      }
    } catch (err) {
      return { status: 'ERROR', provider: this.name, reason: safeErrorMessage(err) }
    }
  }

  async testConnection() {
    try {
      const res = await fetch(this.apiUrl, {
        method: 'HEAD',
        headers: this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : undefined,
        signal: AbortSignal.timeout(10_000),
      })
      return { ok: res.status < 500, message: `Transcript API reachable (HTTP ${res.status}).` }
    } catch (err) {
      return { ok: false, message: safeErrorMessage(err) }
    }
  }
}

/** Accepts the handful of shapes transcript APIs commonly return. */
export function normalizeTranscriptPayload(
  json: unknown,
): { rawText: string; segments: TranscriptSegment[]; language: string | null } | null {
  const asRecord = (v: unknown) => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null)

  let segmentsRaw: unknown = null
  let text: string | null = null
  let language: string | null = null

  if (Array.isArray(json)) {
    segmentsRaw = json
  } else {
    const obj = asRecord(json)
    if (!obj) return null
    language = typeof obj.language === 'string' ? obj.language : typeof obj.lang === 'string' ? obj.lang : null
    if (Array.isArray(obj.segments)) segmentsRaw = obj.segments
    else if (Array.isArray(obj.transcript)) segmentsRaw = obj.transcript
    else if (Array.isArray(obj.data)) segmentsRaw = obj.data
    if (typeof obj.text === 'string') text = obj.text
    else if (typeof obj.transcript === 'string') text = obj.transcript
    else if (typeof obj.content === 'string') text = obj.content
  }

  const segments: TranscriptSegment[] = []
  if (Array.isArray(segmentsRaw)) {
    for (const raw of segmentsRaw) {
      const seg = asRecord(raw)
      if (!seg) continue
      const segText = typeof seg.text === 'string' ? seg.text : typeof seg.snippet === 'string' ? seg.snippet : ''
      if (!segText) continue
      const start = Number(seg.start ?? seg.offset ?? seg.startTime ?? 0)
      const duration = Number(seg.duration ?? seg.dur ?? seg.length ?? 0)
      segments.push({
        start: Number.isFinite(start) ? start : 0,
        duration: Number.isFinite(duration) ? duration : 0,
        text: segText.trim(),
      })
    }
  }

  const rawText = text ?? segments.map((s) => s.text).join(' ')
  if (!rawText) return null
  return { rawText: rawText.trim(), segments, language }
}

// ---------------------------------------------------------------------------
// 2. YouTube captions (metadata only, by design)
// ---------------------------------------------------------------------------

/**
 * The official captions.download endpoint only works for videos you OWN
 * (it needs an OAuth token with the channel's consent). For third-party
 * channels we therefore only *detect* whether captions exist and report a
 * clear reason. We deliberately do not scrape YouTube's private timedtext
 * endpoints -- that is brittle and against YouTube's Terms of Service.
 */
export class YouTubeCaptionsProvider implements TranscriptProvider {
  readonly name = 'youtube-captions'

  constructor(private apiKey: string) {}

  async fetchTranscript(input: { youtubeVideoId: string }): Promise<TranscriptResult> {
    try {
      const url = new URL('https://www.googleapis.com/youtube/v3/captions')
      url.searchParams.set('part', 'snippet')
      url.searchParams.set('videoId', input.youtubeVideoId)
      url.searchParams.set('key', this.apiKey)

      const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(20_000) })
      if (!res.ok) {
        if (res.status >= 500 || res.status === 429) {
          return { status: 'ERROR', provider: this.name, reason: `YouTube captions API responded ${res.status}.` }
        }
        return {
          status: 'UNAVAILABLE',
          provider: this.name,
          reason: `YouTube captions could not be listed (HTTP ${res.status}).`,
        }
      }
      const data = (await res.json()) as { items?: { snippet?: { language?: string; trackKind?: string } }[] }
      const tracks = data.items ?? []
      if (!tracks.length) {
        return { status: 'UNAVAILABLE', provider: this.name, reason: 'This video has no caption tracks on YouTube.' }
      }
      const languages = [...new Set(tracks.map((t) => t.snippet?.language).filter(Boolean))].join(', ')
      log.info('Captions exist but cannot be downloaded without channel ownership', {
        videoId: input.youtubeVideoId,
        languages,
      })
      return {
        status: 'UNAVAILABLE',
        provider: this.name,
        reason:
          `Captions exist (${languages || 'unknown language'}) but YouTube only allows downloading them for channels you own. ` +
          `Configure TRANSCRIPT_API_URL to use a third-party transcript provider.`,
      }
    } catch (err) {
      return { status: 'ERROR', provider: this.name, reason: safeErrorMessage(err) }
    }
  }

  async testConnection() {
    return { ok: true, message: 'YouTube captions detection uses your YouTube API key (listing only).' }
  }
}

// ---------------------------------------------------------------------------
// 3. Mock provider for local development
// ---------------------------------------------------------------------------

const MOCK_LINES = [
  "Alright, so three months ago I had this idea and honestly I thought it was going to fail.",
  "Before we get into it, let me show you the number that made me change my mind.",
  "Twelve thousand users in ninety days, and I spent exactly zero dollars on ads.",
  "So here's the problem almost everyone runs into when they start.",
  "You build the thing first and then you go looking for people who want it.",
  "That is completely backwards, and I'm going to show you the order that actually works.",
  "Step one: I spent two weeks doing nothing but reading complaints in three communities.",
  "I collected four hundred and twelve specific complaints in a spreadsheet.",
  "Step two: I picked the complaint that showed up most often and was easiest to solve.",
  "Now here's the part nobody talks about, and this is where most people quit.",
  "The first version was genuinely embarrassing. It was a spreadsheet with a form on top.",
  "But eleven people paid for it in the first week, and that told me everything.",
  "Step three: I only added a feature when three separate customers asked for the same thing.",
  "Let me break down the actual numbers, because I think transparency helps here.",
  "Month one was four hundred dollars. Month two was twenty-one hundred.",
  "Month three we crossed nine thousand dollars in monthly recurring revenue.",
  "Here's what I'd do differently if I started again tomorrow.",
  "I'd charge more from day one. Pricing too low attracted the wrong customers.",
  "I'd also start the email list before the product, not after.",
  "If you found this useful, the full breakdown is linked below. Thanks for watching.",
]

export class MockTranscriptProvider implements TranscriptProvider {
  readonly name = 'mock-transcript'

  async fetchTranscript(input: {
    youtubeVideoId: string
    durationSeconds: number | null
  }): Promise<TranscriptResult> {
    // Deterministically make ~1 in 5 videos have "no transcript" so the
    // unavailable/retry UI is easy to see during local development.
    const bucket = input.youtubeVideoId.charCodeAt(0) % 5
    if (bucket === 0) {
      return { status: 'UNAVAILABLE', provider: this.name, reason: 'Mock provider: no captions for this video.' }
    }

    const total = input.durationSeconds ?? 900
    const step = Math.max(5, Math.floor(total / MOCK_LINES.length))
    const segments: TranscriptSegment[] = MOCK_LINES.map((text, i) => ({
      start: i * step,
      duration: step,
      text,
    }))
    return {
      status: 'AVAILABLE',
      provider: this.name,
      language: 'en',
      rawText: MOCK_LINES.join(' '),
      segments,
    }
  }

  async testConnection() {
    return { ok: true, message: 'Mock transcript provider active — no API key required.' }
  }
}

// ---------------------------------------------------------------------------
// 4. Disabled
// ---------------------------------------------------------------------------

export class NoopTranscriptProvider implements TranscriptProvider {
  readonly name = 'none'
  async fetchTranscript(): Promise<TranscriptResult> {
    return {
      status: 'UNAVAILABLE',
      provider: this.name,
      reason: 'Transcript retrieval is turned off in Settings (provider = none).',
    }
  }
  async testConnection() {
    return { ok: true, message: 'Transcript retrieval is disabled.' }
  }
}
