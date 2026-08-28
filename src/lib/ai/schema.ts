import { z } from 'zod'

/**
 * The exact JSON contract we require from the AI model.
 *
 * Design notes:
 *  - Scores use `.catch(5)` and enums use `.catch(...)` so one odd value from
 *    the model does not throw away an otherwise excellent report.
 *  - Descriptive strings default to '' rather than failing.
 *  - Anything genuinely load-bearing (summary, verdict, scorecard) is required.
 *  - `promptVersion` below MUST be bumped whenever this shape changes, so old
 *    reports in the database remain traceable to the prompt that made them.
 */

export const PROMPT_VERSION = 'v1.0.0'

const Score = z.coerce.number().min(1).max(10).catch(5)
const Text = z.string().default('')
const List = (max = 12) => z.array(z.string()).default([]).transform((a) => a.slice(0, max))

export const VIDEO_FORMATS = [
  'tutorial',
  'listicle',
  'story',
  'commentary',
  'news_reactive',
  'case_study',
  'comparison',
  'review',
  'educational',
  'other',
] as const

export const VERDICTS = ['strong', 'average', 'weak'] as const
export const BUILD_VERDICTS = ['build', 'explore', 'skip', 'not_applicable'] as const
export const LEVELS = ['low', 'medium', 'high'] as const

export const AnalysisSchema = z.object({
  // 1. Core topic
  coreTopic: z.string().min(1),
  premise: z.string().min(1).describe('One sentence describing what the video is'),

  // 2 + 3. Audience
  targetAudience: z
    .object({
      description: Text,
      experienceLevel: z.enum(LEVELS).catch('medium'),
      painPoints: List(),
      desires: List(),
      fears: List(),
      motivations: List(),
    })
    .default({}),

  // 4. Promise
  mainPromise: Text,

  // 5. Format
  format: z
    .object({
      primary: z.enum(VIDEO_FORMATS).catch('other'),
      secondary: z.string().nullable().default(null),
      rationale: Text,
    })
    .default({}),

  // 6. Hook
  hook: z
    .object({
      summary: Text.describe('What happens in the first 15-30 seconds'),
      type: Text,
      whyItMayWork: Text,
      whyItMayNotWork: Text,
      strengthScore: Score,
    })
    .default({}),

  // 7. Structure
  structure: z
    .object({
      sections: z
        .array(
          z.object({
            title: z.string().default('Section'),
            timestamp: z.string().nullable().default(null).describe('mm:ss when known, else null'),
            summary: Text,
          }),
        )
        .default([])
        .transform((a) => a.slice(0, 20)),
      openLoops: List(),
      patternInterrupts: List(),
      narrativeArc: Text,
      pacingObservations: Text,
    })
    .default({}),

  // 8. Script & communication
  script: z
    .object({
      keyClaims: z
        .array(
          z.object({
            claim: z.string().default(''),
            /** 'verified' = stated in transcript/metadata. 'inferred' = the model's read. */
            basis: z.enum(['verified', 'inferred']).catch('inferred'),
            support: Text,
          }),
        )
        .default([])
        .transform((a) => a.slice(0, 12)),
      emotionalTriggers: List(),
      repeatedThemes: List(),
      clarityAndSpecificity: Text,
      weakOrVagueSections: List(),
    })
    .default({}),

  // 9. Packaging
  packaging: z
    .object({
      titleAnalysis: Text,
      titleFormula: Text,
      curiosityGap: Text,
      clarity: Text,
      keywordTargeting: List(),
      thumbnailAnalysis: z.string().nullable().default(null),
      alignmentNotes: Text.describe('Do title, thumbnail, hook and delivery match?'),
    })
    .default({}),

  // 10. Content strategy
  contentStrategy: z
    .object({
      whyItCouldPerform: Text,
      ideaStrengths: List(),
      ideaWeaknesses: List(),
      audienceDemandServed: Text,
      differentiation: Text,
      missedOpportunities: List(),
      contentGapObservations: List(),
    })
    .default({}),

  // 11. Product / idea validation  (the "can we build this?" section)
  productValidation: z
    .object({
      productDiscussed: z.boolean().default(false),
      productIdea: z.string().nullable().default(null),
      problemSolved: Text,
      marketDemandSignals: List(),
      feasibility: z.enum(LEVELS).catch('medium'),
      buildComplexity: z.enum(LEVELS).catch('medium'),
      estimatedBuildEffort: Text.describe('e.g. "2-4 weeks for a solo developer"'),
      suggestedStack: List(8),
      mvpScope: List(8).describe('Smallest set of features worth shipping'),
      improvementFeatures: z
        .array(
          z.object({
            feature: z.string().default(''),
            whyItMatters: Text,
            effort: z.enum(LEVELS).catch('medium'),
          }),
        )
        .default([])
        .transform((a) => a.slice(0, 10)),
      risks: List(8),
      existingAlternatives: List(8),
      buildVerdict: z.enum(BUILD_VERDICTS).catch('not_applicable'),
      confidenceScore: Score,
      rationale: Text,
    })
    .default({}),

  // 12. Ethical inspiration
  ethicalInspiration: z
    .object({
      strategiesToLearnFrom: List(),
      whatNotToCopy: List(),
    })
    .default({}),

  // 13. Recommendations (all ORIGINAL, not rewrites)
  recommendations: z
    .object({
      originalVideoIdeas: z
        .array(
          z.object({
            title: z.string().default(''),
            angle: Text,
            whyItCouldWork: Text,
          }),
        )
        .default([])
        .transform((a) => a.slice(0, 6)),
      alternativeTitles: List(6),
      hookIdeas: List(6),
      improvementSuggestions: List(8),
    })
    .default({}),

  // 14. Scorecard
  scorecard: z
    .object({
      topicStrength: Score,
      audienceSpecificity: Score,
      titleStrength: Score,
      hookStrength: Score,
      structureRetentionPotential: Score,
      differentiation: Score,
      actionabilityValue: Score,
      repurposingPotential: Score,
      overall: Score,
    })
    .default({}),

  // 15. Executive summary
  executiveSummary: z.object({
    summary: z.string().min(1).describe('5-8 sentences'),
    verdict: z.enum(VERDICTS).catch('average'),
    mostImportantTakeaway: Text,
    topTakeaways: List(5),
  }),

  // Confidence / provenance
  analysisConfidence: z
    .object({
      transcriptUsed: z.boolean().default(false),
      level: z.enum(LEVELS).catch('medium'),
      limitations: List(6),
    })
    .default({}),
})

