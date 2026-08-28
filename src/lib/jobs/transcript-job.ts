import { Prisma, type TranscriptStatus } from '@prisma/client'
import { prisma } from '../prisma'
import { createLogger } from '../logger'
import { fetchTranscript } from '../transcript'
import { MAX_AUTO_RETRIES, isDueForRetry, planNextRetry } from '../transcript/retry'
import { enqueueJob } from './helpers'

const log = createLogger('jobs:transcript')

export type TranscriptOutcome = {
  status: TranscriptStatus
  provider: string | null
  reason: string | null
  characters: number
  willRetryAt: Date | null
}

/**
 * Fetches (or re-fetches) the transcript for a video and persists the result,
 * including the retry schedule. Never throws -- a missing transcript must not
 * stop the pipeline.
 *
 * @param manual true when a human pressed "Retry transcript" (resets the counter)
 */
export async function retrieveTranscript(videoDbId: string, manual = false): Promise<TranscriptOutcome> {
  const video = await prisma.video.findUnique({ where: { id: videoDbId } })
  if (!video) throw new Error(`Video ${videoDbId} not found`)

  const existing = await prisma.transcript.findUnique({ where: { videoId: video.id } })
  const retryCount = manual ? 0 : (existing?.retryCount ?? 0)

  const result = await fetchTranscript({
    youtubeVideoId: video.youtubeVideoId,
    title: video.title,
    durationSeconds: video.durationSeconds,
  })

  if (result.status === 'AVAILABLE') {
    await prisma.$transaction([
      prisma.transcript.upsert({
        where: { videoId: video.id },
        create: {
          videoId: video.id,
          language: result.language,
          provider: result.provider,
          rawText: result.rawText,
          segments: result.segments as unknown as Prisma.InputJsonValue,
          status: 'AVAILABLE',
          errorMessage: null,
          retrievedAt: new Date(),
          retryCount,
          nextRetryAt: null,
        },
        update: {
          language: result.language,
          provider: result.provider,
          rawText: result.rawText,
          segments: result.segments as unknown as Prisma.InputJsonValue,
          status: 'AVAILABLE',
          errorMessage: null,
          retrievedAt: new Date(),
          nextRetryAt: null,
        },
      }),
      prisma.video.update({ where: { id: video.id }, data: { transcriptStatus: 'AVAILABLE' } }),
    ])
    log.info('Transcript retrieved', { videoId: video.youtubeVideoId, provider: result.provider, chars: result.rawText.length })
    return {
      status: 'AVAILABLE',
      provider: result.provider,
      reason: null,
      characters: result.rawText.length,
      willRetryAt: null,
    }
  }

  // Definitive "no captions": do not burn retries on it.
  if (result.status === 'UNAVAILABLE') {
    await prisma.$transaction([
      prisma.transcript.upsert({
        where: { videoId: video.id },
        create: {
          videoId: video.id,
          provider: result.provider,
          status: 'UNAVAILABLE',
          errorMessage: result.reason,
          retryCount,
          nextRetryAt: null,
        },
        update: { provider: result.provider, status: 'UNAVAILABLE', errorMessage: result.reason, nextRetryAt: null },
      }),
      prisma.video.update({ where: { id: video.id }, data: { transcriptStatus: 'UNAVAILABLE' } }),
    ])
    log.info('No transcript available', { videoId: video.youtubeVideoId, reason: result.reason })
    return { status: 'UNAVAILABLE', provider: result.provider, reason: result.reason, characters: 0, willRetryAt: null }
  }

  // Transient error -> schedule the next automatic attempt (15m / 1h / 6h).
  const decision = planNextRetry(retryCount)
  await prisma.$transaction([
    prisma.transcript.upsert({
      where: { videoId: video.id },
      create: {
        videoId: video.id,
        provider: result.provider,
        status: decision.status,
        errorMessage: result.reason,
        retryCount: decision.retryCount,
        nextRetryAt: decision.nextRetryAt,
      },
      update: {
        provider: result.provider,
        status: decision.status,
        errorMessage: result.reason,
        retryCount: decision.retryCount,
        nextRetryAt: decision.nextRetryAt,
      },
    }),
    prisma.video.update({ where: { id: video.id }, data: { transcriptStatus: decision.status } }),
  ])

  log.warn('Transcript attempt failed', {
    videoId: video.youtubeVideoId,
    reason: result.reason,
    retryCount: decision.retryCount,
    nextRetryAt: decision.nextRetryAt?.toISOString() ?? 'none (gave up)',
  })

  return {
    status: decision.status,
    provider: result.provider,
    reason: result.reason,
    characters: 0,
    willRetryAt: decision.nextRetryAt,
  }
}

/**
 * Finds transcripts whose retry window has elapsed and queues another attempt.
 * Called by the worker on every tick.
 */
export async function processDueTranscriptRetries(limit = 20): Promise<number> {
  const rows = await prisma.transcript.findMany({
    where: { status: 'RETRYING', nextRetryAt: { lte: new Date() }, retryCount: { lt: MAX_AUTO_RETRIES } },
    orderBy: { nextRetryAt: 'asc' },
    take: limit,
  })

  let queued = 0
  for (const row of rows) {
    if (!isDueForRetry(row)) continue
    const { created } = await enqueueJob({ jobType: 'RETRY_TRANSCRIPT', videoId: row.videoId })
    if (created) queued++
  }
  if (queued) log.info('Queued transcript retries', { queued })
  return queued
}
