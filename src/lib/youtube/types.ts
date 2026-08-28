export type ResolvedChannel = {
  youtubeChannelId: string
  title: string
  handle: string | null
  description: string | null
  thumbnailUrl: string | null
  uploadsPlaylistId: string | null
}

export type PlaylistVideoRef = {
  youtubeVideoId: string
  publishedAt: string
  title: string
}

export type VideoDetails = {
  youtubeVideoId: string
  channelId: string
  title: string
  description: string | null
  publishedAt: string
  durationSeconds: number | null
  thumbnailUrl: string | null
  viewCount: number | null
  likeCount: number | null
  commentCount: number | null
  tags: string[]
  categoryId: string | null
  privacyStatus: string | null
  /** false for private/deleted/unlisted-and-gone videos -- we skip those. */
  isPublic: boolean
}

export interface YouTubeClient {
  readonly name: string
  resolveChannel(input: string): Promise<ResolvedChannel>
  listRecentUploads(uploadsPlaylistId: string, maxResults: number): Promise<PlaylistVideoRef[]>
  getVideoDetails(videoIds: string[]): Promise<VideoDetails[]>
  testConnection(): Promise<{ ok: boolean; message: string }>
}

export class YouTubeError extends Error {
  constructor(
    message: string,
    public status?: number,
    public retryable = false,
  ) {
    super(message)
    this.name = 'YouTubeError'
  }
}
