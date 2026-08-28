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

/** Drains the queue, up to `limit` jobs. Returns how many ran. */
export async function runPendingJobs(limit = 5): Promise<number> {
  await reclaimStaleJobs()
  const jobs = await getRunnableJobs(limit)
  for (const job of jobs) await runJob(job)
  return jobs.length
}

/** One worker tick: queue due work, then drain the queue. */
export async function tick(options: { limit?: number } = {}): Promise<{ queued: number; ran: number }> {
  let queued = 0
  try {
    queued += await processDueTranscriptRetries()
  } catch (err) {
    log.error('Transcript retry scan failed', { message: safeErrorMessage(err) })
  }
  const ran = await runPendingJobs(options.limit ?? 5)
  return { queued, ran }
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
