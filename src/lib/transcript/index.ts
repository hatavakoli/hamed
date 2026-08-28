import { env } from '../env'
import { createLogger } from '../logger'
import { getPreferences, getSecret } from '../settings'
import {
  ApiTranscriptProvider,
  MockTranscriptProvider,
  NoopTranscriptProvider,
  YouTubeCaptionsProvider,
} from './providers'
import type { TranscriptProvider, TranscriptResult } from './types'

export * from './types'
export * from './retry'
export { normalizeTranscriptPayload } from './providers'

const log = createLogger('transcript')

/**
 * Builds the ordered list of providers to try, honouring the documented
 * priority: configured transcript API -> YouTube captions -> graceful failure.
 */
export async function getTranscriptProviderChain(): Promise<TranscriptProvider[]> {
  const prefs = await getPreferences()

  if (prefs.transcriptProvider === 'none') return [new NoopTranscriptProvider()]
  if (prefs.transcriptProvider === 'mock' || env.MOCK_MODE) return [new MockTranscriptProvider()]

  const chain: TranscriptProvider[] = []

  const apiUrl = await getSecret('TRANSCRIPT_API_URL')
  const apiKey = await getSecret('TRANSCRIPT_API_KEY')
  if (apiUrl) chain.push(new ApiTranscriptProvider(apiUrl, apiKey))

  if (prefs.transcriptProvider === 'api' || prefs.transcriptProvider === 'youtube') {
    const ytKey = await getSecret('YOUTUBE_API_KEY')
    if (ytKey) chain.push(new YouTubeCaptionsProvider(ytKey))
  }

  if (!chain.length) chain.push(new MockTranscriptProvider())
  return chain
}

/**
 * Walks the provider chain. An ERROR from one provider still lets the next one
 * try; we only report ERROR (retryable) if nothing produced a definitive answer.
 */
export async function fetchTranscript(input: {
  youtubeVideoId: string
  title: string
  durationSeconds: number | null
}): Promise<TranscriptResult> {
  const chain = await getTranscriptProviderChain()
  let lastError: TranscriptResult | null = null
  let lastUnavailable: TranscriptResult | null = null

  for (const provider of chain) {
    const result = await provider.fetchTranscript(input)
    log.debug('Transcript attempt', { provider: provider.name, videoId: input.youtubeVideoId, status: result.status })
    if (result.status === 'AVAILABLE') return result
    if (result.status === 'ERROR') lastError = result
    else lastUnavailable = result
  }

  // A transient error is worth retrying; a definitive "no captions" is not.
  return (
    lastError ??
    lastUnavailable ?? {
      status: 'UNAVAILABLE',
      provider: 'none',
      reason: 'No transcript provider is configured.',
    }
  )
}

export async function testTranscriptProvider() {
  const chain = await getTranscriptProviderChain()
  const first = chain[0]
  const result = await first.testConnection()
  return { provider: first.name, ...result }
}
