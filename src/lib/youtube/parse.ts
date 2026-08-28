/**
 * Pure parsing helpers -- no network, fully unit-tested.
 * Turns whatever the user pasted into something we can look up.
 */

export type ChannelInputKind = 'channelId' | 'handle' | 'legacyUsername' | 'customName' | 'videoId' | 'unknown'

export type ParsedChannelInput = {
  kind: ChannelInputKind
  value: string
  original: string
}

const CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{22}$/
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/
const HANDLE_RE = /^@[A-Za-z0-9._-]{3,30}$/

export function parseChannelInput(raw: string): ParsedChannelInput {
  const original = (raw ?? '').trim()
  if (!original) return { kind: 'unknown', value: '', original }

  // Bare channel ID
  if (CHANNEL_ID_RE.test(original)) return { kind: 'channelId', value: original, original }
  // Bare handle
  if (HANDLE_RE.test(original)) return { kind: 'handle', value: original, original }

  const asUrl = toUrl(original)
  if (asUrl) {
    const host = asUrl.hostname.replace(/^www\./, '').toLowerCase()
    const segments = asUrl.pathname.split('/').filter(Boolean).map(decodeURIComponent)

    if (host === 'youtu.be' && segments[0] && VIDEO_ID_RE.test(segments[0])) {
      return { kind: 'videoId', value: segments[0], original }
    }
    if (!host.endsWith('youtube.com')) return { kind: 'unknown', value: original, original }

    const watchId = asUrl.searchParams.get('v')
    if (watchId && VIDEO_ID_RE.test(watchId)) return { kind: 'videoId', value: watchId, original }

    const [first, second] = segments
    if (first === 'channel' && second && CHANNEL_ID_RE.test(second)) {
      return { kind: 'channelId', value: second, original }
    }
    if (first === 'user' && second) return { kind: 'legacyUsername', value: second, original }
    if (first === 'c' && second) return { kind: 'customName', value: second, original }
    if (first === 'shorts' && second && VIDEO_ID_RE.test(second)) {
      return { kind: 'videoId', value: second, original }
    }
    if (first?.startsWith('@')) return { kind: 'handle', value: first, original }
  }

  // Handle typed without the "@"
  if (/^[A-Za-z0-9._-]{3,30}$/.test(original)) return { kind: 'customName', value: original, original }

  return { kind: 'unknown', value: original, original }
}

function toUrl(value: string): URL | null {
  try {
    return new URL(value.includes('://') ? value : `https://${value}`)
  } catch {
    return null
  }
}

/** channel ID "UCabc..." -> uploads playlist "UUabc..." (YouTube's documented convention). */
export function uploadsPlaylistIdFromChannelId(channelId: string): string | null {
  if (!CHANNEL_ID_RE.test(channelId)) return null
  return `UU${channelId.slice(2)}`
}

export function isChannelId(value: string) {
  return CHANNEL_ID_RE.test(value)
}

export function isVideoId(value: string) {
  return VIDEO_ID_RE.test(value)
}
