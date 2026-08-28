import { formatDate } from '../utils'

/**
 * Plain, inline-styled HTML. Email clients strip <style> blocks and have no
 * CSS support worth relying on, so everything is inline and table-free.
 */

const WRAPPER_START = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f6f7f9;padding:24px">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">`
const WRAPPER_END = `  </div>
  <p style="max-width:600px;margin:16px auto 0;color:#9ca3af;font-size:12px;text-align:center">
    Sent by your YouTube Content Intelligence Monitor.
  </p>
</div>`

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function scoreColor(score: number): string {
  if (score >= 7.5) return '#16a34a'
  if (score >= 5.5) return '#ca8a04'
  return '#dc2626'
}

export type NewReportEmailInput = {
  appName: string
  channelTitle: string
  videoTitle: string
  videoUrl: string
  publishedAt: Date
  transcriptStatus: string
  overallScore: number | null
  verdict: string | null
  executiveSummary: string
  topTakeaways: string[]
  reportUrl: string
  thumbnailUrl?: string | null
  lowConfidence: boolean
}

export function renderNewReportEmail(input: NewReportEmailInput): { subject: string; html: string; text: string } {
  const score = input.overallScore ?? 0
  const subject = `[${input.appName}] ${input.overallScore ? `${input.overallScore}/10 · ` : ''}${input.channelTitle}: ${input.videoTitle}`

  const takeaways = input.topTakeaways
    .slice(0, 3)
    .map((t) => `<li style="margin-bottom:8px;color:#374151;font-size:14px;line-height:1.55">${escapeHtml(t)}</li>`)
    .join('')

  const html = `${WRAPPER_START}
    <div style="padding:20px 24px;border-bottom:1px solid #e5e7eb">
      <p style="margin:0;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.06em">New report ready</p>
      <h1 style="margin:6px 0 0;font-size:18px;line-height:1.35;color:#111827">${escapeHtml(input.videoTitle)}</h1>
      <p style="margin:6px 0 0;color:#6b7280;font-size:13px">
        ${escapeHtml(input.channelTitle)} · published ${formatDate(input.publishedAt)}
      </p>
    </div>
    ${
      input.thumbnailUrl
        ? `<a href="${escapeHtml(input.videoUrl)}"><img src="${escapeHtml(input.thumbnailUrl)}" alt="" width="600" style="display:block;width:100%;max-width:600px;height:auto"></a>`
        : ''
    }
    <div style="padding:20px 24px">
      <div style="display:inline-block;padding:6px 12px;border-radius:999px;background:${scoreColor(score)};color:#fff;font-size:14px;font-weight:600">
        Overall ${input.overallScore ?? '—'}/10${input.verdict ? ` · ${escapeHtml(input.verdict)}` : ''}
      </div>
      <p style="margin:8px 0 0;color:#6b7280;font-size:12px">Transcript: ${escapeHtml(input.transcriptStatus)}</p>
      ${
        input.lowConfidence
          ? `<p style="margin:12px 0 0;padding:10px 12px;background:#fef3c7;border-radius:8px;color:#92400e;font-size:13px">
               Transcript unavailable — this is a lower-confidence, metadata-only analysis.
             </p>`
          : ''
      }
      <h2 style="margin:20px 0 8px;font-size:14px;color:#111827">Executive summary</h2>
      <p style="margin:0;color:#374151;font-size:14px;line-height:1.6">${escapeHtml(input.executiveSummary)}</p>
      ${takeaways ? `<h2 style="margin:20px 0 8px;font-size:14px;color:#111827">Top takeaways</h2><ul style="margin:0;padding-left:18px">${takeaways}</ul>` : ''}
      <p style="margin:24px 0 0">
        <a href="${escapeHtml(input.reportUrl)}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:500">View the full report</a>
        <a href="${escapeHtml(input.videoUrl)}" style="display:inline-block;margin-left:8px;color:#374151;text-decoration:none;padding:10px 4px;font-size:14px">Watch on YouTube</a>
      </p>
    </div>