export type Analysis = z.infer<typeof AnalysisSchema>

/** Human-readable labels used across the UI. */
export const FORMAT_LABELS: Record<(typeof VIDEO_FORMATS)[number], string> = {
  tutorial: 'Tutorial',
  listicle: 'Listicle',
  story: 'Story',
  commentary: 'Commentary',
  news_reactive: 'News / Reactive',
  case_study: 'Case study',
  comparison: 'Comparison',
  review: 'Review',
  educational: 'Educational',
  other: 'Other',
}

export const SCORE_LABELS: Record<keyof Analysis['scorecard'], string> = {
  topicStrength: 'Topic strength',
  audienceSpecificity: 'Audience specificity',
  titleStrength: 'Title strength',
  hookStrength: 'Hook strength',
  structureRetentionPotential: 'Structure / retention',
  differentiation: 'Differentiation',
  actionabilityValue: 'Actionability & value',
  repurposingPotential: 'Repurposing potential',
  overall: 'Overall',
}

/**
 * Parses model output. Models sometimes wrap JSON in ```json fences or add a
 * sentence before it, so we recover the outermost JSON object first.
 */
export function parseAnalysisJson(raw: string): { ok: true; data: Analysis } | { ok: false; error: string } {
  const candidate = extractJsonObject(raw)
  if (!candidate) return { ok: false, error: 'No JSON object found in the model response.' }

  let json: unknown
  try {
    json = JSON.parse(candidate)
  } catch (err) {
    return { ok: false, error: `Model returned invalid JSON: ${(err as Error).message}` }
  }

  const parsed = AnalysisSchema.safeParse(json)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 8)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ')
    return { ok: false, error: `Model JSON did not match the required schema -> ${issues}` }
  }
  return { ok: true, data: parsed.data }
}

export function extractJsonObject(raw: string): string | null {
  const text = raw.trim()
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  const body = fenced ? fenced[1].trim() : text

  const start = body.indexOf('{')
  if (start === -1) return null

  // Walk the string to find the matching closing brace, ignoring braces in strings.
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < body.length; i++) {
    const ch = body[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return body.slice(start, i + 1)
    }
  }
  return null
}

/** Overall score, falling back to the mean of the other eight if the model omitted it. */
export function resolveOverallScore(scorecard: Analysis['scorecard']): number {
  if (typeof scorecard.overall === 'number' && scorecard.overall >= 1) {
    return Math.round(scorecard.overall * 10) / 10
  }
  const others = Object.entries(scorecard)
    .filter(([k]) => k !== 'overall')
    .map(([, v]) => v)
    .filter((v): v is number => typeof v === 'number')
  if (!others.length) return 5
  return Math.round((others.reduce((a, b) => a + b, 0) / others.length) * 10) / 10
}
