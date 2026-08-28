import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'

/**
 * INTEGRATION TEST — the full pipeline against a real PostgreSQL database.
 *
 *   detect a new video  ->  save the transcript  ->  create the report
 *   ->  send/log the notification
 *
 * Everything external (YouTube, transcripts, AI, email) is mocked via
 * MOCK_MODE=true, so this needs no API keys — only a database.
 *
 * Run it with:
 *   TEST_DATABASE_URL="postgresql://ycim:ycim_password@localhost:5432/ycim_test" npm test
 *
 * If no database is reachable the whole suite is skipped with a clear message
 * rather than failing, so `npm test` still works on a machine without Postgres.
 */

process.env.MOCK_MODE = 'true'
process.env.NEXTAUTH_SECRET = 'integration-test-secret'
process.env.APP_BASE_URL = 'http://localhost:3000'
process.env.ADMIN_EMAIL = 'integration@example.com'
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? ''

const TEST_CHANNEL_ID = 'UCintegrationTestChannel1'
const TEST_HANDLE = '@integration-test-channel'

let prisma: PrismaClient
let databaseReachable = false

beforeAll(async () => {
  if (!process.env.DATABASE_URL) return
  try {
    const mod = await import('@/lib/prisma')
    prisma = mod.prisma
    await prisma.$queryRaw`SELECT 1`
    databaseReachable = true
  } catch {
    databaseReachable = false
    return
  }
  await cleanup()
})

afterAll(async () => {
  if (!databaseReachable) return
  await cleanup()
  await prisma.$disconnect()
})

async function cleanup() {
  await prisma.channel.deleteMany({ where: { youtubeChannelId: TEST_CHANNEL_ID } })
  await prisma.appSetting.deleteMany({ where: { key: { startsWith: 'pref:' } } })
}

// vitest's runIf keeps the suite green on a machine with no Postgres.
const describeDb = describe.runIf(() => databaseReachable)

