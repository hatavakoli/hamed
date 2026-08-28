import { prisma } from './prisma'
import { addDays, average } from './utils'

/** Everything the dashboard needs, in one place (shared by the page and the API). */
export async function getDashboardSummary() {
  const weekAgo = addDays(new Date(), -7)

  const [
    activeChannels,
    totalChannels,
    analysedThisWeek,
    awaitingTranscript,
    failedReports,
    failedJobs,
    totalVideos,
    totalReports,
    latestReports,
    recentJobs,
    pendingJobs,
    costAgg,
    scoreAgg,
  ] = await prisma.$transaction([
    prisma.channel.count({ where: { isActive: true } }),
    prisma.channel.count(),
    prisma.analysisReport.count({ where: { analysisStatus: 'COMPLETED', generatedAt: { gte: weekAgo } } }),
    prisma.video.count({ where: { transcriptStatus: { in: ['PENDING', 'RETRYING'] } } }),
    prisma.analysisReport.count({ where: { analysisStatus: 'FAILED' } }),
    prisma.monitoringJob.count({ where: { status: 'FAILED' } }),
    prisma.video.count(),
    prisma.analysisReport.count({ where: { analysisStatus: 'COMPLETED' } }),
    prisma.analysisReport.findMany({
      where: { analysisStatus: 'COMPLETED' },
      orderBy: { generatedAt: 'desc' },
      take: 8,
      include: { video: { include: { channel: { select: { id: true, title: true } } } } },
    }),
    prisma.monitoringJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: 12,
      include: {
        channel: { select: { title: true } },
        video: { select: { title: true, id: true } },
      },
    }),
    prisma.monitoringJob.count({ where: { status: { in: ['PENDING', 'RUNNING'] } } }),
    prisma.analysisReport.aggregate({ _sum: { estimatedCost: true }, where: { analysisStatus: 'COMPLETED' } }),
    prisma.analysisReport.findMany({
      where: { analysisStatus: 'COMPLETED', overallScore: { not: null } },
      select: { overallScore: true },
      take: 500,
      orderBy: { generatedAt: 'desc' },
    }),
  ])

  return {
    stats: {
      activeChannels,
      totalChannels,
      analysedThisWeek,
      awaitingTranscript,
      failedReports,
      failedJobs,
      totalVideos,
      totalReports,
      pendingJobs,
      estimatedSpendUsd: Math.round((costAgg._sum.estimatedCost ?? 0) * 10000) / 10000,
      averageScore: average(scoreAgg.map((s) => s.overallScore!).filter((s) => typeof s === 'number')),
    },
    latestReports: latestReports.map((r) => ({
      id: r.id,
      videoId: r.videoId,
      videoTitle: r.video.title,
      thumbnailUrl: r.video.thumbnailUrl,
      channelId: r.video.channel.id,
      channelTitle: r.video.channel.title,
      overallScore: r.overallScore,
      verdict: r.verdict,
      confidence: r.confidence,
      generatedAt: r.generatedAt,
      executiveSummary: r.executiveSummary,
    })),
    recentJobs: recentJobs.map((j) => ({
      id: j.id,
      jobType: j.jobType,
      status: j.status,
      attempts: j.attempts,
      errorMessage: j.errorMessage,
      createdAt: j.createdAt,
      completedAt: j.completedAt,
      target: j.video?.title ?? j.channel?.title ?? null,
      videoId: j.video?.id ?? null,
    })),
  }
}

export type DashboardSummary = Awaited<ReturnType<typeof getDashboardSummary>>
