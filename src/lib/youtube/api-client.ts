import { parseIsoDuration } from '../utils'
import { createLogger } from '../logger'
import { parseChannelInput, uploadsPlaylistIdFromChannelId } from './parse'
import { YouTubeError, type PlaylistVideoRef, type ResolvedChannel, type VideoDetails, type YouTubeClient } from './types'

const log = createLogger('youtube')
const BASE = 'https://www.googleapis.com/youtube/v3'

/** Real YouTube Data API v3 client. Only public, documented endpoints. */
export class YouTubeApiClient implements YouTubeClient {
  readonly name = 'youtube-data-api-v3'

  constructor(private apiKey: string) {}

  private async request<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`${BASE}/${path}`)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    url.searchParams.set('key', this.apiKey)

    const res = await fetch(url, { headers: { accept: 'application/json' }, cache: 'no-store' })

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string; errors?: { reason?: string }[] } } | null
      const reason = body?.error?.errors?.[0]?.reason ?? ''
      const message = body?.error?.message ?? res.statusText

      if (res.status === 403 && /quota/i.test(reason + message)) {
        throw new YouTubeError('YouTube API quota exceeded for today. Try again after the quota resets.', 403, true)
      }
      if (res.status === 403) throw new YouTubeError(`YouTube API rejected the request: ${message}`, 403, false)
      if (res.status === 400) throw new YouTubeError(`YouTube API bad request: ${message}`, 400, false)
      if (res.status === 404) throw new YouTubeError('Not found on YouTube.', 404, false)
      // 429 / 5xx are worth retrying
      throw new YouTubeError(`YouTube API error (${res.status}): ${message}`, res.status, res.status >= 500 || res.status === 429)
    }
    return (await res.json()) as T
  }

  async resolveChannel(input: string): Promise<ResolvedChannel> {
    const parsed = parseChannelInput(input)
    if (parsed.kind === 'unknown') {
      throw new YouTubeError(
        'Could not understand that input. Paste a channel URL, an @handle, or a channel ID starting with "UC".',
      )
    }

    let channelId: string | null = null

    if (parsed.kind === 'channelId') {
      channelId = parsed.value
    } else if (parsed.kind === 'videoId') {
      // A video URL: look up which channel owns it.
      const data = await this.request<YtListResponse<YtVideo>>('videos', { part: 'snippet', id: parsed.value })
      channelId = data.items?.[0]?.snippet?.channelId ?? null
      if (!channelId) throw new YouTubeError('That video was not found, so its channel could not be resolved.')
    } else if (parsed.kind === 'handle') {
      const data = await this.request<YtListResponse<YtChannel>>('channels', {
        part: 'snippet,contentDetails',
        forHandle: parsed.value,
      })
      const item = data.items?.[0]
      if (item) return toResolvedChannel(item)
    } else if (parsed.kind === 'legacyUsername') {
      const data = await this.request<YtListResponse<YtChannel>>('channels', {
        part: 'snippet,contentDetails',
        forUsername: parsed.value,
      })
      const item = data.items?.[0]
      if (item) return toResolvedChannel(item)
    }

    if (!channelId) {
      // Last resort for /c/CustomName and bare names: search.
      const term = parsed.value.replace(/^@/, '')
      const search = await this.request<YtListResponse<YtSearchResult>>('search', {
        part: 'snippet',
        q: term,
        type: 'channel',
        maxResults: '1',
      })
      channelId = search.items?.[0]?.snippet?.channelId ?? search.items?.[0]?.id?.channelId ?? null
      if (!channelId) {
        throw new YouTubeError(`No YouTube channel found for "${parsed.original}".`)
      }
    }

    const data = await this.request<YtListResponse<YtChannel>>('channels', {
      part: 'snippet,contentDetails',
      id: channelId,
    })
    const item = data.items?.[0]
    if (!item) throw new YouTubeError(`Channel ${channelId} was not found on YouTube.`)
    return toResolvedChannel(item)
  }

  async listRecentUploads(uploadsPlaylistId: string, maxResults: number): Promise<PlaylistVideoRef[]> {
    const data = await this.request<YtListResponse<YtPlaylistItem>>('playlistItems', {
      part: 'snippet,contentDetails',
      playlistId: uploadsPlaylistId,
      maxResults: String(Math.min(Math.max(maxResults, 1), 50)),
    })
    return (data.items ?? [])
      .map((item) => ({
        youtubeVideoId: item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId ?? '',
        // contentDetails.videoPublishedAt is the real publish time; snippet is the "added to playlist" time.
        publishedAt: item.contentDetails?.videoPublishedAt ?? item.snippet?.publishedAt ?? new Date().toISOString(),
        title: item.snippet?.title ?? 'Untitled',
      }))
      .filter((v) => Boolean(v.youtubeVideoId))
  }

  async getVideoDetails(videoIds: string[]): Promise<VideoDetails[]> {
    if (!videoIds.length) return []
    const out: VideoDetails[] = []
    // The API accepts up to 50 ids per call.
    for (let i = 0; i < videoIds.length; i += 50) {
      const batch = videoIds.slice(i, i + 50)
      const data = await this.request<YtListResponse<YtVideo>>('videos', {
        part: 'snippet,contentDetails,statistics,status',
        id: batch.join(','),
      })
      for (const item of data.items ?? []) out.push(toVideoDetails(item))
      const returned = new Set((data.items ?? []).map((i2) => i2.id))
      for (const missing of batch.filter((id) => !returned.has(id))) {
        log.warn('Video missing from YouTube response (deleted or private)', { videoId: missing })
      }
    }
    return out
  }

  async testConnection() {
    try {
      // Cheap, always-available call: YouTube's own channel.
      await this.request<YtListResponse<YtChannel>>('channels', {
        part: 'snippet',
        id: 'UCBR8-60-B28hp2BmDPdntcQ',
      })
      return { ok: true, message: 'YouTube Data API key is valid.' }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'Unknown error' }
    }
  }
}

