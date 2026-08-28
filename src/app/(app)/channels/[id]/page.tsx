import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ExternalLink, History, RefreshCw, TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { PageHeader } from '@/components/app-shell'
import { ActionButton } from '@/components/action-button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { InfoHint } from '@/components/ui/tooltip'
import { StatusBadge } from '@/components/status-badge'
import { ScoreChip, ScoreRow } from '@/components/score'
import { EmptyState } from '@/components/empty-state'
import { BackfillButton } from './backfill-button'
import { prisma } from '@/lib/prisma'
import { computeChannelInsights } from '@/lib/insights'
import { SCORE_LABELS } from '@/lib/ai/schema'
import { formatDate, formatDuration, formatNumber, timeAgo } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function ChannelDetailPage({ params }: { params: Promise<{ id: string }> }) {
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
  if (!channel) notFound()

  const completed = channel.videos.filter((v) => v.report?.analysisStatus === 'COMPLETED')
  const insights = computeChannelInsights(
    completed.map((v) => ({
      overallScore: v.report!.overallScore,
      generatedAt: v.report!.generatedAt,
      structuredData: v.report!.structuredData,
      videoTitle: v.title,
      publishedAt: v.publishedAt,
    })),
  )

  const TrendIcon =
    insights.recentTrend.direction === 'up' ? TrendingUp : insights.recentTrend.direction === 'down' ? TrendingDown : Minus

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href="/channels">
          <ArrowLeft /> All channels
        </Link>
      </Button>

      <PageHeader
        title={channel.title}
        description={channel.handle ?? channel.youtubeChannelId}
        actions={
          <>
            <ActionButton endpoint={`/api/channels/${channel.id}/check`} successTitle="Check complete">
              <RefreshCw /> Check now
            </ActionButton>
            <BackfillButton channelId={channel.id} />
            <Button asChild variant="outline">
              <a href={`https://www.youtube.com/channel/${channel.youtubeChannelId}`} target="_blank" rel="noreferrer noopener">
                <ExternalLink /> YouTube
              </a>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Channel information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={channel.thumbnailUrl ?? 'https://placehold.co/96x96/e2e8f0/64748b/png?text=YT'}
                alt=""
                className="size-14 shrink-0 rounded-full border object-cover"
              />
              <p className="text-sm text-muted-foreground">{channel.description || 'No description available.'}</p>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              <Meta label="Status" value={<Badge variant={channel.isActive ? 'success' : 'muted'}>{channel.isActive ? 'Active' : 'Paused'}</Badge>} />
              <Meta label="Videos detected" value={String(channel.videos.length)} />
              <Meta label="Reports" value={String(completed.length)} />
              <Meta label="Last checked" value={timeAgo(channel.lastCheckedAt)} />
              <Meta label="Last success" value={timeAgo(channel.lastSuccessfulCheckAt)} />
              <Meta label="Monitoring since" value={formatDate(channel.createdAt)} />
              <Meta label="Uploads playlist" value={channel.uploadsPlaylistId ?? '—'} />
              <Meta label="Channel ID" value={channel.youtubeChannelId} />
            </dl>
            {channel.lastError && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                Last check failed: {channel.lastError}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1 text-base">
              Channel insights
              <InfoHint>
                Computed from the reports already stored for this channel — no extra AI call is made to show this.
              </InfoHint>
            </CardTitle>
            <CardDescription>{insights.reportCount} analysed video(s)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {insights.reportCount === 0 ? (
              <p className="text-muted-foreground">Insights appear once at least one video has been analysed.</p>
            ) : (
              <>
                <div className="flex items-start gap-2 rounded-md bg-muted px-3 py-2">
                  <TrendIcon className="mt-0.5 size-4 shrink-0" />
                  <p className="text-xs">{insights.recentTrend.note}</p>
                </div>

                <InsightList title="Common formats" items={insights.commonFormats} />
                <InsightList title="Frequent title patterns" items={insights.titlePatterns} />
                <InsightList title="Recurring topics" items={insights.commonTopics.slice(0, 6)} />

                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Average scores</p>
                  <div className="space-y-2">
                    {Object.entries(SCORE_LABELS)
                      .slice(0, 4)
                      .map(([key, label]) => (
                        <ScoreRow key={key} label={label} score={insights.averageScores[key]} />
                      ))}
                    <ScoreRow label="Overall" score={insights.averageOverall} />
                  </div>
                </div>

                {insights.buildWorthyIdeas.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Product ideas worth exploring
                    </p>
                    <ul className="space-y-1.5">
                      {insights.buildWorthyIdeas.map((idea, i) => (
                        <li key={i} className="text-xs text-muted-foreground">
                          <Badge variant={idea.verdict === 'build' ? 'success' : 'warning'} className="mr-1.5">
                            {idea.verdict}
                          </Badge>
                          {idea.idea}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Detected videos</CardTitle>
            <CardDescription>Newest first. Click a row to open its report.</CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href={`/videos?channelId=${channel.id}`}>Filter in Videos</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {channel.videos.length === 0 ? (
            <EmptyState
              icon={History}
              title="No videos detected yet"
              description="Press “Check now” to look for recent uploads, or “Analyse past videos” to pull in older ones."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Video</TableHead>
                  <TableHead>Published</TableHead>
                  <TableHead>Transcript</TableHead>
                  <TableHead>Analysis</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {channel.videos.map((video) => (
                  <TableRow key={video.id}>
                    <TableCell className="max-w-md">
                      <Link href={`/videos/${video.id}`} className="line-clamp-1 font-medium hover:underline">
                        {video.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {formatDuration(video.durationSeconds)} · {formatNumber(video.viewCount)} views
                      </p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDate(video.publishedAt)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge kind="transcript" status={video.transcriptStatus} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge kind="analysis" status={video.analysisStatus} />
                    </TableCell>
                    <TableCell className="text-right">
                      <ScoreChip score={video.report?.overallScore ?? null} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  )
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  )
}

function InsightList({ title, items }: { title: string; items: { label: string; count: number }[] }) {
  if (!items.length) return null
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <Badge key={item.label} variant="secondary">
            {item.label} <span className="ml-1 text-muted-foreground">×{item.count}</span>
          </Badge>
        ))}
      </div>
    </div>
  )
}
