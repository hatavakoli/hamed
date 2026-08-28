import { prisma } from '@/lib/prisma'
import { handleError, ok, parseQuery } from '@/lib/api'
import { requireAdmin } from '@/lib/auth'
import { VideoQuerySchema, buildVideoQuery } from '@/lib/video-query'

export const dynamic = 'force-dynamic'

/** GET /api/videos — search, filter, sort and paginate every detected video. */
export async function GET(req: Request) {
  try {
    await requireAdmin()
    const query = parseQuery(req.url, VideoQuerySchema)
    const { where, orderBy } = buildVideoQuery(query)

    const [total, videos] = await prisma.$transaction([
      prisma.video.count({ where }),
      prisma.video.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          channel: { select: { id: true, title: true, thumbnailUrl: true } },
          report: {
            select: { overallScore: true, verdict: true, analysisStatus: true, generatedAt: true, confidence: true },
          },
        },
      }),
    ])

    return ok({
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      videos: videos.map((v) => ({
        id: v.id,
        youtubeVideoId: v.youtubeVideoId,
        title: v.title,
        url: v.url,
        thumbnailUrl: v.thumbnailUrl,
        publishedAt: v.publishedAt,
        durationSeconds: v.durationSeconds,
        viewCount: v.viewCount,
        status: v.status,
        transcriptStatus: v.transcriptStatus,
        analysisStatus: v.analysisStatus,
        channel: v.channel,
        overallScore: v.report?.overallScore ?? null,
        verdict: v.report?.verdict ?? null,
        confidence: v.report?.confidence ?? null,
      })),
    })
  } catch (err) {
    return handleError(err)
  }
}
