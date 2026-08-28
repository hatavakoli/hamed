import { createLogger, safeErrorMessage } from '../logger'
import { AiError, type AiProvider, type CompletionInput, type CompletionResult } from './provider'

const log = createLogger('ai:anthropic')
const API_URL = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'

type AnthropicResponse = {
  content?: { type: string; text?: string }[]
  usage?: { input_tokens?: number; output_tokens?: number }
  model?: string
  stop_reason?: string
}

/** Claude via the Messages API. Uses plain fetch -- no SDK dependency. */
export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic'
  readonly supportsImages = true

  constructor(
    private apiKey: string,
    public readonly model: string,
  ) {}

  async complete(input: CompletionInput): Promise<CompletionResult> {
    // First attempt may include the thumbnail; if the image is rejected
    // (bad URL, unsupported type) we transparently retry text-only.
    try {
      return await this.request(input, Boolean(input.imageUrl))
    } catch (err) {
      if (input.imageUrl && err instanceof AiError && !err.retryable) {
        log.warn('Retrying analysis without the thumbnail image', { reason: err.message })
        return this.request(input, false)
      }
      throw err
    }
  }

  private async request(input: CompletionInput, withImage: boolean): Promise<CompletionResult> {
    const content: Record<string, unknown>[] = []
    if (withImage && input.imageUrl) {
      content.push({ type: 'image', source: { type: 'url', url: input.imageUrl } })
    }
    content.push({ type: 'text', text: input.prompt })

    let res: Response
    try {
      res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': API_VERSION,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: input.maxTokens ?? 8000,
          temperature: input.temperature ?? 0.3,
          system: input.system,
          messages: [{ role: 'user', content }],
        }),
        signal: AbortSignal.timeout(300_000),
      })
    } catch (err) {
      throw new AiError(`Could not reach the Anthropic API: ${safeErrorMessage(err)}`, true)
    }

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string; type?: string } } | null
      const message = body?.error?.message ?? res.statusText
      if (res.status === 401) throw new AiError('Anthropic API key is invalid or missing.', false, 401)
      if (res.status === 400) throw new AiError(`Anthropic rejected the request: ${message}`, false, 400)
      if (res.status === 429) throw new AiError('Anthropic rate limit reached. Will retry.', true, 429)
      if (res.status === 529 || res.status >= 500) throw new AiError(`Anthropic is overloaded (${res.status}).`, true, res.status)
      throw new AiError(`Anthropic API error ${res.status}: ${message}`, false, res.status)
    }

    const data = (await res.json()) as AnthropicResponse
    const text = (data.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('')

    if (!text.trim()) throw new AiError('Anthropic returned an empty response.', true)
    if (data.stop_reason === 'max_tokens') {
      log.warn('Response hit the max_tokens limit and may be truncated', { model: this.model })
    }

    return {
      text,
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
      model: data.model ?? this.model,
    }
  }

  async testConnection() {
    try {
      const result = await this.request(
        { system: 'Reply with the single word: ok', prompt: 'ping', maxTokens: 16, temperature: 0 },
        false,
      )
      return { ok: true, message: `Connected to ${result.model}.` }
    } catch (err) {
      return { ok: false, message: safeErrorMessage(err) }
    }
  }
}
