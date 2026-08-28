import { Prisma, type JobStatus, type JobType, type MonitoringJob } from '@prisma/client'
import { prisma } from '../prisma'
import { createLogger, safeErrorMessage } from '../logger'

const log = createLogger('jobs')

/** After this many failed attempts a job stops retrying automatically. */
export const MAX_JOB_ATTEMPTS = 3
/** Exponential-ish backoff between job attempts. */
export const JOB_BACKOFF_MINUTES = [2, 10, 30]

export type JobPayload = Record<string, unknown> & { nextAttemptAt?: string }

/**
 * Idempotency key. While a job is PENDING or RUNNING this value is set and the
 * database's UNIQUE constraint physically prevents a second copy from being
 * queued. It is cleared when the job finishes so the same work can be re-run
 * later (e.g. "Regenerate analysis").
 */
export function buildDedupeKey(jobType: JobType, ids: { channelId?: string | null; videoId?: string | null }): string {
  if (ids.videoId) return `${jobType}:video:${ids.videoId}`
  if (ids.channelId) return `${jobType}:channel:${ids.channelId}`
  return `${jobType}:global`
}

/** Queue a job, or return the one already queued for the same work. */
export async function enqueueJob(args: {
  jobType: JobType
  channelId?: string | null
  videoId?: string | null
  payload?: JobPayload
}): Promise<{ job: MonitoringJob; created: boolean }> {
  const dedupeKey = buildDedupeKey(args.jobType, args)
  try {
    const job = await prisma.monitoringJob.create({
      data: {
        jobType: args.jobType,
        channelId: args.channelId ?? null,
        videoId: args.videoId ?? null,
        payload: (args.payload ?? {}) as Prisma.InputJsonValue,
        dedupeKey,
        status: 'PENDING',
      },
    })
    return { job, created: true }
  } catch (err) {
    // P2002 = unique constraint violation -> an identical job is already queued.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const existing = await prisma.monitoringJob.findUnique({ where: { dedupeKey } })
      if (existing) {
        log.debug('Job already queued, skipping duplicate', { dedupeKey })
        return { job: existing, created: false }
      }
    }
    throw err
  }
}

/**
 * Atomically move a job PENDING -> RUNNING. Returns false if another worker
 * got there first, which makes the whole runner safe to run twice.
 */
export async function claimJob(jobId: string): Promise<boolean> {
  const result = await prisma.monitoringJob.updateMany({
    where: { id: jobId, status: 'PENDING' },
    data: { status: 'RUNNING', startedAt: new Date(), errorMessage: null, attempts: { increment: 1 } },
  })
  return result.count === 1
}

export async function completeJob(jobId: string, payloadPatch?: JobPayload): Promise<void> {
  const existing = await prisma.monitoringJob.findUnique({ where: { id: jobId } })
  await prisma.monitoringJob.update({
    where: { id: jobId },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      dedupeKey: null, // release the idempotency lock
      errorMessage: null,
      payload: { ...(existing?.payload as JobPayload | null), ...(payloadPatch ?? {}) } as Prisma.InputJsonValue,
    },
  })
}

/**
 * Records a failure. Re-queues the job with backoff while attempts remain,
 * otherwise marks it FAILED and releases the dedupe lock so it can be retried
 * manually from the UI.
 */
export async function failJob(jobId: string, error: unknown): Promise<{ willRetry: boolean }> {
  const message = safeErrorMessage(error)
  const job = await prisma.monitoringJob.findUnique({ where: { id: jobId } })
  if (!job) return { willRetry: false }

  const willRetry = job.attempts < MAX_JOB_ATTEMPTS
  const delay = JOB_BACKOFF_MINUTES[Math.min(job.attempts - 1, JOB_BACKOFF_MINUTES.length - 1)] ?? 30

  await prisma.monitoringJob.update({
    where: { id: jobId },
    data: willRetry
      ? {
          status: 'PENDING',
          errorMessage: message,
          payload: {
            ...(job.payload as JobPayload | null),
            nextAttemptAt: new Date(Date.now() + delay * 60_000).toISOString(),
          } as Prisma.InputJsonValue,
        }
      : { status: 'FAILED', errorMessage: message, completedAt: new Date(), dedupeKey: null },
  })

  log.error('Job failed', { jobId, jobType: job.jobType, attempts: job.attempts, willRetry, message })
  return { willRetry }
}

/** Pending jobs whose backoff window has elapsed, oldest first. */
export async function getRunnableJobs(limit = 10): Promise<MonitoringJob[]> {
  const candidates = await prisma.monitoringJob.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    take: limit * 3,
  })
  const now = Date.now()
  return candidates
    .filter((job) => {
      const next = (job.payload as JobPayload | null)?.nextAttemptAt
      return !next || new Date(next).getTime() <= now
    })
    .slice(0, limit)
}

/** Anything RUNNING for more than 30 minutes is assumed dead (container restart). */
export async function reclaimStaleJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 60_000)
  const result = await prisma.monitoringJob.updateMany({
    where: { status: 'RUNNING', startedAt: { lt: cutoff } },
    data: { status: 'PENDING', errorMessage: 'Job was reclaimed after appearing stuck.' },
  })
  if (result.count) log.warn('Reclaimed stale jobs', { count: result.count })
  return result.count
}

export type JobSummary = {
  id: string
  jobType: JobType
  status: JobStatus
  attempts: number
  errorMessage: string | null
  createdAt: Date
  completedAt: Date | null
}
