import { z } from 'zod'
import { Prisma } from '@prisma/client'

/**
 * Shared search/filter/sort logic for videos.
 *
 * Lives in lib/ (not in the route file) because Next.js only allows HTTP
 * handlers and config to be exported from a route module. Both
 * `GET /api/videos` and the server-rendered /videos page use this, so the API
 * and the UI can never drift apart.
 */

export const VideoQuerySchema = z.object({
  q: z.string().optional(),
  channelId: z.string().optional(),
  analysisStatus: z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED']).optional(),
  transcriptStatus: z.enum(['PENDING', 'RETRYING', 'AVAILABLE', 'UNAVAILABLE', 'FAILED']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  minScore: z.coerce.number().min(0).max(10).optional(),
  maxScore: z.coerce.number().min(0).max(10).optional(),
  sort: z.enum(['newest', 'oldest', 'highest', 'lowest']).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export type VideoQuery = z.infer<typeof VideoQuerySchema>

export function buildVideoQuery(query: VideoQuery): {
  where: Prisma.VideoWhereInput
  orderBy: Prisma.VideoOrderByWithRelationInput[]
} {
  const where: Prisma.VideoWhereInput = {}
  const and: Prisma.VideoWhereInput[] = []

  if (query.q?.trim()) {
    const term = query.q.trim()
    and.push({
      OR: [
        { title: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
        { channel: { title: { contains: term, mode: 'insensitive' } } },
        { report: { is: { executiveSummary: { contains: term, mode: 'insensitive' } } } },
      ],
    })
  }
  if (query.channelId) and.push({ channelId: query.channelId })
  if (query.analysisStatus) and.push({ analysisStatus: query.analysisStatus })
  if (query.transcriptStatus) and.push({ transcriptStatus: query.transcriptStatus })

  const publishedAt: Prisma.DateTimeFilter = {}
  if (query.from && !Number.isNaN(Date.parse(query.from))) publishedAt.gte = new Date(query.from)
  if (query.to && !Number.isNaN(Date.parse(query.to))) {
    const to = new Date(query.to)
    to.setUTCHours(23, 59, 59, 999)
    publishedAt.lte = to
  }
  if (Object.keys(publishedAt).length) and.push({ publishedAt })

  if (query.minScore != null || query.maxScore != null) {
    const overallScore: Prisma.FloatNullableFilter = {}
    if (query.minScore != null) overallScore.gte = query.minScore
    if (query.maxScore != null) overallScore.lte = query.maxScore
    and.push({ report: { is: { overallScore } } })
  }

  if (and.length) where.AND = and

  const orderBy: Prisma.VideoOrderByWithRelationInput[] =
    query.sort === 'oldest'
      ? [{ publishedAt: 'asc' }]
      : query.sort === 'highest'
        ? [{ report: { overallScore: 'desc' } }, { publishedAt: 'desc' }]
        : query.sort === 'lowest'
          ? [{ report: { overallScore: 'asc' } }, { publishedAt: 'desc' }]
          : [{ publishedAt: 'desc' }]

  return { where, orderBy }
}
