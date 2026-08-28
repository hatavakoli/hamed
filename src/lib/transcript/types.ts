export type TranscriptSegment = {
  /** seconds from the start of the video */
  start: number
  /** seconds */
  duration: number
  text: string
}

export type TranscriptResult =
  | {
      status: 'AVAILABLE'
      provider: string
      language: string | null
      rawText: string
      segments: TranscriptSegment[]
    }
  | {
      /** Captions genuinely do not exist for this video -- retrying will not help. */
      status: 'UNAVAILABLE'
      provider: string
      reason: string
    }
  | {
      /** Something transient went wrong (network, 5xx, rate limit) -- retry later. */
      status: 'ERROR'
      provider: string
      reason: string
    }

export interface TranscriptProvider {
  readonly name: string
  fetchTranscript(input: { youtubeVideoId: string; title: string; durationSeconds: number | null }): Promise<TranscriptResult>
  testConnection(): Promise<{ ok: boolean; message: string }>
}
