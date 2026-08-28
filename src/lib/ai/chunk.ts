import type { TranscriptSegment } from '../transcript/types'
import { formatTimestamp } from '../utils'

/**
 * Long transcripts do not fit in one prompt. These pure helpers split a
 * transcript into timestamped chunks so we can summarise each chunk and then
 * run one final synthesis prompt.
 */

/** ~4 characters per token is a good enough estimate for budgeting. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export const MAX_SINGLE_PASS_CHARS = 60_000 // ~15k tokens -> comfortably one prompt
export const CHUNK_CHARS = 24_000

export type TranscriptChunk = {
  index: number
  startSeconds: number
  endSeconds: number
  label: string
  text: string
}

export function chunkTranscript(
  segments: TranscriptSegment[],
  rawText: string,
  chunkChars = CHUNK_CHARS,
): TranscriptChunk[] {
  // No timing info: split the plain text on sentence boundaries.
  if (!segments.length) {
    const chunks: TranscriptChunk[] = []
    let cursor = 0
    let index = 0
    while (cursor < rawText.length) {
      let end = Math.min(cursor + chunkChars, rawText.length)
      if (end < rawText.length) {
        const boundary = rawText.lastIndexOf('. ', end)
        if (boundary > cursor + chunkChars * 0.5) end = boundary + 1
      }
      chunks.push({
        index: index++,
        startSeconds: 0,
        endSeconds: 0,
        label: `Part ${index}`,
        text: rawText.slice(cursor, end).trim(),
      })
      cursor = end
    }
    return chunks
  }

  const chunks: TranscriptChunk[] = []
  let buffer: TranscriptSegment[] = []
  let bufferChars = 0

  const flush = () => {
    if (!buffer.length) return
    const startSeconds = buffer[0].start
    const last = buffer[buffer.length - 1]
    const endSeconds = last.start + (last.duration || 0)
    chunks.push({
      index: chunks.length,
      startSeconds,
      endSeconds,
      label: `${formatTimestamp(startSeconds)}–${formatTimestamp(endSeconds)}`,
      text: buffer.map((s) => s.text).join(' ').trim(),
    })
    buffer = []
    bufferChars = 0
  }

  for (const segment of segments) {
    if (bufferChars + segment.text.length > chunkChars && buffer.length) flush()
    buffer.push(segment)
    bufferChars += segment.text.length + 1
  }
  flush()
  return chunks
}

/**
 * Renders a transcript with timestamps every ~30s. Keeps the hook analysable by
 * always preserving the opening verbatim.
 */
export function renderTimestampedTranscript(segments: TranscriptSegment[], rawText: string, maxChars: number): string {
  if (!segments.length) return rawText.slice(0, maxChars)

  const lines: string[] = []
  let lastStamp = -Infinity
  for (const seg of segments) {
    if (seg.start - lastStamp >= 30) {
      lines.push(`[${formatTimestamp(seg.start)}] ${seg.text}`)
      lastStamp = seg.start
    } else {
      lines.push(seg.text)
    }
  }
  const joined = lines.join('\n')
  if (joined.length <= maxChars) return joined

  // Too long: keep the first 30% (hook + setup) and the last 20% (payoff/CTA).
  const head = joined.slice(0, Math.floor(maxChars * 0.6))
  const tail = joined.slice(joined.length - Math.floor(maxChars * 0.3))
  return `${head}\n\n[... middle of the transcript omitted for length ...]\n\n${tail}`
}

/** Rough USD cost estimate. Update if Anthropic pricing changes. */
export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const pricing: Record<string, { input: number; output: number }> = {
    // USD per 1M tokens
    'claude-opus-4': { input: 15, output: 75 },
    'claude-sonnet-4-5': { input: 3, output: 15 },
    'claude-sonnet-4': { input: 3, output: 15 },
    'claude-haiku-4-5': { input: 1, output: 5 },
  }
  const key = Object.keys(pricing).find((k) => model.startsWith(k)) ?? 'claude-sonnet-4-5'
  const p = pricing[key]
  return Number(((inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output).toFixed(6))
}