describeDb('full analysis pipeline (mocked adapters, real database)', () => {
  let channelDbId: string
  const emailLines: string[] = []

  beforeAll(async () => {
    // Capture what the console email provider prints.
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      emailLines.push(args.map(String).join(' '))
    })

    const { MockYouTubeClient } = await import('@/lib/youtube/mock-client')
    const resolved = await new MockYouTubeClient().resolveChannel(TEST_HANDLE)

    const channel = await prisma.channel.create({
      data: {
        youtubeChannelId: TEST_CHANNEL_ID,
        title: 'Integration Test Channel',
        handle: TEST_HANDLE,
        uploadsPlaylistId: resolved.uploadsPlaylistId,
        isActive: true,
      },
    })
    channelDbId = channel.id
  })

  it('1. detects new videos and queues them exactly once', async () => {
    const { checkChannel } = await import('@/lib/jobs/check-channels')

    const first = await checkChannel(channelDbId, { maxVideos: 3 })
    expect(first.error).toBeUndefined()
    expect(first.newVideos).toBeGreaterThan(0)

    const videos = await prisma.video.findMany({ where: { channelId: channelDbId } })
    expect(videos.length).toBe(first.newVideos)

    // One PROCESS_VIDEO job per new video, and no duplicates.
    const jobs = await prisma.monitoringJob.findMany({ where: { channelId: channelDbId, jobType: 'PROCESS_VIDEO' } })
    expect(jobs.length).toBe(first.newVideos)
  })

  it('2. never creates a duplicate video or duplicate job on re-check', async () => {
    const { checkChannel } = await import('@/lib/jobs/check-channels')
    const before = await prisma.video.count({ where: { channelId: channelDbId } })
    const jobsBefore = await prisma.monitoringJob.count({ where: { channelId: channelDbId } })

    const second = await checkChannel(channelDbId, { maxVideos: 3 })
    expect(second.newVideos).toBe(0)

    expect(await prisma.video.count({ where: { channelId: channelDbId } })).toBe(before)
    expect(await prisma.monitoringJob.count({ where: { channelId: channelDbId } })).toBe(jobsBefore)
  })

  it('3. saves a transcript, creates a report, and logs the notification', async () => {
    const { processVideo } = await import('@/lib/jobs/process-video')

    // Pick a video the mock transcript provider will actually return text for.
    const videos = await prisma.video.findMany({ where: { channelId: channelDbId } })
    let processed: Awaited<ReturnType<typeof processVideo>> | null = null
    for (const video of videos) {
      const result = await processVideo(video.id)
      if (result.transcriptStatus === 'AVAILABLE') {
        processed = result
        break
      }
    }
    expect(processed, 'at least one mock video should have a transcript').not.toBeNull()

    const video = await prisma.video.findUniqueOrThrow({
      where: { id: processed!.videoId },
      include: { transcript: true, report: true },
    })

    // Transcript
    expect(video.transcript?.status).toBe('AVAILABLE')
    expect(video.transcript?.rawText?.length ?? 0).toBeGreaterThan(50)
    expect(Array.isArray(video.transcript?.segments)).toBe(true)
    expect(video.transcriptStatus).toBe('AVAILABLE')

    // Report
    expect(video.report?.analysisStatus).toBe('COMPLETED')
    expect(video.report?.overallScore).toBeGreaterThan(0)
    expect(video.report?.executiveSummary?.length ?? 0).toBeGreaterThan(20)
    expect(video.report?.transcriptUsed).toBe(true)
    expect(video.report?.confidence).toBe('high')
    expect(video.status).toBe('READY')
    expect(video.analysisStatus).toBe('COMPLETED')

    // The stored JSON must still satisfy the schema we read it back with.
    const { AnalysisSchema } = await import('@/lib/ai/schema')
    expect(AnalysisSchema.safeParse(video.report?.structuredData).success).toBe(true)

    // Notification (console provider in mock mode)
    const output = emailLines.join('\n')
    expect(output).toContain('EMAIL (development mode')
    expect(output).toContain('NEW REPORT')
    expect(output).toContain(video.title)
    // The full transcript must never be included in an email.
    expect(output).not.toContain(video.transcript!.rawText!.slice(0, 120))
  })

  it('4. is idempotent — re-processing does not overwrite a completed report', async () => {
    const ready = await prisma.video.findFirstOrThrow({
      where: { channelId: channelDbId, analysisStatus: 'COMPLETED' },
      include: { report: true },
    })
    const { processVideo } = await import('@/lib/jobs/process-video')

    const result = await processVideo(ready.id)
    expect(result.analysisStatus).toBe('COMPLETED')
    expect(result.emailed).toBe(false)

    const after = await prisma.analysisReport.findUniqueOrThrow({ where: { videoId: ready.id } })
    expect(after.generatedAt?.getTime()).toBe(ready.report?.generatedAt?.getTime())
  })

  it('5. produces a clearly-marked lower-confidence report when no transcript exists', async () => {
    const videos = await prisma.video.findMany({ where: { channelId: channelDbId }, include: { transcript: true } })
    const withoutTranscript = videos.find((v) => v.transcript?.status === 'UNAVAILABLE')

    // The mock provider withholds transcripts for roughly 1 in 5 videos. If this
    // batch happened to have none, force one so the assertion still means something.
    const target = withoutTranscript ?? videos[0]
    if (!withoutTranscript) {
      await prisma.transcript.upsert({
        where: { videoId: target.id },
        create: { videoId: target.id, status: 'UNAVAILABLE', errorMessage: 'forced for test' },
        update: { status: 'UNAVAILABLE', rawText: null, errorMessage: 'forced for test' },
      })
      await prisma.video.update({ where: { id: target.id }, data: { transcriptStatus: 'UNAVAILABLE' } })
    }

    const { processVideo } = await import('@/lib/jobs/process-video')
    await processVideo(target.id, { force: true })

    const report = await prisma.analysisReport.findUniqueOrThrow({ where: { videoId: target.id } })
    expect(report.analysisStatus).toBe('COMPLETED')
    expect(report.confidence).toBe('low')
    expect(report.transcriptUsed).toBe(false)
  })

  it('6. builds a weekly digest covering the analysed videos', async () => {
    const { generateWeeklyDigest } = await import('@/lib/jobs/weekly-digest')
    const result = await generateWeeklyDigest({ skipEmail: true })

    const digest = await prisma.weeklyDigest.findUniqueOrThrow({ where: { id: result.digestId } })
    expect(digest.summary?.length ?? 0).toBeGreaterThan(10)

    const data = digest.structuredData as unknown as { opportunities: unknown[]; byChannel: unknown[] }
    expect(Array.isArray(data.opportunities)).toBe(true)
    expect(Array.isArray(data.byChannel)).toBe(true)
  })

  it('7. cascades deletes: removing a channel removes its videos, transcripts and reports', async () => {
    const videoIds = (await prisma.video.findMany({ where: { channelId: channelDbId }, select: { id: true } })).map(
      (v) => v.id,
    )
    expect(videoIds.length).toBeGreaterThan(0)

    await prisma.channel.delete({ where: { id: channelDbId } })

    expect(await prisma.video.count({ where: { id: { in: videoIds } } })).toBe(0)
    expect(await prisma.transcript.count({ where: { videoId: { in: videoIds } } })).toBe(0)
    expect(await prisma.analysisReport.count({ where: { videoId: { in: videoIds } } })).toBe(0)
  })
})

describe('database availability', () => {
  it('reports whether the integration suite ran', () => {
    if (!databaseReachable) {
      console.warn(
        '\n⚠  Integration tests were SKIPPED — no database reachable.\n' +
          '   Start one and re-run, e.g.:\n' +
          '     docker compose -f docker-compose.dev.yml up -d\n' +
          '     TEST_DATABASE_URL="postgresql://ycim:ycim_password@localhost:5432/ycim" npm test\n',
      )
    }
    expect(true).toBe(true)
  })
})