// --- response shapes (only the fields we use) --------------------------------

type YtListResponse<T> = { items?: T[] }
type YtThumbnails = Record<string, { url?: string } | undefined>
type YtChannel = {
  id: string
  snippet?: { title?: string; description?: string; customUrl?: string; thumbnails?: YtThumbnails }
  contentDetails?: { relatedPlaylists?: { uploads?: string } }
}
type YtVideo = {
  id: string
  snippet?: {
    channelId?: string
    title?: string
    description?: string
    publishedAt?: string
    thumbnails?: YtThumbnails
    tags?: string[]
    categoryId?: string
  }
  contentDetails?: { duration?: string }
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string }
  status?: { privacyStatus?: string; uploadStatus?: string }
}
type YtPlaylistItem = {
  snippet?: { title?: string; publishedAt?: string; resourceId?: { videoId?: string } }
  contentDetails?: { videoId?: string; videoPublishedAt?: string }
}
type YtSearchResult = { id?: { channelId?: string }; snippet?: { channelId?: string } }

export function bestThumbnail(thumbs?: YtThumbnails): string | null {
  if (!thumbs) return null
  for (const size of ['maxres', 'standard', 'high', 'medium', 'default']) {
    const url = thumbs[size]?.url
    if (url) return url
  }
  return null
}

function toResolvedChannel(item: YtChannel): ResolvedChannel {
  const customUrl = item.snippet?.customUrl ?? null
  return {
    youtubeChannelId: item.id,
    title: item.snippet?.title ?? 'Untitled channel',
    handle: customUrl ? (customUrl.startsWith('@') ? customUrl : `@${customUrl}`) : null,
    description: item.snippet?.description ?? null,
    thumbnailUrl: bestThumbnail(item.snippet?.thumbnails),
    uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads ?? uploadsPlaylistIdFromChannelId(item.id),
  }
}

function toNumber(value?: string): number | null {
  if (value === undefined) return null
  const n = Number(value)
  return Number.isNaN(n) ? null : n
}

function toVideoDetails(item: YtVideo): VideoDetails {
  const privacyStatus = item.status?.privacyStatus ?? null
  const uploadStatus = item.status?.uploadStatus ?? null
  return {
    youtubeVideoId: item.id,
    channelId: item.snippet?.channelId ?? '',
    title: item.snippet?.title ?? 'Untitled',
    description: item.snippet?.description ?? null,
    publishedAt: item.snippet?.publishedAt ?? new Date().toISOString(),
    durationSeconds: parseIsoDuration(item.contentDetails?.duration),
    thumbnailUrl: bestThumbnail(item.snippet?.thumbnails),
    viewCount: toNumber(item.statistics?.viewCount),
    likeCount: toNumber(item.statistics?.likeCount),
    commentCount: toNumber(item.statistics?.commentCount),
    tags: item.snippet?.tags ?? [],
    categoryId: item.snippet?.categoryId ?? null,
    privacyStatus,
    isPublic: privacyStatus === 'public' && uploadStatus !== 'rejected' && uploadStatus !== 'deleted',
  }
}