${WRAPPER_END}`

  const text = [
    `NEW REPORT: ${input.videoTitle}`,
    `Channel:    ${input.channelTitle}`,
    `Published:  ${formatDate(input.publishedAt)}`,
    `Transcript: ${input.transcriptStatus}`,
    `Score:      ${input.overallScore ?? '—'}/10${input.verdict ? ` (${input.verdict})` : ''}`,
    input.lowConfidence ? 'NOTE: Transcript unavailable — lower-confidence, metadata-only analysis.' : '',
    '',
    'EXECUTIVE SUMMARY',
    input.executiveSummary,
    '',
    'TOP TAKEAWAYS',
    ...input.topTakeaways.slice(0, 3).map((t, i) => `  ${i + 1}. ${t}`),
    '',
    `Full report: ${input.reportUrl}`,
    `Video:       ${input.videoUrl}`,
  ]
    .filter((line) => line !== '')
    .join('\n')

  return { subject, html, text }
}

export type WeeklyDigestEmailInput = {
  appName: string
  weekStart: Date
  weekEnd: Date
  videoCount: number
  channelCount: number
  summary: string
  whatChanged: string
  byChannel: { channelTitle: string; videos: { title: string; score: number | null; url: string }[] }[]
  repeatedThemes: string[]
  opportunities: { title: string; why: string }[]
  digestUrl: string
}

export function renderWeeklyDigestEmail(input: WeeklyDigestEmailInput): {
  subject: string
  html: string
  text: string
} {
  const subject = `[${input.appName}] Weekly digest · ${input.videoCount} videos · ${formatDate(input.weekStart)}–${formatDate(input.weekEnd)}`

  const channelBlocks = input.byChannel
    .map(
      (c) => `<div style="margin-bottom:14px">
        <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#111827">${escapeHtml(c.channelTitle)}</p>
        <ul style="margin:0;padding-left:18px">
          ${c.videos
            .map(
              (v) =>
                `<li style="margin-bottom:4px;font-size:13px;color:#374151"><a href="${escapeHtml(v.url)}" style="color:#374151">${escapeHtml(v.title)}</a> — ${v.score ?? '—'}/10</li>`,
            )
            .join('')}
        </ul>
      </div>`,
    )
    .join('')

  const opportunityBlocks = input.opportunities
    .map(
      (o, i) => `<li style="margin-bottom:10px;font-size:14px;color:#374151;line-height:1.55">
        <strong style="color:#111827">${i + 1}. ${escapeHtml(o.title)}</strong><br>${escapeHtml(o.why)}
      </li>`,
    )
    .join('')

  const html = `${WRAPPER_START}
    <div style="padding:20px 24px;border-bottom:1px solid #e5e7eb">
      <p style="margin:0;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.06em">Weekly digest</p>
      <h1 style="margin:6px 0 0;font-size:18px;color:#111827">${formatDate(input.weekStart)} – ${formatDate(input.weekEnd)}</h1>
      <p style="margin:6px 0 0;color:#6b7280;font-size:13px">${input.videoCount} videos across ${input.channelCount} channels</p>
    </div>
    <div style="padding:20px 24px">
      <p style="margin:0;color:#374151;font-size:14px;line-height:1.6">${escapeHtml(input.summary)}</p>

      <h2 style="margin:22px 0 8px;font-size:14px;color:#111827">What changed this week</h2>
      <p style="margin:0;color:#374151;font-size:14px;line-height:1.6">${escapeHtml(input.whatChanged)}</p>

      ${input.repeatedThemes.length ? `<h2 style="margin:22px 0 8px;font-size:14px;color:#111827">Repeated themes</h2><p style="margin:0;color:#374151;font-size:14px">${escapeHtml(input.repeatedThemes.join(' · '))}</p>` : ''}

      <h2 style="margin:22px 0 8px;font-size:14px;color:#111827">By channel</h2>
      ${channelBlocks || '<p style="margin:0;color:#6b7280;font-size:13px">No videos this week.</p>'}

      ${opportunityBlocks ? `<h2 style="margin:22px 0 8px;font-size:14px;color:#111827">5 original content opportunities</h2><ol style="margin:0;padding-left:18px">${opportunityBlocks}</ol>` : ''}

      <p style="margin:24px 0 0">
        <a href="${escapeHtml(input.digestUrl)}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:500">Open the digest</a>
      </p>
    </div>
${WRAPPER_END}`

  const text = [
    `WEEKLY DIGEST ${formatDate(input.weekStart)} – ${formatDate(input.weekEnd)}`,
    `${input.videoCount} videos across ${input.channelCount} channels`,
    '',
    input.summary,
    '',
    'WHAT CHANGED THIS WEEK',
    input.whatChanged,
    '',
    'BY CHANNEL',
    ...input.byChannel.flatMap((c) => [`  ${c.channelTitle}`, ...c.videos.map((v) => `    - ${v.title} (${v.score ?? '—'}/10)`)]),
    '',
    'OPPORTUNITIES',
    ...input.opportunities.map((o, i) => `  ${i + 1}. ${o.title} — ${o.why}`),
    '',
    `Open: ${input.digestUrl}`,
  ].join('\n')

  return { subject, html, text }
}
