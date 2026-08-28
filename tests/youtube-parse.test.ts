import { describe, expect, it } from 'vitest'
import { parseChannelInput, uploadsPlaylistIdFromChannelId, isChannelId, isVideoId } from '@/lib/youtube/parse'

/**
 * Channel resolution / parsing.
 * These are pure functions, so no API key or network is needed.
 */
describe('parseChannelInput', () => {
  it('recognises a bare channel ID', () => {
    const result = parseChannelInput('UCBR8-60-B28hp2BmDPdntcQ')
    expect(result.kind).toBe('channelId')
    expect(result.value).toBe('UCBR8-60-B28hp2BmDPdntcQ')
  })

  it('recognises a bare @handle', () => {
    expect(parseChannelInput('@mkbhd')).toMatchObject({ kind: 'handle', value: '@mkbhd' })
  })

  it('extracts the channel ID from a /channel/ URL', () => {
    const result = parseChannelInput('https://www.youtube.com/channel/UCBR8-60-B28hp2BmDPdntcQ')
    expect(result).toMatchObject({ kind: 'channelId', value: 'UCBR8-60-B28hp2BmDPdntcQ' })
  })

  it('extracts the handle from a handle URL, with or without a trailing path', () => {
    expect(parseChannelInput('https://youtube.com/@veritasium')).toMatchObject({ kind: 'handle', value: '@veritasium' })
    expect(parseChannelInput('https://www.youtube.com/@veritasium/videos')).toMatchObject({
      kind: 'handle',
      value: '@veritasium',
    })
  })

  it('handles legacy /user/ and /c/ URLs', () => {
    expect(parseChannelInput('https://www.youtube.com/user/PewDiePie')).toMatchObject({
      kind: 'legacyUsername',
      value: 'PewDiePie',
    })
    expect(parseChannelInput('https://www.youtube.com/c/MyCustomName')).toMatchObject({
      kind: 'customName',
      value: 'MyCustomName',
    })
  })

  it('extracts a video ID from watch, youtu.be and shorts URLs', () => {
    expect(parseChannelInput('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toMatchObject({
      kind: 'videoId',
      value: 'dQw4w9WgXcQ',
    })
    expect(parseChannelInput('https://youtu.be/dQw4w9WgXcQ')).toMatchObject({ kind: 'videoId', value: 'dQw4w9WgXcQ' })
    expect(parseChannelInput('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toMatchObject({
      kind: 'videoId',
      value: 'dQw4w9WgXcQ',
    })
  })

  it('works without a protocol and ignores extra query parameters', () => {
    expect(parseChannelInput('youtube.com/watch?v=dQw4w9WgXcQ&t=42s')).toMatchObject({
      kind: 'videoId',
      value: 'dQw4w9WgXcQ',
    })
  })

  it('trims surrounding whitespace', () => {
    expect(parseChannelInput('   @mkbhd  ').value).toBe('@mkbhd')
  })

  it('rejects empty input and non-YouTube URLs', () => {
    expect(parseChannelInput('').kind).toBe('unknown')
    expect(parseChannelInput('   ').kind).toBe('unknown')
    expect(parseChannelInput('https://vimeo.com/12345').kind).toBe('unknown')
  })
})

describe('uploadsPlaylistIdFromChannelId', () => {
  it('swaps the UC prefix for UU', () => {
    expect(uploadsPlaylistIdFromChannelId('UCBR8-60-B28hp2BmDPdntcQ')).toBe('UUBR8-60-B28hp2BmDPdntcQ')
  })

  it('returns null for anything that is not a channel ID', () => {
    expect(uploadsPlaylistIdFromChannelId('not-a-channel')).toBeNull()
  })
})

describe('id guards', () => {
  it('validates channel and video ID shapes', () => {
    expect(isChannelId('UCBR8-60-B28hp2BmDPdntcQ')).toBe(true)
    expect(isChannelId('UCtooshort')).toBe(false)
    expect(isVideoId('dQw4w9WgXcQ')).toBe(true)
    expect(isVideoId('too-short')).toBe(false)
  })
})
