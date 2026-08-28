import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { HttpError, handleError, ok, parseBody } from '@/lib/api'
import { requireAdmin } from '@/lib/auth'
import { getYouTubeClient } from '@/lib/youtube'
import { enqueueJob } from '@/lib/jobs/helpers'

export const dynamic = 'force-dynamic'

const CreateChannelSchema = z.object({
  input: z.string().min(2, 'Enter a channel URL, @handle, or channel ID'),
  isActive: z.boolean().default(true),
  /** Immediately look for videos after adding. */
  checkNow: z.boolean().default(true),
})

/** GET /api/channels — all monitored channels with counts. */
export async function GET() {
  try {
    await requireAdmin()
    const channels = await prisma.channel.findMany({
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
      include: {
        _count: { select: { videos: true } },
        videos: {
          orderBy: { publishedAt: 'desc' },
          take: 1,
          select: { id: true, title: true, publishedAt: true, thumbnailUrl: true },
        },
      },
    })

    const reportCounts = await prisma.video.groupBy({
      by: ['channelId'],
      where: { report: { analysisStatus: 'COMPLETED' } },
      _count: { _all: true },
    })
    const reportsByChannel = new Map(reportCounts.map((r) => [r.channelId, r._count._all]))

    return ok(
      channels.map((c) => ({
        id: c.id,
        youtubeChannelId: c.youtubeChannelId,
        title: c.title,
        handle: c.handle,
        description: c.description,
        thumbnailUrl: c.thumbnailUrl,
        url: `https://www.youtube.com/channel/${c.youtubeChannelId}`,
        isActive: c.isActive,
        lastCheckedAt: c.lastCheckedAt,
        lastSuccessfulCheckAt: c.lastSuccessfulCheckAt,
        lastError: c.lastError,
        createdAt: c.createdAt,
        videoCount: c._count.videos,
        reportCount: reportsByChannel.get(c.id) ?? 0,
        latestVideo: c.videos[0] ?? null,
      })),
    )
  } catch (err) {
    return handleError(err)
  }
}

/** POST /api/channels — resolve the input to a real channel and start monitoring it. */
export async function POST(req: Request) {
  try {
    await requireAdmin()
    const body = await parseBody(req, CreateChannelSchema)

    const youtube = await getYouTubeClient()
    const resolved = await youtube.resolveChannel(body.input)

    const existing = await prisma.channel.findUnique({ where: { youtubeChannelId: resolved.youtubeChannelId } })
    if (existing) throw new HttpError(409, `"${existing.title}" is already being monitored.`)

    const channel = await prisma.channel.create({
      data: {
        youtubeChannelId: resolved.youtubeChannelId,
        title: resolved.title,
        handle: resolved.handle,
        description: resolved.description,
        thumbnailUrl: resolved.thumbnailUrl,
        uploadsPlaylistId: resolved.uploadsPlaylistId,
        isActive: body.isActive,
      },
    })

    if (body.checkNow && body.isActive) {
      await enqueueJob({ jobType: 'CHECK_CHANNEL', channelId: channel.id })
    }

    return ok({ ...channel, queuedCheck: body.checkNow && body.isActive }, 201)
  } catch (err) {
    // Race: two requests adding the same channel at once.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return handleError(new HttpError(409, 'That channel is already being monitored.'))
    }
    return handleError(err)
  }
}
