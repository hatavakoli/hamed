import type { MonitoringJob } from '@prisma/client'
import { prisma } from '../prisma'
import { createLogger, safeErrorMessage } from '../logger'
import { getPreferences } from '../settings'
import { claimJob, completeJob, enqueueJob, failJob, getRunnableJobs, reclaimStaleJobs } from './helpers'
import { checkAllChannels, checkChannel } from './check-channels'
import { processVideo } from './process-video'
import { processDueTranscriptRetries, retrieveTranscript } from './transcript-job'
import { generateWeeklyDigest } from './weekly-digest'

const log = createLogger('jobs:runner')

/** Executes one queued job. Called by the worker and by the manual API routes. */
export async function runJob(job: MonitoringJob): Promise<void> {
  const claimed = await claimJob(job.id)
  if (!claimed) {
    log.debug('Job already claimed by someone else', { jobId: job.id })
    return
  }

  try {
    switch (job.jobType) {
      case 'CHECK_ALL_CHANNELS': {
        const result = await checkAllChannels()
        await completeJob(job.id, { result: { channelsChecked: result.channelsChecked, newVideos: result.totalNewVideos } })
        break
      }
      case 'CHECK_CHANNEL': {
        if (!job.channelId) throw new Error('CHECK_CHANNEL job has no channelId')
        const result = await checkChannel(job.channelId)
        if (result.error) throw new Error(result.error)
        await completeJob(job.id, { result: { newVideos: result.newVideos } })
        break
      }
      case 'PROCESS_VIDEO': {
        if (!job.videoId) throw new Error('PROCESS_VIDEO job has no videoId')
        const payload = (job.payload ?? {}) as { force?: boolean }
        const result = await processVideo(job.videoId, { force: payload.force })
        await completeJob(job.id, {
          result: { score: result.overallScore, transcript: result.transcriptStatus, emailed: result.emailed },
        })
        break
      }
      case 'RETRY_TRANSCRIPT': {
        if (!job.videoId) throw new Error('RETRY_TRANSCRIPT job has no videoId')
        const outcome = await retrieveTranscript(job.videoId)
        // A transcript arriving late is worth a fresh, higher-confidence analysis.
        if (outcome.status === 'AVAILABLE') {
          await enqueueJob({ jobType: 'PROCESS_VIDEO', videoId: job.videoId, payload: { force: true } })
        }
        await completeJob(job.id, { result: { status: outcome.status, reason: outcome.reason } })
        break
      }
      case 'WEEKLY_DIGEST': {
        const result = await generateWeeklyDigest()
        await completeJob(job.id, { result: { digestId: result.digestId, videoCount: result.videoCount } })
        break
      }
      default: {
        throw new Error(`Unknown job type: ${job.jobType}`)
      }
    }
  } catch (err) {
    await failJob(job.id, err)
  }
}

/**
 * Drains the queue, up to `limit` jobs.
 *
 * `budgetMs` exists for serverless (Vercel), where the whole request is killed
 * at a hard timeout. We stop *starting* new jobs once the budget is spent, so a
 * job is never cut off halfway through. A job already in flight still runs to
 * completion, which is why the budget should be comfortably under the platform
 * limit. Anything left in the queue is picked up by the next invocation.
 *
 * Returns how many jobs ran and whether work was left behind.
 */
export async function runPendingJobs(
  limit = 5,
  budgetMs?: number,
): Promise<{ ran: number; stoppedEarly: boolean }> {
  const startedAt = Date.now()
  await reclaimStaleJobs()

  const jobs = await getRunnableJobs(limit)
  let ran = 0
  for (const job of jobs) {
    if (budgetMs !== undefined && Date.now() - startedAt >= budgetMs) {
      log.info('Time budget spent — leaving the rest of the queue for the next run', {
        ran,
        remaining: jobs.length - ran,
      })
      return { ran, stoppedEarly: true }
    }
    await runJob(job)
    ran++
  }
  return { ran, stoppedEarly: false }
}

/** One worker tick: queue due work, then drain the queue. */
export async function tick(
  options: { limit?: number; budgetMs?: number } = {},
): Promise<{ queued: number; ran: number; stoppedEarly: boolean }> {
  let queued = 0
  try {
    queued += await processDueTranscriptRetries()
  } catch (err) {
    log.error('Transcript retry scan failed', { message: safeErrorMessage(err) })
  }
  const { ran, stoppedEarly } = await runPendingJobs(options.limit ?? 5, options.budgetMs)
  return { queued, ran, stoppedEarly }
}

/** True when the monitoring interval has elapsed since the last successful sweep. */
export async function isChannelSweepDue(): Promise<boolean> {
  const prefs = await getPreferences()
  const last = await prisma.monitoringJob.findFirst({
    where: { jobType: 'CHECK_ALL_CHANNELS', status: 'COMPLETED' },
    orderBy: { completedAt: 'desc' },
  })
  if (!last?.completedAt) return true
  return Date.now() - last.completedAt.getTime() >= prefs.monitorIntervalMinutes * 60_000
}

export async function queueChannelSweep(): Promise<{ created: boolean; jobId: string }> {
  const { job, created } = await enqueueJob({ jobType: 'CHECK_ALL_CHANNELS' })
  return { created, jobId: job.id }
}

export async function queueWeeklyDigest(): Promise<{ created: boolean; jobId: string }> {
  const { job, created } = await enqueueJob({ jobType: 'WEEKLY_DIGEST' })
  return { created, jobId: job.id }
}
