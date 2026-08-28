import type { Analysis } from './ai/schema'
import { FORMAT_LABELS } from './ai/schema'
import { average } from './utils'

/**
 * Channel-level pattern detection. Pure functions over saved reports, so the
 * UI can render insights without another AI call.
 */

export type ReportLike = {
  overallScore: number | null
  generatedAt: Date | null
  structuredData: unknown
  videoTitle: string
  publishedAt: Date
}

export type ChannelInsights = {
  reportCount: number
  commonFormats: { label: string; count: number }[]
  commonTopics: { label: string; count: number }[]
  titlePatterns: { label: string; count: number }[]
  averageScores: Record<string, number | null>
  averageOverall: number | null
  recentTrend: { direction: 'up' | 'down' | 'flat'; delta: number | null; note: string }
  strongestVideo: { title: string; score: number } | null
  weakestVideo: { title: string; score: number } | null
  buildWorthyIdeas: { idea: string; verdict: string; videoTitle: string }[]
}

const SCORE_KEYS = [
  'topicStrength',
  'audienceSpecificity',
  'titleStrength',
  'hookStrength',
  'structureRetentionPotential',
  'differentiation',
  'actionabilityValue',
  'repurposingPotential',
  'overall',
] as const

const STOPWORDS = new Set([
  'the','a','an','and','or','but','for','to','of','in','on','with','how','why','what','this','that','is','are','was',
  'it','i','my','your','you','we','me','from','at','by','as','be','can','do','did','has','have','not','no','so','if',
  'about','into','out','up','down','one','two','more','most','best','new','get','got','make','made','using','use',
])

function toAnalysis(value: unknown): Analysis | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<Analysis>
  return candidate.executiveSummary ? (candidate as Analysis) : null
}

function topN(counts: Map<string, number>, n: number) {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([label, count]) => ({ label, count }))
}

/** Very rough title-shape classifier — good enough to spot repetition. */
export function detectTitlePattern(title: string): string {
  const t = title.toLowerCase()
  if (/^\d+\s/.test(title) || /\b(top|best)\s+\d+/.test(t)) return 'Numbered list'
  if (/^how (to|i)\b/.test(t)) return '"How to / How I"'
  if (/^why\b/.test(t)) return '"Why ..."'
  if (/^(i|we)\s+(built|made|tried|tested|spent|analysed|analyzed|ran)/.test(t)) return 'First-person experiment'
  if (/\bvs\.?\b|\bversus\b/.test(t)) return 'Comparison'
  if (/\?$/.test(title)) return 'Question'
  if (/\bstop\b|\bnever\b|\bdon'?t\b/.test(t)) return 'Contrarian / warning'
  if (/\b(guide|tutorial|explained|walkthrough)\b/.test(t)) return 'Guide / explainer'
  if (/[:—-]/.test(title)) return 'Claim + qualifier'
  return 'Plain statement'
}

export function computeChannelInsights(reports: ReportLike[]): ChannelInsights {
  const formats = new Map<string, number>()
  const topics = new Map<string, number>()
  const patterns = new Map<string, number>()
  const scoreBuckets = new Map<string, number[]>()
  const overallScores: { title: string; score: number; generatedAt: Date | null }[] = []
  const buildWorthyIdeas: ChannelInsights['buildWorthyIdeas'] = []

  for (const report of reports) {
    patterns.set(detectTitlePattern(report.videoTitle), (patterns.get(detectTitlePattern(report.videoTitle)) ?? 0) + 1)

    const analysis = toAnalysis(report.structuredData)
    if (!analysis) continue

    const format = analysis.format?.primary
    if (format) {
      const label = FORMAT_LABELS[format] ?? format
      formats.set(label, (formats.get(label) ?? 0) + 1)
    }

    for (const word of (analysis.coreTopic ?? '').toLowerCase().split(/[^a-z0-9+#]+/)) {
      if (word.length < 4 || STOPWORDS.has(word)) continue
      topics.set(word, (topics.get(word) ?? 0) + 1)
    }

    for (const key of SCORE_KEYS) {
      const value = analysis.scorecard?.[key]
      if (typeof value === 'number') {
        const list = scoreBuckets.get(key) ?? []
        list.push(value)
        scoreBuckets.set(key, list)
      }
    }

    if (typeof report.overallScore === 'number') {
      overallScores.push({ title: report.videoTitle, score: report.overallScore, generatedAt: report.generatedAt })
    }

    const pv = analysis.productValidation
    if (pv?.productIdea && (pv.buildVerdict === 'build' || pv.buildVerdict === 'explore')) {
      buildWorthyIdeas.push({ idea: pv.productIdea, verdict: pv.buildVerdict, videoTitle: report.videoTitle })
    }
  }

  const averageScores: Record<string, number | null> = {}
  for (const key of SCORE_KEYS) averageScores[key] = average(scoreBuckets.get(key) ?? [])

  const sortedByScore = [...overallScores].sort((a, b) => b.score - a.score)
  const chronological = [...overallScores].sort(
    (a, b) => (a.generatedAt?.getTime() ?? 0) - (b.generatedAt?.getTime() ?? 0),
  )

  let recentTrend: ChannelInsights['recentTrend'] = {
    direction: 'flat',
    delta: null,
    note: 'Not enough analysed videos yet to show a trend.',
  }
  if (chronological.length >= 4) {
    const half = Math.floor(chronological.length / 2)
    const older = average(chronological.slice(0, half).map((v) => v.score))
    const newer = average(chronological.slice(half).map((v) => v.score))
    if (older != null && newer != null) {
      const delta = Math.round((newer - older) * 10) / 10
      recentTrend = {
        direction: delta > 0.3 ? 'up' : delta < -0.3 ? 'down' : 'flat',
        delta,
        note:
          delta > 0.3
            ? `Recent videos score ${delta} points higher on average than earlier ones.`
            : delta < -0.3
              ? `Recent videos score ${Math.abs(delta)} points lower on average than earlier ones.`
              : 'Scores have been steady across analysed videos.',
      }
    }
  }

  return {
    reportCount: reports.length,
    commonFormats: topN(formats, 5),
    commonTopics: topN(topics, 8),
    titlePatterns: topN(patterns, 5),
    averageScores,
    averageOverall: average(overallScores.map((v) => v.score)),
    recentTrend,
    strongestVideo: sortedByScore[0] ? { title: sortedByScore[0].title, score: sortedByScore[0].score } : null,
    weakestVideo: sortedByScore.length > 1 ? { title: sortedByScore[sortedByScore.length - 1].title, score: sortedByScore[sortedByScore.length - 1].score } : null,
    buildWorthyIdeas: buildWorthyIdeas.slice(0, 6),
  }
}
