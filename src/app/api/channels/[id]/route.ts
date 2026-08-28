import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { HttpError, handleError, ok, parseBody } from '@/lib/api'
import { requireAdmin } from '@/lib/auth'
import { computeChannelInsights } from '@/lib/insights'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

const UpdateChannelSchema = z.object({
  isActive: z.boolean().optional(),
  title: z.string().min(1).max(200).optional(),
})

/** GET /api/channels/[id] — channel, its videos, and computed insights. */
export async function GET(_req: Request, { params }: Params) {
  try {
    await requireAdmin()
    const { id } = await params

    const channel = await prisma.channel.findUnique({
      where: { id },
      include: {
        videos: {
          orderBy: { publishedAt: 'desc' },
          include: { report: { select: { overallScore: true, verdict: true, analysisStatus: true, generatedAt: true, structuredData: true } } },
        },
      },
    })
    if (!channel) throw new HttpError(404, 'Channel not found')

    const insights = computeChannelInsights(
      channel.videos
        .filter((v) => v.report?.analysisStatus === 'COMPLETED')
        .map((v) => ({
          overallScore: v.report!.overallScore,
          generatedAt: v.report!.generatedAt,
          structuredData: v.report!.structuredData,
          videoTitle: v.title,
          publishedAt: v.publishedAt,
        })),
    )

    return ok({
      channel: {
        id: channel.id,
        youtubeChannelId: channel.youtubeChannelId,
        title: channel.title,
        handle: channel.handle,
        description: channel.description,
        thumbnailUrl: channel.thumbnailUrl,
        url: `https://www.youtube.com/channel/${channel.youtubeChannelId}`,
        uploadsPlaylistId: channel.uploadsPlaylistId,
        isActive: channel.isActive,
        lastCheckedAt: channel.lastCheckedAt,
        lastSuccessfulCheckAt: channel.lastSuccessfulCheckAt,
        lastProcessedVideoPublishedAt: channel.lastProcessedVideoPublishedAt,
        lastError: channel.lastError,
        createdAt: channel.createdAt,
      },
      videos: channel.videos.map((v) => ({
        id: v.id,
        youtubeVideoId: v.youtubeVideoId,
        title: v.title,
        url: v.url,
        publishedAt: v.publishedAt,
        thumbnailUrl: v.thumbnailUrl,
        durationSeconds: v.durationSeconds,
        viewCount: v.viewCount,
        status: v.status,
        transcriptStatus: v.transcriptStatus,
        analysisStatus: v.analysisStatus,
        overallScore: v.report?.overallScore ?? null,
        verdict: v.report?.verdict ?? null,
      })),
      insights,
    })
  } catch (err) {
    return handleError(err)
  }
}

/** PATCH /api/channels/[id] — pause/resume or rename. */
export async function PATCH(req: Request, { params }: Params) {
  try {
    await requireAdmin()
    const { id } = await params
    const body = await parseBody(req, UpdateChannelSchema)

    const existing = await prisma.channel.findUnique({ where: { id } })
    if (!existing) throw new HttpError(404, 'Channel not found')

    const channel = await prisma.channel.update({ where: { id }, data: body })
    return ok(channel)
  } catch (err) {
    return handleError(err)
  }
}

/** DELETE /api/channels/[id] — removes the channel and, by cascade, its videos/reports. */
export async function DELETE(_req: Request, { params }: Params) {
  try {
    await requireAdmin()
    const { id } = await params
    const existing = await prisma.channel.findUnique({ where: { id }, include: { _count: { select: { videos: true } } } })
    if (!existing) throw new HttpError(404, 'Channel not found')

    await prisma.channel.delete({ where: { id } })
    return ok({ deleted: true, deletedVideos: existing._count.videos })
  } catch (err) {
    return handleError(err)
  }
}
