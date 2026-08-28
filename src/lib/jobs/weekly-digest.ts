import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../prisma'
import { createLogger, safeErrorMessage } from '../logger'
import { env } from '../env'
import { getPreferences } from '../settings'
import { getAiProvider } from '../ai'
import { extractJsonObject, type Analysis } from '../ai/schema'
import { renderWeeklyDigestEmail, sendToAdmin } from '../email'
import { addDays, average, startOfWeekUtc } from '../utils'
import { computeChannelInsights } from '../insights'

const log = createLogger('jobs:digest')

const DigestAiSchema = z.object({
  summary: z.string().min(1),
  whatChanged: z.string().min(1),
  repeatedThemes: z.array(z.string()).default([]),
  repeatedHooks: z.array(z.string()).default([]),
  repeatedTitleStructures: z.array(z.string()).default([]),
  strongestOpportunityThemes: z.array(z.string()).default([]),
  opportunities: z
    .array(z.object({ title: z.string(), why: z.string(), format: z.string().default('') }))
    .default([]),
})
export type DigestAiData = z.infer<typeof DigestAiSchema>

export type WeeklyDigestData = DigestAiData & {
  weekStart: string
  weekEnd: string
  videoCount: number
  channelCount: number
  averageScore: number | null
  byChannel: {
    channelId: string
    channelTitle: string
    videos: { id: string; title: string; url: string; score: number | null; verdict: string | null }[]
    commonFormats: { label: string; count: number }[]
  }[]
  buildWorthyIdeas: { idea: string; verdict: string; videoTitle: string }[]
}

const DIGEST_SYSTEM_PROMPT = `You are a YouTube content strategist writing a weekly intelligence digest for one operator.
Return ONLY a single JSON object. No markdown fences, no text outside the JSON.
Be specific and concrete. Hedge inferences with "likely" / "suggests" / "may".
All content opportunities must be ORIGINAL ideas for the reader's own channel — never rewrites of another creator's titles.`

/**
 * Builds (and emails) the digest for the week containing `reference`.
 * Re-running for the same week updates the stored digest instead of duplicating it.
 */
