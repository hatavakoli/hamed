import { loadEnvFiles } from './load-env'
loadEnvFiles()

import cron from 'node-cron'
import { prisma } from '../src/lib/prisma'
import { createLogger, safeErrorMessage } from '../src/lib/logger'
import { getPreferences } from '../src/lib/settings'
import { applyRetentionPolicy } from '../src/lib/jobs/retention'
import { isChannelSweepDue, queueChannelSweep, queueWeeklyDigest, tick } from '../src/lib/jobs/runner'

/**
 * Background worker.
 *
 * Runs as its own container in docker-compose (`worker` service) so a slow AI
 * call never blocks a web request. Everything it does goes through the same
 * job functions the API routes use.
 *
 * Schedule:
 *   every minute   -> drain the job queue, queue due transcript retries
 *   every 5 min    -> queue a full channel sweep IF the configured interval elapsed
 *   Monday 08:00   -> weekly digest
 *   daily 03:15    -> retention cleanup
 *
 * The channel interval lives in the database (Settings), so changing it takes
 * effect on the next tick without restarting the container.
 */

const log = createLogger('worker')
let running = false

async function safely(name: string, fn: () => Promise<unknown>) {
  if (running) {
    log.debug('Previous tick still running, skipping', { name })
    return
  }
  running = true
  try {
    await fn()
  } catch (err) {
    log.error(`${name} failed`, { message: safeErrorMessage(err) })
  } finally {
    running = false
  }
}

async function main() {
  const prefs = await getPreferences().catch(() => null)
  log.info('Worker starting', {
    monitorIntervalMinutes: prefs?.monitorIntervalMinutes ?? 60,
    aiProvider: prefs?.aiProvider ?? 'unknown',
    transcriptProvider: prefs?.transcriptProvider ?? 'unknown',
  })

  // Drain the queue every minute.
  cron.schedule('* * * * *', () =>
    safely('tick', async () => {
      const result = await tick({ limit: 3 })
      if (result.ran || result.queued) log.info('Tick', result)
    }),
  )

  // Decide whether a full channel sweep is due.
  cron.schedule('*/5 * * * *', () =>
    safely('sweep-check', async () => {
      if (!(await isChannelSweepDue())) return
      const { created, jobId } = await queueChannelSweep()
      if (created) log.info('Queued channel sweep', { jobId })
    }),
  )

  // Weekly digest, Monday 08:00 UTC.
  cron.schedule('0 8 * * 1', () =>
    safely('weekly-digest', async () => {
      const { created, jobId } = await queueWeeklyDigest()
      if (created) log.info('Queued weekly digest', { jobId })
    }),
  )

  // Retention cleanup, daily at 03:15 UTC.
  cron.schedule('15 3 * * *', () => safely('retention', () => applyRetentionPolicy()))

  // Run one sweep shortly after boot so a fresh install shows data quickly.
  setTimeout(() => {
    void safely('boot-sweep', async () => {
      if (await isChannelSweepDue()) await queueChannelSweep()
      await tick({ limit: 3 })
    })
  }, 10_000)

  log.info('Worker ready — cron schedules registered')
}

async function shutdown(signal: string) {
  log.info('Shutting down', { signal })
  await prisma.$disconnect().catch(() => undefined)
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('unhandledRejection', (reason) => log.error('Unhandled rejection', { message: safeErrorMessage(reason) }))

main().catch((err) => {
  log.error('Worker failed to start', { message: safeErrorMessage(err) })
  process.exit(1)
})
