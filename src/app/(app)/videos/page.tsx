import Link from 'next/link'
import { ListVideo } from 'lucide-react'
import { PageHeader } from '@/components/app-shell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { StatusBadge, VerdictBadge } from '@/components/status-badge'
import { ScoreChip } from '@/components/score'
import { EmptyState } from '@/components/empty-state'
import { VideoFilters } from './filters'
import { prisma } from '@/lib/prisma'
import { buildVideoQuery, VideoQuerySchema } from '@/lib/video-query'
import { formatDate, formatDuration, formatNumber } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function VideosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const raw = await searchParams
  const flat = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]).filter(([, v]) => v !== undefined && v !== ''),
  )
  // Reuse the exact same validation and query builder as GET /api/videos.
  const parsed = VideoQuerySchema.safeParse(flat)
  const query = parsed.success ? parsed.data : VideoQuerySchema.parse({})
  const { where, orderBy } = buildVideoQuery(query)

  const [channels, total, videos] = await Promise.all([
    prisma.channel.findMany({ orderBy: { title: 'asc' }, select: { id: true, title: true } }),
    prisma.video.count({ where }),
    prisma.video.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        channel: { select: { id: true, title: true } },
        report: { select: { overallScore: true, verdict: true, confidence: true, executiveSummary: true } },
      },
    }),
  ])

  const totalPages = Math.max(1, Math.ceil(total / query.pageSize))
  const pageLink = (page: number) => {
    const next = new URLSearchParams(flat as Record<string, string>)
    next.set('page', String(page))
    return `/videos?${next.toString()}`
  }

  return (
    <>
      <PageHeader
        title="Videos & reports"
        description={`${total} video${total === 1 ? '' : 's'} detected across your monitored channels.`}
      />

      <VideoFilters channels={channels} />

      {videos.length === 0 ? (
        <EmptyState
          icon={ListVideo}
          title="No videos match these filters"
          description="Try clearing the filters, or add a channel and run a check."
          action={
            <Button asChild size="sm" variant="outline">
              <Link href="/videos">Clear filters</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {videos.map((video) => (
            <Card key={video.id}>
              <CardContent className="flex flex-col gap-4 p-4 sm:flex-row">
                <Link href={`/videos/${video.id}`} className="shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={video.thumbnailUrl ?? 'https://placehold.co/320x180/e2e8f0/64748b/png?text=No+thumbnail'}
                    alt=""
                    className="aspect-video w-full rounded-lg border object-cover sm:w-44"
                  />
                </Link>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/videos/${video.id}`} className="line-clamp-2 font-medium hover:underline">
                      {video.title}
                    </Link>
                    <ScoreChip score={video.report?.overallScore ?? null} className="shrink-0 text-base" />
                  </div>

                  <p className="mt-1 text-xs text-muted-foreground">
                    <Link href={`/channels/${video.channel.id}`} className="hover:underline">
                      {video.channel.title}
                    </Link>
                    {' · '}
                    {formatDate(video.publishedAt)} · {formatDuration(video.durationSeconds)} ·{' '}
                    {formatNumber(video.viewCount)} views
                  </p>

                  {video.report?.executiveSummary && (
                    <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{video.report.executiveSummary}</p>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <StatusBadge kind="transcript" status={video.transcriptStatus} />
                    <StatusBadge kind="analysis" status={video.analysisStatus} />
                    <VerdictBadge verdict={video.report?.verdict ?? null} />
                    {video.report?.confidence === 'low' && <Badge variant="warning">Low confidence</Badge>}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {query.page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm" disabled={query.page <= 1}>
              <Link href={pageLink(Math.max(1, query.page - 1))}>Previous</Link>
            </Button>
            <Button asChild variant="outline" size="sm" disabled={query.page >= totalPages}>
              <Link href={pageLink(Math.min(totalPages, query.page + 1))}>Next</Link>
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
