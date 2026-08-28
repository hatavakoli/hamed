import { prisma } from '../prisma'
import { createLogger } from '../logger'
import { getPreferences } from '../settings'

const log = createLogger('jobs:retention')

/**
 * Deletes videos (and, by cascade, their transcripts and reports) older than
 * the configured retention window. `dataRetentionDays = 0` means keep forever.
 */
export async function applyRetentionPolicy(): Promise<{ deletedVideos: number; deletedJobs: number }> {
  const prefs = await getPreferences()
  let deletedVideos = 0

  if (prefs.dataRetentionDays > 0) {
    const cutoff = new Date(Date.now() - prefs.dataRetentionDays * 24 * 3600 * 1000)
    const result = await prisma.video.deleteMany({ where: { publishedAt: { lt: cutoff } } })
    deletedVideos = result.count
  }

  // Finished job rows are only useful as a recent activity log.
  const jobCutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000)
  const jobs = await prisma.monitoringJob.deleteMany({
    where: { status: { in: ['COMPLETED', 'FAILED'] }, createdAt: { lt: jobCutoff } },
  })

  if (deletedVideos || jobs.count) log.info('Retention cleanup', { deletedVideos, deletedJobs: jobs.count })
  return { deletedVideos, deletedJobs: jobs.count }
}
