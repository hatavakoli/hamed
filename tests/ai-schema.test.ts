import { describe, expect, it } from 'vitest'
import { AnalysisSchema, extractJsonObject, parseAnalysisJson, resolveOverallScore } from '@/lib/ai/schema'
import { MockAiProvider } from '@/lib/ai/mock'
import { SYSTEM_PROMPT, buildAnalysisPrompt } from '@/lib/ai/prompt'
import { chunkTranscript, estimateCostUsd, estimateTokens } from '@/lib/ai/chunk'

const MINIMAL_VALID = {
  coreTopic: 'Validation',
  premise: 'A case study about finding demand before building.',
  executiveSummary: {
    summary: 'A five sentence summary would go here.',
    verdict: 'strong',
    mostImportantTakeaway: 'Research first.',
    topTakeaways: ['a', 'b', 'c'],
  },
}

describe('extractJsonObject', () => {
  it('finds bare JSON', () => {
    expect(extractJsonObject('{"a":1}')).toBe('{"a":1}')
  })

  it('strips ```json fences', () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toBe('{"a":1}')
  })

  it('ignores prose before and after the object', () => {
    expect(extractJsonObject('Sure! Here it is:\n{"a":1}\nHope that helps.')).toBe('{"a":1}')
  })

  it('is not confused by braces inside strings', () => {
    const raw = '{"note":"a } brace","ok":true}'
    expect(extractJsonObject(raw)).toBe(raw)
  })

  it('handles nested objects', () => {
    const raw = '{"a":{"b":{"c":1}}}'
    expect(extractJsonObject(raw)).toBe(raw)
  })

  it('returns null when there is no object', () => {
    expect(extractJsonObject('I cannot help with that.')).toBeNull()
  })
})

describe('AnalysisSchema', () => {
  it('accepts a minimal object and fills in defaults', () => {
    const parsed = AnalysisSchema.parse(MINIMAL_VALID)
    expect(parsed.scorecard.overall).toBe(5) // .catch() default
    expect(parsed.recommendations.originalVideoIdeas).toEqual([])
    expect(parsed.productValidation.buildVerdict).toBe('not_applicable')
  })

  it('rejects an object with no executive summary', () => {
    expect(AnalysisSchema.safeParse({ coreTopic: 'x', premise: 'y' }).success).toBe(false)
  })

  it('coerces an out-of-range score instead of throwing away the report', () => {
    const parsed = AnalysisSchema.parse({ ...MINIMAL_VALID, scorecard: { overall: 42 } })
    expect(parsed.scorecard.overall).toBe(5)
  })

  it('falls back to "other" for an unknown format', () => {
    const parsed = AnalysisSchema.parse({ ...MINIMAL_VALID, format: { primary: 'vlog-thing' } })
    expect(parsed.format.primary).toBe('other')
  })

  it('caps runaway list lengths', () => {
    const parsed = AnalysisSchema.parse({
      ...MINIMAL_VALID,
      targetAudience: { painPoints: Array.from({ length: 50 }, (_, i) => `pain ${i}`) },
    })
    expect(parsed.targetAudience.painPoints).toHaveLength(12)
  })
})

