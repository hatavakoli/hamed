import { env } from '../env'
import { getSecret } from '../settings'
import { YouTubeApiClient } from './api-client'
import { MockYouTubeClient } from './mock-client'
import type { YouTubeClient } from './types'

export * from './types'
export * from './parse'

/**
 * Picks the real client when a YouTube API key exists, otherwise the mock.
 * Every caller goes through here, so nothing else needs to know about keys.
 */
export async function getYouTubeClient(): Promise<YouTubeClient> {
  if (env.MOCK_MODE) return new MockYouTubeClient()
  const key = await getSecret('YOUTUBE_API_KEY')
  return key ? new YouTubeApiClient(key) : new MockYouTubeClient()
}

export async function isYouTubeMocked(): Promise<boolean> {
  const client = await getYouTubeClient()
  return client.name === 'mock-youtube'
}
