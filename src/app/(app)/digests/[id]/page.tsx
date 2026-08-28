import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Lightbulb } from 'lucide-react'
import { PageHeader } from '@/components/app-shell'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScoreChip } from '@/components/score'
import { prisma } from '@/lib/prisma'
import type { WeeklyDigestData } from '@/lib/jobs/weekly-digest'
import { addDays, formatDate } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function DigestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const digest = await prisma.weeklyDigest.findUnique({ where: { id } })
  if (!digest) notFound()

  const data = digest.structuredData as unknown as WeeklyDigestData

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href="/digests">
          <ArrowLeft /> All digests
        </Link>
      </Button>

      <PageHeader
        title={`Week of ${formatDate(digest.weekStart)}`}
        description={`${formatDate(digest.weekStart)} – ${formatDate(addDays(digest.weekEnd, -1))} · ${digest.videoCount} videos across ${data.channelCount ?? 0} channels`}
        actions={<Badge variant={digest.sentAt ? 'success' : 'muted'}>{digest.sentAt ? 'Emailed' : 'Not emailed'}</Badge>}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="leading-relaxed">{data.summary}</p>
            <div className="rounded-lg border-l-4 border-primary bg-muted px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">What changed this week</p>
              <p className="mt-1">{data.whatChanged}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Patterns</CardTitle>
            <CardDescription>Average score: {data.averageScore ?? '—'}/10</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <TagList title="Repeated themes" items={data.repeatedThemes} />
            <TagList title="Repeated hooks" items={data.repeatedHooks} />
            <TagList title="Title structures" items={data.repeatedTitleStructures} />
            <TagList title="Strongest opportunity themes" items={data.strongestOpportunityThemes} />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lightbulb className="size-4" /> Original content opportunities
          </CardTitle>
          <CardDescription>Ideas for your own channel, based on the demand seen this week.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(data.opportunities ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No opportunities were generated for this week.</p>
          ) : (
            data.opportunities.map((opportunity, i) => (
              <div key={i} className="rounded-lg border p-4">
                <p className="font-medium">
                  {i + 1}. {opportunity.title}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{opportunity.why}</p>
                {opportunity.format && (
                  <Badge variant="secondary" className="mt-2">
                    {opportunity.format}
                  </Badge>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">By channel</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {(data.byChannel ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No videos were analysed in this window.</p>
          ) : (
            data.byChannel.map((channel) => (
              <div key={channel.channelId}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Link href={`/channels/${channel.channelId}`} className="font-medium hover:underline">
                    {channel.channelTitle}
                  </Link>
                  {channel.commonFormats.map((f) => (
                    <Badge key={f.label} variant="secondary">
                      {f.label} ×{f.count}
                    </Badge>
                  ))}
                </div>
                <ul className="space-y-1.5">
                  {channel.videos.map((video) => (
                    <li key={video.id} className="flex items-center justify-between gap-3 text-sm">
                      <Link href={`/videos/${video.id}`} className="line-clamp-1 hover:underline">
                        {video.title}
                      </Link>
                      <ScoreChip score={video.score} />
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {(data.buildWorthyIdeas ?? []).length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Product ideas surfaced this week</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.buildWorthyIdeas.map((idea, i) => (
                <li key={i} className="text-sm">
                  <Badge variant={idea.verdict === 'build' ? 'success' : 'warning'} className="mr-2">
                    {idea.verdict}
                  </Badge>
                  {idea.idea}
                  <span className="ml-1 text-xs text-muted-foreground">— from “{idea.videoTitle}”</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  )
}

function TagList({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <Badge key={item} variant="secondary">
            {item}
          </Badge>
        ))}
      </div>
    </div>
  )
}