export async function generateWeeklyDigest(
  options: { reference?: Date; skipEmail?: boolean } = {},
): Promise<{ digestId: string; videoCount: number; emailed: boolean; emailMessage: string }> {
  const reference = options.reference ?? new Date()
  // The digest covers the 7 days BEFORE the current week starts... in practice
  // we want "the last completed 7 days", so use the current week's Monday and
  // look back 7 days when it is still early in the week.
  const thisWeekStart = startOfWeekUtc(reference)
  const weekStart = reference.getTime() - thisWeekStart.getTime() < 24 * 3600 * 1000 ? addDays(thisWeekStart, -7) : thisWeekStart
  const weekEnd = addDays(weekStart, 7)

  const reports = await prisma.analysisReport.findMany({
    where: { analysisStatus: 'COMPLETED', generatedAt: { gte: weekStart, lt: weekEnd } },
    include: { video: { include: { channel: true } } },
    orderBy: { generatedAt: 'desc' },
  })

  const prefs = await getPreferences()
  const byChannelMap = new Map<string, WeeklyDigestData['byChannel'][number]>()
  const allIdeas: WeeklyDigestData['buildWorthyIdeas'] = []
  const scores: number[] = []

  for (const report of reports) {
    const channel = report.video.channel
    if (!byChannelMap.has(channel.id)) {
      byChannelMap.set(channel.id, {
        channelId: channel.id,
        channelTitle: channel.title,
        videos: [],
        commonFormats: [],
      })
    }
    byChannelMap.get(channel.id)!.videos.push({
      id: report.video.id,
      title: report.video.title,
      url: report.video.url,
      score: report.overallScore,
      verdict: report.verdict,
    })
    if (typeof report.overallScore === 'number') scores.push(report.overallScore)

    const analysis = report.structuredData as unknown as Analysis | null
    const pv = analysis?.productValidation
    if (pv?.productIdea && (pv.buildVerdict === 'build' || pv.buildVerdict === 'explore')) {
      allIdeas.push({ idea: pv.productIdea, verdict: pv.buildVerdict, videoTitle: report.video.title })
    }
  }

  // Per-channel format counts reuse the same pure helper as the channel page.
  for (const entry of byChannelMap.values()) {
    const channelReports = reports
      .filter((r) => r.video.channelId === entry.channelId)
      .map((r) => ({
        overallScore: r.overallScore,
        generatedAt: r.generatedAt,
        structuredData: r.structuredData,
        videoTitle: r.video.title,
        publishedAt: r.video.publishedAt,
      }))
    entry.commonFormats = computeChannelInsights(channelReports).commonFormats
  }

  const byChannel = [...byChannelMap.values()]
  const aiData = reports.length
    ? await generateDigestNarrative(reports, weekStart, weekEnd)
    : emptyNarrative(weekStart, weekEnd)

  const structuredData: WeeklyDigestData = {
    ...aiData,
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
    videoCount: reports.length,
    channelCount: byChannel.length,
    averageScore: average(scores),
    byChannel,
    buildWorthyIdeas: allIdeas.slice(0, 8),
  }

  const digest = await prisma.weeklyDigest.upsert({
    where: { weekStart_weekEnd: { weekStart, weekEnd } },
    create: {
      weekStart,
      weekEnd,
      structuredData: structuredData as unknown as Prisma.InputJsonValue,
      summary: aiData.summary,
      videoCount: reports.length,
    },
    update: {
      structuredData: structuredData as unknown as Prisma.InputJsonValue,
      summary: aiData.summary,
      videoCount: reports.length,
    },
  })

  let emailed = false
  let emailMessage = 'Weekly digest email disabled in Settings.'
  if (!options.skipEmail && prefs.weeklyDigestEnabled) {
    const baseUrl = env.APP_BASE_URL.replace(/\/$/, '')
    const email = renderWeeklyDigestEmail({
      appName: prefs.appName,
      weekStart,
      weekEnd: addDays(weekEnd, -1),
      videoCount: reports.length,
      channelCount: byChannel.length,
      summary: aiData.summary,
      whatChanged: aiData.whatChanged,
      byChannel: byChannel.map((c) => ({
        channelTitle: c.channelTitle,
        videos: c.videos.map((v) => ({ title: v.title, score: v.score, url: `${baseUrl}/videos/${v.id}` })),
      })),
      repeatedThemes: aiData.repeatedThemes,
      opportunities: aiData.opportunities.slice(0, 5),
      digestUrl: `${baseUrl}/digests/${digest.id}`,
    })
    const result = await sendToAdmin(email)
    emailed = result.ok
    emailMessage = result.message
    if (result.ok) await prisma.weeklyDigest.update({ where: { id: digest.id }, data: { sentAt: new Date() } })
  }

  log.info('Weekly digest generated', { weekStart: weekStart.toISOString(), videos: reports.length, emailed })
  return { digestId: digest.id, videoCount: reports.length, emailed, emailMessage }
}

type ReportWithVideo = Prisma.AnalysisReportGetPayload<{ include: { video: { include: { channel: true } } } }>

