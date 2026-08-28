export type CompletionInput = {
  system: string
  prompt: string
  maxTokens?: number
  temperature?: number
  /** Optional image (video thumbnail) for multimodal packaging analysis. */
  imageUrl?: string | null
}

export type CompletionResult = {
  text: string
  inputTokens: number
  outputTokens: number
  model: string
}

export interface AiProvider {
  readonly name: string
  readonly model: string
  readonly supportsImages: boolean
  complete(input: CompletionInput): Promise<CompletionResult>
  testConnection(): Promise<{ ok: boolean; message: string }>
}

export class AiError extends Error {
  constructor(
    message: string,
    public retryable = false,
    public status?: number,
  ) {
    super(message)
    this.name = 'AiError'
  }
}
