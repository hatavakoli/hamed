import { Prisma } from '@prisma/client'
import { prisma } from '../prisma'
import { createLogger, safeErrorMessage } from '../logger'
import { env } from '../env'
import { getPreferences } from '../settings'
import { runAnalysis, type Analysis } from '../ai'
import { FORMAT_LABELS } from '../ai/schema'
import type { TranscriptSegment } from '../transcript/types'
import { renderNewReportEmail, sendToAdmin } from '../email'
import { average } from '../utils'
import { retrieveTranscript } from './transcript-job'

const log = createLogger('jobs:process')

export type ProcessVideoResult = {
  videoId: string
  youtubeVideoId: string
  transcriptStatus: string
  analysisStatus: string
  overallScore: number | null
  emailed: boolean
  emailMessage: string
  regenerated: boolean
}

/**
 * The end-to-end pipeline for one video:
 *   transcript -> AI analysis -> saved report -> email notification.
 *
 * Safe to call twice: it skips the analysis if a completed report already
 * exists, unless `force` is set (used by "Regenerate analysis").
 */
export async function processVideo(
  videoDbId: string,
  options: { force?: boolean; skipEmail?: boolean } = {},
): Promise<ProcessVideoResult> {
  const video = await prisma.video.findUnique({
    where: { id: videoDbId },
    include: { channel: true, transcript: true, report: true },
  })
  if (!video) throw new Error(`Video ${videoDbId} not found`)

  // Already done and not forced -> nothing to do (idempotency).
  if (!options.force && video.report?.analysisStatus === 'COMPLETED') {
    log.debug('Report already exists, skipping', { videoId: video.youtubeVideoId })
    return {
      videoId: video.id,
      youtubeVideoId: video.youtubeVideoId,
      transcriptStatus: video.transcriptStatus,
      analysisStatus: 'COMPLETED',
      overallScore: video.report.overallScore,
      emailed: false,
      emailMessage: 'Skipped — a completed report already exists.',
      regenerated: false,
    }
  }

  await prisma.video.update({
    where: { id: video.id },
    data: { status: 'PROCESSING', analysisStatus: 'RUNNING' },
  })

  // --- 1. Transcript -------------------------------------------------------
  // A missing transcript is never fatal; we fall back to a metadata-only report.
  //
  // Only PENDING and RETRYING are worth another attempt:
  //   AVAILABLE   -> we already have it
  //   UNAVAILABLE -> the video genuinely has no captions; retrying just burns quota
  //   FAILED      -> automatic retries are exhausted; only the manual button retries
  let transcriptStatus = video.transcript?.status ?? 'PENDING'
  if (transcriptStatus === 'PENDING' || transcriptStatus === 'RETRYING') {
    try {
      const outcome = await retrieveTranscript(video.id)
      transcriptStatus = outcome.status
    } catch (err) {
      log.error('Transcript step threw', { videoId: video.youtubeVideoId, message: safeErrorMessage(err) })
      transcriptStatus = 'FAILED'
    }
  }

  const transcript = await prisma.transcript.findUnique({ where: { videoId: video.id } })
  const hasTranscript = transcript?.status === 'AVAILABLE' && Boolean(transcript.rawText)

  // --- 2. Channel context --------------------------------------------------
  const channelContext = await buildChannelContext(video.channelId, video.id)

  // --- 3. AI analysis ------------------------------------------------------
  try {
    const result = await runAnalysis({
      video: {
        title: video.title,
        description: video.description,
        url: video.url,
        publishedAt: video.publishedAt,
        durationSeconds: video.durationSeconds,
        viewCount: video.viewCount != null ? Number(video.viewCount) : null,
        likeCount: video.likeCount != null ? Number(video.likeCount) : null,
        commentCount: video.commentCount != null ? Number(video.commentCount) : null,
        tags: Array.isArray(video.tags) ? (video.tags as string[]) : [],
        categoryId: video.categoryId,
        thumbnailUrl: video.thumbnailUrl,
      },
      channel: channelContext,
      transcript: {
        status: (transcript?.status ?? 'PENDING') as 'AVAILABLE' | 'UNAVAILABLE' | 'PENDING' | 'FAILED' | 'RETRYING',
        rawText: transcript?.rawText,
        segments: (transcript?.segments as unknown as TranscriptSegment[] | null) ?? [],
        language: transcript?.language,
      },
    })

    const analysis = result.analysis
    const confidence = hasTranscript ? 'high' : 'low'

    await prisma.$transaction([
      prisma.analysisReport.upsert({
        where: { videoId: video.id },
        create: {
          videoId: video.id,
          modelProvider: result.provider,
          modelName: result.model,
          promptVersion: result.promptVersion,
          structuredData: analysis as unknown as Prisma.InputJsonValue,
          executiveSummary: analysis.executiveSummary.summary,
          verdict: analysis.executiveSummary.verdict,
          overallScore: result.overallScore,
          transcriptUsed: result.transcriptUsed,
          confidence,
          analysisStatus: 'COMPLETED',
          errorMessage: null,
          tokensInput: result.inputTokens,
          tokensOutput: result.outputTokens,
          estimatedCost: result.estimatedCost,
          generatedAt: new Date(),
        },
        update: {
          modelProvider: result.provider,
          modelName: result.model,
          promptVersion: result.promptVersion,
          structuredData: analysis as unknown as Prisma.InputJsonValue,
          executiveSummary: analysis.executiveSummary.summary,
          verdict: analysis.executiveSummary.verdict,
          overallScore: result.overallScore,
          transcriptUsed: result.transcriptUsed,
          confidence,
          analysisStatus: 'COMPLETED',
          errorMessage: null,
          tokensInput: result.inputTokens,
          tokensOutput: result.outputTokens,
          estimatedCost: result.estimatedCost,
          generatedAt: new Date(),
        },
      }),
      prisma.video.update({
        where: { id: video.id },
        data: { status: 'READY', analysisStatus: 'COMPLETED' },
      }),
    ])

    log.info('Analysis complete', {
      videoId: video.youtubeVideoId,
      score: result.overallScore,
      transcriptUsed: result.transcriptUsed,
      cost: result.estimatedCost,
    })

    // --- 4. Notify --------------------------------------------------------
    let emailed = false
    let emailMessage = 'Email notification disabled in Settings.'
    const prefs = await getPreferences()
    if (!options.skipEmail && prefs.notifyOnNewReport) {
      const outcome = await notifyNewReport({
        appName: prefs.appName,
        channelTitle: video.channel.title,
        video,
        analysis,
        overallScore: result.overallScore,
        transcriptStatus: transcript?.status ?? 'PENDING',
        lowConfidence: !hasTranscript,
      })
      emailed = outcome.ok
      emailMessage = outcome.message
    }

    return {
      videoId: video.id,
      youtubeVideoId: video.youtubeVideoId,
      transcriptStatus: transcript?.status ?? 'PENDING',
      analysisStatus: 'COMPLETED',
      overallScore: result.overallScore,
      emailed,
      emailMessage,
      regenerated: Boolean(options.force),
    }
  } catch (err) {
    const message = safeErrorMessage(err)
    await prisma.$transaction([
      prisma.analysisReport.upsert({
        where: { videoId: video.id },
        create: {
          videoId: video.id,
          modelProvider: 'unknown',
          modelName: 'unknown',
          promptVersion: 'unknown',
          structuredData: {} as Prisma.InputJsonValue,
          analysisStatus: 'FAILED',
          errorMessage: message,
        },
        update: { analysisStatus: 'FAILED', errorMessage: message },
      }),
      prisma.video.update({ where: { id: video.id }, data: { status: 'FAILED', analysisStatus: 'FAILED' } }),
    ])
    throw err
  }
}

