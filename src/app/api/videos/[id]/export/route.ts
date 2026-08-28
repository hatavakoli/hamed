import { prisma } from '@/lib/prisma'
import { HttpError, handleError } from '@/lib/api'
import { requireAdmin } from '@/lib/auth'
import { getPreferences } from '@/lib/settings'
import { markdownToPrintableHtml, renderReportMarkdown } from '@/lib/export'
import type { Analysis } from '@/lib/ai/schema'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/**
 * GET /api/videos/[id]/export?format=md|html
 * `html` is print-ready: open it and use the browser's "Save as PDF".
 */
export async function GET(req: Request, { params }: Params) {
  try {
    await requireAdmin()
    const { id } = await params
    const format = new URL(req.url).searchParams.get('format') === 'html' ? 'html' : 'md'

    const video = await prisma.video.findUnique({ where: { id }, include: { channel: true, report: true } })
    if (!video) throw new HttpError(404, 'Video not found')
    if (!video.report || video.report.analysisStatus !== 'COMPLETED') {
      throw new HttpError(409, 'This video does not have a completed report yet.')
    }

    const prefs = await getPreferences()
    const markdown = renderReportMarkdown({
      appName: prefs.appName,
      video: {
        title: video.title,
        url: video.url,
        publishedAt: video.publishedAt,
        durationSeconds: video.durationSeconds,
        viewCount: video.viewCount,
      },
      channelTitle: video.channel.title,
      transcriptStatus: video.transcriptStatus,
      report: {
        overallScore: video.report.overallScore,
        modelProvider: video.report.modelProvider,
        modelName: video.report.modelName,
        promptVersion: video.report.promptVersion,
        generatedAt: video.report.generatedAt,
        confidence: video.report.confidence,
      },
      analysis: video.report.structuredData as unknown as Analysis,
    })

    const safeName = video.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 60).toLowerCase() || 'report'

    if (format === 'html') {
      return new Response(markdownToPrintableHtml(markdown, video.title), {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    }
    return new Response(markdown, {
      headers: {
        'content-type': 'text/markdown; charset=utf-8',
        'content-disposition': `attachment; filename="${safeName}.md"`,
      },
    })
  } catch (err) {
    return handleError(err)
  }
}