describe('parseAnalysisJson', () => {
  it('accepts valid model output wrapped in fences', () => {
    const result = parseAnalysisJson('```json\n' + JSON.stringify(MINIMAL_VALID) + '\n```')
    expect(result.ok).toBe(true)
  })

  it('reports invalid JSON clearly', () => {
    const result = parseAnalysisJson('{ not json')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/invalid JSON|No JSON object/i)
  })

  it('reports a schema mismatch with the offending path', () => {
    const result = parseAnalysisJson(JSON.stringify({ coreTopic: 'only this' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/schema/i)
  })
})

describe('resolveOverallScore', () => {
  it('uses the model-provided overall score', () => {
    expect(resolveOverallScore({ overall: 8 } as never)).toBe(8)
  })

  it('averages the other metrics when overall is missing', () => {
    const scorecard = {
      topicStrength: 8,
      audienceSpecificity: 6,
      titleStrength: 7,
      hookStrength: 7,
      structureRetentionPotential: 6,
      differentiation: 5,
      actionabilityValue: 9,
      repurposingPotential: 8,
      overall: 0,
    }
    expect(resolveOverallScore(scorecard as never)).toBe(7)
  })

  it('never returns an invalid score', () => {
    expect(resolveOverallScore({} as never)).toBe(5)
  })
})

describe('MockAiProvider', () => {
  it('produces output that satisfies the real schema', async () => {
    const provider = new MockAiProvider()
    const prompt = buildAnalysisPrompt({
      video: {
        title: 'I Built a SaaS in 7 Days',
        description: 'desc',
        url: 'https://youtube.com/watch?v=abc',
        publishedAt: new Date('2025-01-01'),
        durationSeconds: 600,
        viewCount: 1000,
        likeCount: 100,
        commentCount: 10,
        tags: ['saas'],
        categoryId: '28',
        thumbnailUrl: 'https://example.com/t.jpg',
      },
      channel: { title: 'Demo', handle: '@demo', description: null, recentVideoTitles: [], commonFormats: [], averageOverallScore: null },
      transcriptStatus: 'AVAILABLE',
      transcriptText: 'Hello world transcript.',
    })

    const result = await provider.complete({ system: SYSTEM_PROMPT, prompt })
    const parsed = parseAnalysisJson(result.text)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.data.executiveSummary.topTakeaways.length).toBeGreaterThan(0)
      expect(parsed.data.analysisConfidence.transcriptUsed).toBe(true)
    }
  })

  it('flags low confidence when there is no transcript', async () => {
    const provider = new MockAiProvider()
    const prompt = buildAnalysisPrompt({
      video: {
        title: 'No transcript video',
        description: null,
        url: 'https://youtube.com/watch?v=xyz',
        publishedAt: new Date('2025-01-01'),
        durationSeconds: null,
        viewCount: null,
        likeCount: null,
        commentCount: null,
        tags: [],
        categoryId: null,
        thumbnailUrl: null,
      },
      channel: { title: 'Demo', handle: null, description: null, recentVideoTitles: [], commonFormats: [], averageOverallScore: null },
      transcriptStatus: 'UNAVAILABLE',
    })
    const result = await provider.complete({ system: SYSTEM_PROMPT, prompt })
    const parsed = parseAnalysisJson(result.text)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.data.analysisConfidence.transcriptUsed).toBe(false)
      expect(parsed.data.analysisConfidence.level).toBe('low')
    }
  })
})

describe('prompt safety rules', () => {
  it('tells the model to hedge inferences and stay original', () => {
    expect(SYSTEM_PROMPT).toMatch(/likely/)
    expect(SYSTEM_PROMPT).toMatch(/ORIGINAL/)
    expect(SYSTEM_PROMPT).toMatch(/Never reproduce long passages/)
  })

  it('marks the transcript as unavailable in the prompt when there is none', () => {
    const prompt = buildAnalysisPrompt({
      video: {
        title: 't',
        description: null,
        url: 'u',
        publishedAt: new Date(),
        durationSeconds: null,
        viewCount: null,
        likeCount: null,
        commentCount: null,
        tags: [],
        categoryId: null,
        thumbnailUrl: null,
      },
      channel: { title: 'c', handle: null, description: null, recentVideoTitles: [], commonFormats: [], averageOverallScore: null },
      transcriptStatus: 'UNAVAILABLE',
    })
    expect(prompt).toMatch(/TRANSCRIPT STATUS: NOT AVAILABLE/)
  })
})

describe('chunking and cost', () => {
  it('splits timed segments into labelled chunks', () => {
    const segments = Array.from({ length: 200 }, (_, i) => ({
      start: i * 5,
      duration: 5,
      text: 'x'.repeat(100),
    }))
    const chunks = chunkTranscript(segments, segments.map((s) => s.text).join(' '), 2000)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks[0].label).toMatch(/\d+:\d\d–\d+:\d\d/)
    expect(chunks[0].index).toBe(0)
  })

  it('falls back to plain-text chunking with no segments', () => {
    const text = 'Sentence one. '.repeat(500)
    const chunks = chunkTranscript([], text, 1000)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((c) => c.text.length > 0)).toBe(true)
  })

  it('estimates tokens and cost', () => {
    expect(estimateTokens('a'.repeat(400))).toBe(100)
    expect(estimateCostUsd('claude-sonnet-4-5', 1_000_000, 0)).toBeCloseTo(3, 5)
  })
})