/** Prior context from the same channel, so the model can spot patterns. */
async function buildChannelContext(channelDbId: string, excludeVideoId: string) {
  const channel = await prisma.channel.findUniqueOrThrow({ where: { id: channelDbId } })
  const priorVideos = await prisma.video.findMany({
    where: { channelId: channelDbId, id: { not: excludeVideoId } },
    orderBy: { publishedAt: 'desc' },
    take: 12,
    include: { report: { select: { overallScore: true, structuredData: true, analysisStatus: true } } },
  })

  const formatCounts = new Map<string, number>()
  const scores: number[] = []
  for (const v of priorVideos) {
    if (v.report?.analysisStatus !== 'COMPLETED') continue
    if (typeof v.report.overallScore === 'number') scores.push(v.report.overallScore)
    const data = v.report.structuredData as unknown as Analysis | null
    const format = data?.format?.primary
    if (format) formatCounts.set(format, (formatCounts.get(format) ?? 0) + 1)
  }

  return {
    title: channel.title,
    handle: channel.handle,
    description: channel.description,
    recentVideoTitles: priorVideos.map((v) => v.title),
    commonFormats: [...formatCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([format, count]) => `${FORMAT_LABELS[format as keyof typeof FORMAT_LABELS] ?? format} x${count}`),
    averageOverallScore: average(scores),
  }
}

async function notifyNewReport(input: {
  appName: string
  channelTitle: string
  video: { id: string; title: string; url: string; publishedAt: Date; thumbnailUrl: string | null }
  analysis: Analysis
  overallScore: number
  transcriptStatus: string
  lowConfidence: boolean
}) {
  const baseUrl = env.APP_BASE_URL.replace(/\/$/, '')
  const email = renderNewReportEmail({
    appName: input.appName,
    channelTitle: input.channelTitle,
    videoTitle: input.video.title,
    videoUrl: input.video.url,
    publishedAt: input.video.publishedAt,
    transcriptStatus: input.transcriptStatus,
    overallScore: input.overallScore,
    verdict: input.analysis.executiveSummary.verdict,
    executiveSummary: input.analysis.executiveSummary.summary,
    topTakeaways: input.analysis.executiveSummary.topTakeaways,
    reportUrl: `${baseUrl}/videos/${input.video.id}`,
    thumbnailUrl: input.video.thumbnailUrl,
    lowConfidence: input.lowConfidence,
  })
  return sendToAdmin(email)
}
