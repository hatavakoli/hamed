import crypto from 'node:crypto'
import { parseChannelInput, uploadsPlaylistIdFromChannelId } from './parse'
import { YouTubeError, type PlaylistVideoRef, type ResolvedChannel, type VideoDetails, type YouTubeClient } from './types'

/**
 * Deterministic fake YouTube. Used when MOCK_MODE=true or no YOUTUBE_API_KEY
 * is set, so the whole app (detection -> transcript -> AI -> email) can be
 * exercised locally without a single API key or a single real request.
 *
 * Same input always produces the same channel/videos, so re-running "Check now"
 * does not create duplicates -- which is exactly what we want to demo.
 */

function hash(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex')
}

/** Build a valid-looking channel ID ("UC" + 22 url-safe chars) from any string. */
function fakeChannelId(seed: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  const h = hash(seed)
  let out = 'UC'
  for (let i = 0; i < 22; i++) out += chars[parseInt(h.slice(i * 2, i * 2 + 2), 16) % chars.length]
  return out
}

function fakeVideoId(seed: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  const h = hash(seed)
  let out = ''
  for (let i = 0; i < 11; i++) out += chars[parseInt(h.slice(i * 2, i * 2 + 2), 16) % chars.length]
  return out
}

const TOPICS = [
  'I Built a SaaS in 7 Days With AI — Here Is What Broke',
  'The $0 Marketing Playbook That Got Us 12,000 Users',
  'Why Most Micro-SaaS Products Die in Month 3',
  'Stop Building Features. Build This Instead.',
  'I Analysed 500 Landing Pages. These 6 Patterns Convert.',
  'The Boring Business Model Nobody Talks About',
  'From Idea to First Paying Customer in 14 Days',
  'This One Pricing Change Doubled Our Revenue',
]

const MOCK_DESCRIPTION = `In this video I walk through the exact process, the tools I used, the mistakes I made, and the numbers behind the result.

Timestamps:
00:00 Intro
01:30 The problem
04:10 The build
09:45 Launch day
14:20 Results and what I would change`

export class MockYouTubeClient implements YouTubeClient {
  readonly name = 'mock-youtube'

  async resolveChannel(input: string): Promise<ResolvedChannel> {
    const parsed = parseChannelInput(input)
    if (parsed.kind === 'unknown' || !parsed.value) {
      throw new YouTubeError('Could not understand that input. Paste a channel URL, an @handle, or a channel ID starting with "UC".')
    }
    const seed = parsed.value.toLowerCase()
    const channelId = parsed.kind === 'channelId' ? parsed.value : fakeChannelId(seed)
    const label = parsed.value.replace(/^@/, '').replace(/[-_]/g, ' ')
    const title = label.replace(/\b\w/g, (c) => c.toUpperCase()) || 'Demo Channel'
    return {
      youtubeChannelId: channelId,
      title: `${title} (mock)`,
      handle: parsed.kind === 'handle' ? parsed.value : `@${label.replace(/\s+/g, '').toLowerCase()}`,
      description: `Mock channel generated for local development from input "${parsed.original}". No real YouTube request was made.`,
      thumbnailUrl: `https://placehold.co/240x240/1e293b/e2e8f0/png?text=${encodeURIComponent(title.slice(0, 12))}`,
      uploadsPlaylistId: uploadsPlaylistIdFromChannelId(channelId) ?? `UU${channelId.slice(2)}`,
    }
  }

  async listRecentUploads(uploadsPlaylistId: string, maxResults: number): Promise<PlaylistVideoRef[]> {
    const count = Math.min(Math.max(maxResults, 1), TOPICS.length)
    const refs: PlaylistVideoRef[] = []
    for (let i = 0; i < count; i++) {
      const videoId = fakeVideoId(`${uploadsPlaylistId}:${i}`)
      // Newest first, one video every ~3 days going back in time.
      const publishedAt = new Date(Date.now() - i * 3 * 24 * 3600 * 1000 - 3600 * 1000).toISOString()
      refs.push({ youtubeVideoId: videoId, publishedAt, title: TOPICS[i % TOPICS.length] })
    }
    return refs
  }

  async getVideoDetails(videoIds: string[]): Promise<VideoDetails[]> {
    return videoIds.map((id) => {
      const h = hash(id)
      const pick = (offset: number, mod: number) => parseInt(h.slice(offset, offset + 4), 16) % mod
      const index = pick(0, TOPICS.length)
      const ageDays = pick(4, 30)
      return {
        youtubeVideoId: id,
        channelId: '',
        title: TOPICS[index],
        description: MOCK_DESCRIPTION,
        publishedAt: new Date(Date.now() - ageDays * 24 * 3600 * 1000).toISOString(),
        durationSeconds: 480 + pick(8, 900),
        thumbnailUrl: `https://placehold.co/640x360/0f172a/e2e8f0/png?text=${encodeURIComponent(TOPICS[index].slice(0, 24))}`,
        viewCount: 1200 + pick(12, 400000),
        likeCount: 40 + pick(16, 12000),
        commentCount: 5 + pick(20, 900),
        tags: ['saas', 'startup', 'indie hacking', 'ai tools'],
        categoryId: '28',
        privacyStatus: 'public',
        isPublic: true,
      }
    })
  }

  async testConnection() {
    return { ok: true, message: 'Mock YouTube client active — no API key required.' }
  }
}
