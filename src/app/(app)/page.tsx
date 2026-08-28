import Link from 'next/link'
import { AlertTriangle, FileText, PlayCircle, RefreshCw, Tv, Zap } from 'lucide-react'
import { PageHeader } from '@/components/app-shell'
import { ActionButton } from '@/components/action-button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { InfoHint } from '@/components/ui/tooltip'
import { StatusBadge, VerdictBadge, jobTypeLabel } from '@/components/status-badge'
import { ScoreChip } from '@/components/score'
import { EmptyState } from '@/components/empty-state'
import { getDashboardSummary } from '@/lib/dashboard'
import { formatDateTime, timeAgo, truncate } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const { stats, latestReports, recentJobs } = await getDashboardSummary()

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Everything your monitored channels published, analysed and scored."
        actions={
          <>
            <ActionButton endpoint="/api/jobs/check-all-channels" successTitle="Channels checked" variant="default">
              <RefreshCw /> Check all channels now
            </ActionButton>
            <ActionButton endpoint="/api/jobs/run" body={{ limit: 3 }} successTitle="Queue processed" variant="outline">
              <Zap /> Run queued jobs
            </ActionButton>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Active channels"
          value={stats.activeChannels}
          sub={`${stats.totalChannels} total`}
          icon={Tv}
          href="/channels"
        />
        <StatCard
          title="Analysed this week"
          value={stats.analysedThisWeek}
          sub={`${stats.totalReports} reports all time`}
          icon={FileText}
          href="/videos?analysisStatus=COMPLETED"
        />
        <StatCard
          title="Waiting for transcript"
          value={stats.awaitingTranscript}
          sub="Retries run automatically"
          icon={PlayCircle}
          href="/videos?transcriptStatus=PENDING"
          tone={stats.awaitingTranscript > 0 ? 'warning' : 'default'}
          hint="Transcripts are retried after 15 minutes, 1 hour and 6 hours. After that you can retry manually from the report page."
        />
        <StatCard
          title="Errors"
          value={stats.failedReports + stats.failedJobs}
          sub={`${stats.failedReports} reports · ${stats.failedJobs} jobs`}
          icon={AlertTriangle}
          href="/jobs?status=FAILED"
          tone={stats.failedReports + stats.failedJobs > 0 ? 'destructive' : 'default'}
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <MiniStat label="Videos detected" value={stats.totalVideos} />
        <MiniStat label="Average score" value={stats.averageScore != null ? `${stats.averageScore}/10` : '—'} />
        <MiniStat
          label="Estimated AI spend"
          value={`$${stats.estimatedSpendUsd.toFixed(4)}`}
          hint="Rough estimate from token counts reported by the model. Mock runs cost nothing."
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Latest reports</CardTitle>
              <CardDescription>Newest completed analyses.</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/videos">View all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {latestReports.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No reports yet"
                description="Add a channel, then press “Check all channels now”. New videos are analysed automatically."
                action={
                  <Button asChild size="sm">
                    <Link href="/channels">Add your first channel</Link>
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y">
                {latestReports.map((report) => (
                  <li key={report.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                    <ScoreChip score={report.overallScore} className="mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/videos/${report.videoId}`} className="line-clamp-1 text-sm font-medium hover:underline">
                        {report.videoTitle}
                      </Link>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {truncate(report.executiveSummary ?? '', 180)}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Badge variant="muted">{report.channelTitle}</Badge>
                        <VerdictBadge verdict={report.verdict} />
                        {report.confidence === 'low' && <Badge variant="warning">Low confidence</Badge>}
                        <span className="text-xs text-muted-foreground">{timeAgo(report.generatedAt)}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Recent activity</CardTitle>
              <CardDescription>
                {stats.pendingJobs > 0 ? `${stats.pendingJobs} job(s) queued` : 'Queue is empty'}
              </CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/jobs">Full log</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentJobs.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No jobs have run yet.</p>
            ) : (
              <ul className="space-y-2.5">
                {recentJobs.map((job) => (
                  <li key={job.id} className="flex items-start justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{jobTypeLabel(job.jobType)}</p>
                      {job.target && <p className="truncate text-xs text-muted-foreground">{job.target}</p>}
                      {job.errorMessage && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-destructive">{job.errorMessage}</p>
                      )}
                      <p className="text-xs text-muted-foreground">{formatDateTime(job.createdAt)}</p>
                    </div>
                    <StatusBadge kind="job" status={job.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}

function StatCard({
  title,
  value,
  sub,
  icon: Icon,
  href,
  tone = 'default',
  hint,
}: {
  title: string
  value: number
  sub: string
  icon: React.ComponentType<{ className?: string }>
  href: string
  tone?: 'default' | 'warning' | 'destructive'
  hint?: string
}) {
  return (
    <Link href={href} className="group">
      <Card className="h-full transition-colors group-hover:border-primary/40">
        <CardContent className="flex items-start justify-between gap-3 p-5">
          <div className="min-w-0">
            <div className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {title}
              {hint && <InfoHint>{hint}</InfoHint>}
            </div>
            <p
              className={
                tone === 'destructive'
                  ? 'mt-1 text-3xl font-semibold text-destructive'
                  : tone === 'warning'
                    ? 'mt-1 text-3xl font-semibold text-amber-600 dark:text-amber-400'
                    : 'mt-1 text-3xl font-semibold'
              }
            >
              {value}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>
          </div>
          <Icon className="size-5 shrink-0 text-muted-foreground" />
        </CardContent>
      </Card>
    </Link>
  )
}

function MiniStat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-3">
      <span className="flex items-center gap-1 text-sm text-muted-foreground">
        {label}
        {hint && <InfoHint>{hint}</InfoHint>}
      </span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  )
}
