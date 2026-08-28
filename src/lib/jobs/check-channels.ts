import { Prisma } from '@prisma/client'
import { prisma } from '../prisma'
import { createLogger, safeErrorMessage } from '../logger'
import { getPreferences } from '../settings'
import { youtubeWatchUrl } from '../utils'
import { getYouTubeClient } from '../youtube'
import { enqueueJob } from './helpers'

const log = createLogger('jobs:check')

export type CheckChannelResult = {
  channelId: string
  channelTitle: string
  checked: boolean
  newVideos: number
  skipped: number
  error?: string
}

/**
 * Looks at a channel's uploads playlist, stores any video we have not seen
 * before, and queues it for analysis.
 *
 * Idempotent by construction: `videos.youtubeVideoId` is UNIQUE and we use
 * `createMany({ skipDuplicates: true })`, so running this twice in parallel
 * cannot produce a duplicate video or a duplicate report.
 */
export async function checkChannel(
  channelDbId: string,
  options: { maxVideos?: number; includeOlder?: boolean } = {},
): Promise<CheckChannelResult> {
  const channel = await prisma.channel.findUnique({ where: { id: channelDbId } })
  if (!channel) throw new Error(`Channel ${channelDbId} not found`)

  const prefs = await getPreferences()
  const maxVideos = options.maxVideos ?? prefs.maxVideosPerCheck
  const base: CheckChannelResult = {
    channelId: channel.id,
    channelTitle: channel.title,
    checked: false,
    newVideos: 0,
    skipped: 0,
  }

  try {
    const youtube = await getYouTubeClient()
    const playlistId = channel.uploadsPlaylistId || `UU${channel.youtubeChannelId.slice(2)}`

    const refs = await youtube.listRecentUploads(playlistId, Math.min(maxVideos * 2, 50))
    if (!refs.length) {
      await prisma.channel.update({
        where: { id: channel.id },
        data: { lastCheckedAt: new Date(), lastSuccessfulCheckAt: new Date(), lastError: null },
      })
      return { ...base, checked: true }
    }

    // Which of these do we already have?
    const existing = await prisma.video.findMany({
      where: { youtubeVideoId: { in: refs.map((r) => r.youtubeVideoId) } },
      select: { youtubeVideoId: true },
    })
    const known = new Set(existing.map((v) => v.youtubeVideoId))
    let candidates = refs.filter((r) => !known.has(r.youtubeVideoId))

    // Normal monitoring only looks forward in time. Backfill ignores the cutoff.
    if (!options.includeOlder && channel.lastProcessedVideoPublishedAt) {
      const cutoff = channel.lastProcessedVideoPublishedAt.getTime()
      candidates = candidates.filter((r) => new Date(r.publishedAt).getTime() > cutoff)
    }

    candidates = candidates
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      .slice(0, maxVideos)

    if (!candidates.length) {
      await prisma.channel.update({
        where: { id: channel.id },
        data: { lastCheckedAt: new Date(), lastSuccessfulCheckAt: new Date(), lastError: null },
      })
      return { ...base, checked: true, skipped: refs.length - candidates.length }
    }

    const details = await youtube.getVideoDetails(candidates.map((c) => c.youtubeVideoId))
    const detailsById = new Map(details.map((d) => [d.youtubeVideoId, d]))

    let created = 0
    let skipped = 0
    let newestPublishedAt = channel.lastProcessedVideoPublishedAt ?? null

    for (const ref of candidates) {
      const detail = detailsById.get(ref.youtubeVideoId)
      // Missing from videos.list => deleted or private. Skip silently.
      if (!detail || !detail.isPublic) {
        skipped++
        log.info('Skipping non-public or unavailable video', { videoId: ref.youtubeVideoId })
        continue
      }

      const publishedAt = new Date(detail.publishedAt)
      const result = await prisma.video.createMany({
        data: [
          {
            youtubeVideoId: detail.youtubeVideoId,
            channelId: channel.id,
            title: detail.title,
            description: detail.description,
            url: youtubeWatchUrl(detail.youtubeVideoId),
            publishedAt,
            durationSeconds: detail.durationSeconds,
            thumbnailUrl: detail.thumbnailUrl,
            viewCount: detail.viewCount != null ? BigInt(detail.viewCount) : null,
            likeCount: detail.likeCount != null ? BigInt(detail.likeCount) : null,
            commentCount: detail.commentCount != null ? BigInt(detail.commentCount) : null,
            tags: detail.tags as Prisma.InputJsonValue,
            categoryId: detail.categoryId,
            privacyStatus: detail.privacyStatus,
            status: 'NEW',
            metadataFetchedAt: new Date(),
          },
        ],
        skipDuplicates: true, // <- the duplicate guard
      })

      if (result.count === 0) {
        skipped++
        continue
      }
      created++
      if (!newestPublishedAt || publishedAt > newestPublishedAt) newestPublishedAt = publishedAt

      const video = await prisma.video.findUnique({ where: { youtubeVideoId: detail.youtubeVideoId } })
      if (video) await enqueueJob({ jobType: 'PROCESS_VIDEO', videoId: video.id, channelId: channel.id })
    }

    await prisma.channel.update({
      where: { id: channel.id },
      data: {
        lastCheckedAt: new Date(),
        lastSuccessfulCheckAt: new Date(),
        lastProcessedVideoPublishedAt: newestPublishedAt,
        lastError: null,
      },
    })

    log.info('Channel checked', { channel: channel.title, newVideos: created, skipped })
    return { ...base, checked: true, newVideos: created, skipped }
  } catch (err) {
    const message = safeErrorMessage(err)
    await prisma.channel.update({
      where: { id: channel.id },
      data: { lastCheckedAt: new Date(), lastError: message },
    })
    log.error('Channel check failed', { channel: channel.title, message })
    return { ...base, error: message }
  }
}

export type CheckAllResult = {
  channelsChecked: number
  totalNewVideos: number
  results: CheckChannelResult[]
}

export async function checkAllChannels(options: { maxVideos?: number } = {}): Promise<CheckAllResult> {
  const channels = await prisma.channel.findMany({ where: { isActive: true }, orderBy: { createdAt: 'asc' } })
  const results: CheckChannelResult[] = []
  for (const channel of channels) {
    results.push(await checkChannel(channel.id, options))
  }
  return {
    channelsChecked: channels.length,
    totalNewVideos: results.reduce((sum, r) => sum + r.newVideos, 0),
    results,
  }
}

/**
 * Backfill: pull older videos that were published before we started monitoring
 * and queue them for analysis. Powers the "Analyse past videos" button.
 */
export async function backfillChannel(channelDbId: string, count: number): Promise<CheckChannelResult> {
  return checkChannel(channelDbId, { maxVideos: Math.min(Math.max(count, 1), 25), includeOlder: true })
}
