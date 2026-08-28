import { formatDuration } from '../utils'
import type { TranscriptChunk } from './chunk'
import { PROMPT_VERSION } from './schema'

export { PROMPT_VERSION }

export type PromptVideoContext = {
  title: string
  description: string | null
  url: string
  publishedAt: Date
  durationSeconds: number | null
  viewCount: number | null
  likeCount: number | null
  commentCount: number | null
  tags: string[]
  categoryId: string | null
  thumbnailUrl: string | null
}

export type PromptChannelContext = {
  title: string
  handle: string | null
  description: string | null
  /** Titles of recent videos from the same channel, so the model sees patterns. */
  recentVideoTitles: string[]
  /** Formats seen previously on this channel, e.g. "tutorial x4, case_study x2". */
  commonFormats: string[]
  averageOverallScore: number | null
}

export type BuildAnalysisPromptInput = {
  video: PromptVideoContext
  channel: PromptChannelContext
  transcriptStatus: 'AVAILABLE' | 'UNAVAILABLE' | 'PENDING' | 'FAILED' | 'RETRYING'
  /** Full (possibly trimmed) timestamped transcript, when we have one. */
  transcriptText?: string | null
  /** Per-chunk summaries, used instead of the transcript when it is very long. */
  sectionSummaries?: string[] | null
  transcriptLanguage?: string | null
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

export const SYSTEM_PROMPT = `You are a senior YouTube content strategist and product analyst.
You analyse a single video and return ONE JSON object describing its content strategy, and — when the video discusses a product, tool, app or business idea — whether that idea is worth building.

NON-NEGOTIABLE RULES

1. OUTPUT FORMAT
   - Return ONLY a single valid JSON object.
   - No markdown, no code fences, no commentary before or after the JSON.
   - Every key described in the schema must be present. Use null or [] when you genuinely have nothing.

2. FACT VS INFERENCE
   - Anything you can point to in the transcript, title, description or metadata is a verified fact.
   - Everything else is inference. Word inferences with "likely", "suggests", "may", "appears to".
   - Never state retention, watch time, click-through rate or viewer psychology as fact. You have no analytics data.
   - In script.keyClaims, set "basis" to "verified" only when the claim is actually stated in the supplied material.

3. COPYRIGHT AND ORIGINALITY
   - Never reproduce long passages of the transcript. Quote at most a short phrase, and only when necessary.
   - Never tell the user to copy another creator's script, wording, thumbnail or distinctive creative expression.
   - All recommended titles, hooks and video ideas must be ORIGINAL — new angles serving the same underlying viewer demand, not rewrites of this video's title.

4. QUALITY
   - Be concrete and specific. "Improve the hook" is useless; "open on the $9,000 MRR number instead of the backstory" is useful.
   - Be concise. Every field should earn its place.
   - Scores are integers from 1 to 10. Be honest and use the full range — do not default everything to 7 or 8.

5. LIMITED INPUT
   - If no transcript is supplied, analyse the metadata only, keep hook/structure claims explicitly speculative, set analysisConfidence.level to "low", and list what you could not assess in analysisConfidence.limitations.`

// ---------------------------------------------------------------------------
// The JSON shape we hand to the model (mirrors src/lib/ai/schema.ts)
// ---------------------------------------------------------------------------

export const JSON_SHAPE = `{
  "coreTopic": "string — the subject of the video in a few words",
  "premise": "string — one sentence: what this video is and what it promises",
  "targetAudience": {
    "description": "string — who this is for, as specifically as possible",
    "experienceLevel": "low | medium | high",
    "painPoints": ["string"],
    "desires": ["string"],
    "fears": ["string"],
    "motivations": ["string"]
  },
  "mainPromise": "string — the explicit or implied promise of the title and opening",
  "format": {
    "primary": "tutorial | listicle | story | commentary | news_reactive | case_study | comparison | review | educational | other",
    "secondary": "string or null",
    "rationale": "string"
  },
  "hook": {
    "summary": "string — what happens in the first 15-30 seconds",
    "type": "string — e.g. bold claim, result reveal, question, problem statement, contrarian take",
    "whyItMayWork": "string",
    "whyItMayNotWork": "string",
    "strengthScore": 1
  },
  "structure": {
    "sections": [{ "title": "string", "timestamp": "mm:ss or null", "summary": "string" }],
    "openLoops": ["string — questions raised early and answered later"],
    "patternInterrupts": ["string"],
    "narrativeArc": "string",
    "pacingObservations": "string"
  },
  "script": {
    "keyClaims": [{ "claim": "string", "basis": "verified | inferred", "support": "string — what backs it up" }],
    "emotionalTriggers": ["string"],
    "repeatedThemes": ["string"],
    "clarityAndSpecificity": "string",
    "weakOrVagueSections": ["string"]
  },
  "packaging": {
    "titleAnalysis": "string",
    "titleFormula": "string — the reusable pattern, e.g. 'I did X for Y and here is what happened'",
    "curiosityGap": "string",
    "clarity": "string",
    "keywordTargeting": ["string"],
    "thumbnailAnalysis": "string or null — only if a thumbnail image was supplied to you",
    "alignmentNotes": "string — do title, thumbnail, hook and actual delivery match?"
  },
  "contentStrategy": {
    "whyItCouldPerform": "string",
    "ideaStrengths": ["string"],
    "ideaWeaknesses": ["string"],
    "audienceDemandServed": "string",
    "differentiation": "string",
    "missedOpportunities": ["string"],
    "contentGapObservations": ["string"]
  },
  "productValidation": {
    "productDiscussed": true,
    "productIdea": "string or null — the product, tool, app or business idea discussed in the video",
    "problemSolved": "string",
    "marketDemandSignals": ["string — evidence from the video or metadata that people want this"],
    "feasibility": "low | medium | high",
    "buildComplexity": "low | medium | high",
    "estimatedBuildEffort": "string — e.g. '3-5 weeks for one full-stack developer'",
    "suggestedStack": ["string"],
    "mvpScope": ["string — the smallest set of features worth shipping first"],
    "improvementFeatures": [{ "feature": "string", "whyItMatters": "string", "effort": "low | medium | high" }],
    "risks": ["string"],
    "existingAlternatives": ["string — products that already do this"],
    "buildVerdict": "build | explore | skip | not_applicable",
    "confidenceScore": 1,
    "rationale": "string — why you reached that verdict"
  },
  "ethicalInspiration": {
    "strategiesToLearnFrom": ["string — general, reusable strategy, never wording to copy"],
    "whatNotToCopy": ["string — creative expression that belongs to this creator"]
  },
  "recommendations": {
    "originalVideoIdeas": [{ "title": "string", "angle": "string", "whyItCouldWork": "string" }],
    "alternativeTitles": ["string — original titles for YOUR future videos"],
    "hookIdeas": ["string — original hooks for YOUR future videos"],
    "improvementSuggestions": ["string — how to make a similar original video better"]
  },
  "scorecard": {
    "topicStrength": 1,
    "audienceSpecificity": 1,
    "titleStrength": 1,
    "hookStrength": 1,
    "structureRetentionPotential": 1,
    "differentiation": 1,
    "actionabilityValue": 1,
    "repurposingPotential": 1,
    "overall": 1
  },
  "executiveSummary": {
    "summary": "string — 5 to 8 sentences",
    "verdict": "strong | average | weak",
    "mostImportantTakeaway": "string",
    "topTakeaways": ["string", "string", "string"]
  },
  "analysisConfidence": {
    "transcriptUsed": true,
    "level": "low | medium | high",
    "limitations": ["string"]
  }
}`

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function metadataBlock(video: PromptVideoContext, channel: PromptChannelContext): string {
  const lines = [
    `Channel: ${channel.title}${channel.handle ? ` (${channel.handle})` : ''}`,
    `Video title: ${video.title}`,
    `URL: ${video.url}`,
    `Published: ${video.publishedAt.toISOString()}`,
    `Duration: ${formatDuration(video.durationSeconds)}`,
    `Views: ${video.viewCount ?? 'unknown'} | Likes: ${video.likeCount ?? 'unknown'} | Comments: ${video.commentCount ?? 'unknown'}`,
    `Tags: ${video.tags.length ? video.tags.slice(0, 20).join(', ') : 'none'}`,
    `YouTube category id: ${video.categoryId ?? 'unknown'}`,
    `Thumbnail URL: ${video.thumbnailUrl ?? 'none'}`,
  ]
  if (video.description) {
    lines.push(`\nVideo description (verbatim, may include timestamps):\n"""\n${video.description.slice(0, 4000)}\n"""`)
  }
  return lines.join('\n')
}

function channelContextBlock(channel: PromptChannelContext): string {
  if (!channel.recentVideoTitles.length && !channel.commonFormats.length) {
    return 'No prior analysed videos exist for this channel yet.'
  }
  const parts: string[] = []
  if (channel.recentVideoTitles.length) {
    parts.push(
      `Recent titles from this channel:\n${channel.recentVideoTitles.slice(0, 12).map((t) => `- ${t}`).join('\n')}`,
    )
  }
  if (channel.commonFormats.length) parts.push(`Formats seen before on this channel: ${channel.commonFormats.join(', ')}`)
  if (channel.averageOverallScore != null) {
    parts.push(`Average overall score of previously analysed videos on this channel: ${channel.averageOverallScore}/10`)
  }
  return parts.join('\n')
}

export function buildAnalysisPrompt(input: BuildAnalysisPromptInput): string {
  const { video, channel, transcriptStatus, transcriptText, sectionSummaries } = input

  let transcriptBlock: string
  if (transcriptStatus === 'AVAILABLE' && sectionSummaries?.length) {
    transcriptBlock =
      `TRANSCRIPT STATUS: available, but long — you are given ordered section summaries produced from the full transcript` +
      `${input.transcriptLanguage ? ` (language: ${input.transcriptLanguage})` : ''}.\n\n` +
      sectionSummaries.map((s, i) => `--- Section ${i + 1} ---\n${s}`).join('\n\n')
  } else if (transcriptStatus === 'AVAILABLE' && transcriptText) {
    transcriptBlock =
      `TRANSCRIPT STATUS: available${input.transcriptLanguage ? ` (language: ${input.transcriptLanguage})` : ''}.\n` +
      `Timestamps in [mm:ss] mark roughly every 30 seconds.\n\n"""\n${transcriptText}\n"""`
  } else {
    transcriptBlock =
      `TRANSCRIPT STATUS: NOT AVAILABLE (${transcriptStatus}).\n` +
      `No transcript could be retrieved for this video. Analyse the metadata only.\n` +
      `Treat every statement about the hook, structure, pacing and script as speculative, set ` +
      `analysisConfidence.level to "low", set analysisConfidence.transcriptUsed to false, and list what you could not assess.`
  }

  return `Analyse the following YouTube video.

=== VIDEO METADATA ===
${metadataBlock(video, channel)}

=== CHANNEL CONTEXT ===
${channelContextBlock(channel)}

=== TRANSCRIPT ===
${transcriptBlock}

=== YOUR TASK ===
Return ONE JSON object matching exactly this shape (same keys, same nesting):

${JSON_SHAPE}

Reminders:
- JSON only. No markdown fences, no text outside the object.
- Distinguish verified facts from inference; hedge inferences with "likely" / "suggests" / "may".
- All recommended titles, hooks and video ideas must be original ideas for the reader's own channel — never rewrites of this creator's title.
- Fill productValidation properly. If the video discusses a product, tool, app, service or business idea, judge whether it is worth building, what an MVP would contain, and which additional features would make it meaningfully better than what already exists. If the video discusses no such idea, set productDiscussed to false and buildVerdict to "not_applicable", and still fill in what you reasonably can from the underlying audience demand.`
}

/** Step 1 of the two-pass flow for very long transcripts. */
export function buildChunkSummaryPrompt(
  chunk: TranscriptChunk,
  video: { title: string },
  totalChunks: number,
): string {
  return `You are summarising one section of a YouTube video transcript so that a strategist can analyse the whole video later.

Video title: ${video.title}
Section ${chunk.index + 1} of ${totalChunks} (${chunk.label})

Write a dense summary of this section in 120-200 words. Include:
- what is covered, in order
- any specific numbers, claims, examples or named tools
- any product, app, tool or business idea mentioned, and what problem it solves
- rhetorical devices used (open loops, callbacks, pattern interrupts)
- approximate timestamps for topic changes, in [mm:ss] form

Do not quote more than a few words verbatim. Return plain prose, no JSON, no preamble.

TRANSCRIPT SECTION:
"""
${chunk.text}
"""`
}

export const CHUNK_SUMMARY_SYSTEM_PROMPT =
  'You produce dense, factual summaries of transcript sections. No preamble, no markdown headings, plain prose only.'
