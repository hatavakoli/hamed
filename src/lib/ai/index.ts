import { env } from '../env'
import { createLogger } from '../logger'
import { getPreferences, getSecret } from '../settings'
import type { TranscriptSegment } from '../transcript/types'
import { AnthropicProvider } from './anthropic'
import {
  CHUNK_CHARS,
  MAX_SINGLE_PASS_CHARS,
  chunkTranscript,
  estimateCostUsd,
  renderTimestampedTranscript,
} from './chunk'
import { MockAiProvider } from './mock'
import {
  CHUNK_SUMMARY_SYSTEM_PROMPT,
  PROMPT_VERSION,
  SYSTEM_PROMPT,
  buildAnalysisPrompt,
  buildChunkSummaryPrompt,
  type PromptChannelContext,
  type PromptVideoContext,
} from './prompt'
import { AiError, type AiProvider } from './provider'
import { type Analysis, parseAnalysisJson, resolveOverallScore } from './schema'

export * from './schema'
export * from './provider'
export { PROMPT_VERSION, SYSTEM_PROMPT } from './prompt'
export { estimateTokens, estimateCostUsd, chunkTranscript } from './chunk'

const log = createLogger('ai')

export async function getAiProvider(): Promise<AiProvider> {
  const prefs = await getPreferences()
  if (env.MOCK_MODE || prefs.aiProvider === 'mock') return new MockAiProvider()
  const key = await getSecret('ANTHROPIC_API_KEY')
  if (!key) {
    log.warn('No ANTHROPIC_API_KEY configured — falling back to the mock AI provider')
    return new MockAiProvider()
  }
  return new AnthropicProvider(key, prefs.aiModel)
}

export type RunAnalysisInput = {
  video: PromptVideoContext
  channel: PromptChannelContext
  transcript: {
    status: 'AVAILABLE' | 'UNAVAILABLE' | 'PENDING' | 'FAILED' | 'RETRYING'
    rawText?: string | null
    segments?: TranscriptSegment[] | null
    language?: string | null
  }
}

export type RunAnalysisResult = {
  analysis: Analysis
  overallScore: number
  provider: string
  model: string
  promptVersion: string
  inputTokens: number
  outputTokens: number
  estimatedCost: number
  transcriptUsed: boolean
  chunked: boolean
}

/**
 * Full analysis run.
 *
 * Short transcript  -> one prompt.
 * Long transcript   -> summarise each chunk, then one synthesis prompt.
 * No transcript     -> metadata-only prompt, flagged as low confidence.
 *
 * If the model returns JSON that fails validation we retry ONCE, telling it
 * exactly what was wrong.
 */
export async function runAnalysis(input: RunAnalysisInput): Promise<RunAnalysisResult> {
  const provider = await getAiProvider()
  let inputTokens = 0
  let outputTokens = 0

  const hasTranscript = input.transcript.status === 'AVAILABLE' && Boolean(input.transcript.rawText?.trim())
  const rawText = input.transcript.rawText ?? ''
  const segments = input.transcript.segments ?? []

  let transcriptText: string | null = null
  let sectionSummaries: string[] | null = null
  let chunked = false

  if (hasTranscript) {
    if (rawText.length <= MAX_SINGLE_PASS_CHARS) {
      transcriptText = renderTimestampedTranscript(segments, rawText, MAX_SINGLE_PASS_CHARS)
    } else {
      chunked = true
      const chunks = chunkTranscript(segments, rawText, CHUNK_CHARS)
      log.info('Transcript is long — summarising in chunks first', { chunks: chunks.length, chars: rawText.length })
      sectionSummaries = []
      for (const chunk of chunks) {
        const result = await provider.complete({
          system: CHUNK_SUMMARY_SYSTEM_PROMPT,
          prompt: buildChunkSummaryPrompt(chunk, { title: input.video.title }, chunks.length),
          maxTokens: 700,
          temperature: 0.2,
        })
        inputTokens += result.inputTokens
        outputTokens += result.outputTokens
        sectionSummaries.push(`(${chunk.label}) ${result.text.trim()}`)
      }
      // Keep the true opening so hook analysis stays grounded in real words.
      const opening = renderTimestampedTranscript(segments.slice(0, 25), rawText.slice(0, 3000), 3000)
      sectionSummaries.unshift(`(Verbatim opening of the video, for hook analysis)\n${opening}`)
    }
  }

  const basePrompt = buildAnalysisPrompt({
    video: input.video,
    channel: input.channel,
    transcriptStatus: input.transcript.status,
    transcriptText,
    sectionSummaries,
    transcriptLanguage: input.transcript.language,
  })

  let prompt = basePrompt
  let lastError = ''

  for (let attempt = 1; attempt <= 2; attempt++) {
    const result = await provider.complete({
      system: SYSTEM_PROMPT,
      prompt,
      maxTokens: 8000,
      temperature: 0.3,
      imageUrl: provider.supportsImages ? input.video.thumbnailUrl : null,
    })
    inputTokens += result.inputTokens
    outputTokens += result.outputTokens

    const parsed = parseAnalysisJson(result.text)
    if (parsed.ok) {
      const overallScore = resolveOverallScore(parsed.data.scorecard)
      return {
        analysis: parsed.data,
        overallScore,
        provider: provider.name,
        model: result.model,
        promptVersion: PROMPT_VERSION,
        inputTokens,
        outputTokens,
        // The mock provider costs nothing, so never inflate the spend counter.
        estimatedCost: provider.name === 'mock' ? 0 : estimateCostUsd(result.model, inputTokens, outputTokens),
        transcriptUsed: hasTranscript,
        chunked,
      }
    }

    lastError = parsed.error
    log.warn('Model output failed validation', { attempt, error: parsed.error })
    prompt = `${basePrompt}

=== IMPORTANT: YOUR PREVIOUS RESPONSE WAS REJECTED ===
${parsed.error}

Return the corrected JSON object only. No markdown fences, no explanation, no text before or after the JSON.`
  }

  throw new AiError(`The AI response could not be validated after 2 attempts. Last error: ${lastError}`, true)
}

export async function testAiConnection() {
  const provider = await getAiProvider()
  const result = await provider.testConnection()
  return { provider: provider.name, model: provider.model, ...result }
}
