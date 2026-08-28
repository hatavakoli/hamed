import Link from 'next/link'
import { Activity, Zap } from 'lucide-react'
import { PageHeader } from '@/components/app-shell'
import { ActionButton } from '@/components/action-button'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge, jobTypeLabel } from '@/components/status-badge'
import { EmptyState } from '@/components/empty-state'
import { prisma } from '@/lib/prisma'
import { formatDateTime } from '@/lib/utils'
import type { JobStatus } from '@prisma/client'

export const dynamic = 'force-dynamic'

const FILTERS: { label: string; value: string }[] = [
  { label: 'All', value: '' },
  { label: 'Queued', value: 'PENDING' },
  { label: 'Running', value: 'RUNNING' },
  { label: 'Done', value: 'COMPLETED' },
  { label: 'Failed', value: 'FAILED' },
]

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams
  const valid = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED'].includes(status ?? '')

  const jobs = await prisma.monitoringJob.findMany({
    where: valid ? { status: status as JobStatus } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { channel: { select: { id: true, title: true } }, video: { select: { id: true, title: true } } },
  })

  return (
    <>
      <PageHeader
        title="Activity log"
        description="Every monitoring, transcript and analysis job, with its errors and retry count."
        actions={
          <ActionButton endpoint="/api/jobs/run" body={{ limit: 3 }} successTitle="Queue processed">
            <Zap /> Run queued jobs
          </ActionButton>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <Button
            key={filter.value}
            asChild
            size="sm"
            variant={(status ?? '') === filter.value ? 'default' : 'outline'}
          >
            <Link href={filter.value ? `/jobs?status=${filter.value}` : '/jobs'}>{filter.label}</Link>
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0 sm:p-2">
          {jobs.length === 0 ? (
            <EmptyState icon={Activity} title="No jobs to show" description="Jobs appear here as soon as monitoring runs." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Finished</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="whitespace-nowrap font-medium">{jobTypeLabel(job.jobType)}</TableCell>
                    <TableCell className="max-w-xs">
                      {job.video ? (
                        <Link href={`/videos/${job.video.id}`} className="line-clamp-1 hover:underline">
                          {job.video.title}
                        </Link>
                      ) : job.channel ? (
                        <Link href={`/channels/${job.channel.id}`} className="line-clamp-1 hover:underline">
                          {job.channel.title}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">All channels</span>
                      )}
                      {job.errorMessage && <p className="mt-0.5 line-clamp-2 text-xs text-destructive">{job.errorMessage}</p>}
                    </TableCell>
                    <TableCell>
                      <StatusBadge kind="job" status={job.status} />
                    </TableCell>
                    <TableCell className="tabular-nums">{job.attempts}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDateTime(job.createdAt)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {job.completedAt ? formatDateTime(job.completedAt) : '—'}
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