async function generateDigestNarrative(
  reports: ReportWithVideo[],
  weekStart: Date,
  weekEnd: Date,
): Promise<DigestAiData> {
  const lines = reports.slice(0, 40).map((r) => {
    const a = r.structuredData as unknown as Analysis | null
    return [
      `- Channel: ${r.video.channel.title}`,
      `  Title: ${r.video.title}`,
      `  Format: ${a?.format?.primary ?? 'unknown'} | Score: ${r.overallScore ?? '—'}/10 | Verdict: ${r.verdict ?? '—'}`,
      `  Topic: ${a?.coreTopic ?? 'unknown'}`,
      `  Hook type: ${a?.hook?.type ?? 'unknown'}`,
      `  Takeaway: ${a?.executiveSummary?.mostImportantTakeaway ?? '—'}`,
      a?.productValidation?.productIdea ? `  Product idea: ${a.productValidation.productIdea} (${a.productValidation.buildVerdict})` : '',
    ]
      .filter(Boolean)
      .join('\n')
  })

  const prompt = `Here are the videos analysed between ${weekStart.toISOString().slice(0, 10)} and ${weekEnd.toISOString().slice(0, 10)}.

${lines.join('\n\n')}

Write the weekly digest as ONE JSON object with exactly these keys:
{
  "summary": "string — 4 to 6 sentences summarising the week across all channels",
  "whatChanged": "string — 2 to 4 sentences on what is different from a typical week: new topics, shifts in format, notable outliers",
  "repeatedThemes": ["string — topics that appeared on more than one channel or more than once"],
  "repeatedHooks": ["string — hook patterns that recurred"],
  "repeatedTitleStructures": ["string — title formulas that recurred"],
  "strongestOpportunityThemes": ["string — the underlying viewer demands with the most room left"],
  "opportunities": [{ "title": "string — an ORIGINAL video title for the reader's own channel", "why": "string — the demand it serves and why now", "format": "string" }]
}

Return exactly 5 items in "opportunities". JSON only.`

  try {
    const provider = await getAiProvider()
    const result = await provider.complete({
      system: DIGEST_SYSTEM_PROMPT,
      prompt,
      maxTokens: 3000,
      temperature: 0.4,
    })
    const json = extractJsonObject(result.text)
    if (json) {
      const parsed = DigestAiSchema.safeParse(JSON.parse(json))
      if (parsed.success) return parsed.data
      log.warn('Digest JSON failed validation, using a computed fallback', { issue: parsed.error.issues[0]?.message })
    }
  } catch (err) {
    log.error('Digest narrative generation failed, using a computed fallback', { message: safeErrorMessage(err) })
  }
  return computedFallback(reports, weekStart, weekEnd)
}

/** If the AI call fails, the digest still ships — built from the data we already have. */
function computedFallback(reports: ReportWithVideo[], weekStart: Date, weekEnd: Date): DigestAiData {
  const channels = new Set(reports.map((r) => r.video.channel.title))
  const scores = reports.map((r) => r.overallScore).filter((s): s is number => typeof s === 'number')
  const insights = computeChannelInsights(
    reports.map((r) => ({
      overallScore: r.overallScore,
      generatedAt: r.generatedAt,
      structuredData: r.structuredData,
      videoTitle: r.video.title,
      publishedAt: r.video.publishedAt,
    })),
  )
  return {
    summary:
      `${reports.length} videos were analysed across ${channels.size} channels between ` +
      `${weekStart.toISOString().slice(0, 10)} and ${weekEnd.toISOString().slice(0, 10)}. ` +
      `The average overall score was ${average(scores) ?? '—'}/10. ` +
      `The most common formats were ${insights.commonFormats.map((f) => f.label).join(', ') || 'not determined'}. ` +
      `This summary was generated without an AI call because the model was unavailable.`,
    whatChanged: 'AI narrative was unavailable this week, so this digest reports computed statistics only.',
    repeatedThemes: insights.commonTopics.map((t) => t.label),
    repeatedHooks: [],
    repeatedTitleStructures: insights.titlePatterns.map((p) => p.label),
    strongestOpportunityThemes: insights.commonTopics.slice(0, 3).map((t) => t.label),
    opportunities: insights.buildWorthyIdeas.slice(0, 5).map((idea) => ({
      title: `Explore: ${idea.idea}`,
      why: `Surfaced from "${idea.videoTitle}" with a "${idea.verdict}" verdict.`,
      format: '',
    })),
  }
}

function emptyNarrative(weekStart: Date, weekEnd: Date): DigestAiData {
  return {
    summary: `No videos were analysed between ${weekStart.toISOString().slice(0, 10)} and ${weekEnd.toISOString().slice(0, 10)}.`,
    whatChanged: 'Nothing changed — no monitored channel published a new video in this window.',
    repeatedThemes: [],
    repeatedHooks: [],
    repeatedTitleStructures: [],
    strongestOpportunityThemes: [],
    opportunities: [],
  }
}
