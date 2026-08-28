import type { Analysis } from './ai/schema'
import { FORMAT_LABELS, SCORE_LABELS } from './ai/schema'
import { formatDate, formatDuration } from './utils'

/**
 * Renders a saved report as Markdown. The same text is used for the
 * "PDF-ready HTML" export (wrapped in a print stylesheet) so there is only
 * one place to change the report layout.
 */

export type ExportInput = {
  appName: string
  video: {
    title: string
    url: string
    publishedAt: Date
    durationSeconds: number | null
    viewCount: bigint | number | null
  }
  channelTitle: string
  transcriptStatus: string
  report: {
    overallScore: number | null
    modelProvider: string
    modelName: string
    promptVersion: string
    generatedAt: Date | null
    confidence: string | null
  }
  analysis: Analysis
}

function list(items: string[] | undefined, empty = '_None identified._'): string {
  if (!items?.length) return empty
  return items.map((i) => `- ${i}`).join('\n')
}

export function renderReportMarkdown(input: ExportInput): string {
  const a = input.analysis
  const lines: string[] = []

  lines.push(`# ${input.video.title}`)
  lines.push('')
  lines.push(`**Channel:** ${input.channelTitle}  `)
  lines.push(`**Published:** ${formatDate(input.video.publishedAt)}  `)
  lines.push(`**Duration:** ${formatDuration(input.video.durationSeconds)}  `)
  lines.push(`**Views:** ${input.video.viewCount != null ? Number(input.video.viewCount).toLocaleString() : '—'}  `)
  lines.push(`**URL:** ${input.video.url}  `)
  lines.push(`**Transcript:** ${input.transcriptStatus}  `)
  lines.push(
    `**Analysed:** ${formatDate(input.report.generatedAt)} by ${input.report.modelProvider}/${input.report.modelName} (prompt ${input.report.promptVersion})`,
  )
  lines.push('')

  if (input.report.confidence === 'low') {
    lines.push('> ⚠️ **Transcript unavailable — lower-confidence, metadata-only analysis.**')
    lines.push('')
  }

  lines.push('---')
  lines.push('')
  lines.push('## Executive summary')
  lines.push('')
  lines.push(`**Verdict:** ${a.executiveSummary.verdict.toUpperCase()} · **Overall score:** ${input.report.overallScore ?? '—'}/10`)
  lines.push('')
  lines.push(a.executiveSummary.summary)
  lines.push('')
  lines.push(`**Most important takeaway:** ${a.executiveSummary.mostImportantTakeaway}`)
  lines.push('')
  lines.push('### Top takeaways')
  lines.push(list(a.executiveSummary.topTakeaways))
  lines.push('')

  lines.push('## Scorecard')
  lines.push('')
  lines.push('| Metric | Score |')
  lines.push('| --- | --- |')
  for (const [key, label] of Object.entries(SCORE_LABELS)) {
    lines.push(`| ${label} | ${a.scorecard[key as keyof typeof a.scorecard] ?? '—'}/10 |`)
  }
  lines.push('')

  lines.push('## Core topic and audience')
  lines.push('')
  lines.push(`**Topic:** ${a.coreTopic}`)
  lines.push('')
  lines.push(`**Premise:** ${a.premise}`)
  lines.push('')
  lines.push(`**Main promise:** ${a.mainPromise}`)
  lines.push('')
  lines.push(`**Audience:** ${a.targetAudience.description} _(experience level: ${a.targetAudience.experienceLevel})_`)
  lines.push('')
  lines.push('**Pain points**')
  lines.push(list(a.targetAudience.painPoints))
  lines.push('')
  lines.push('**Desires**')
  lines.push(list(a.targetAudience.desires))
  lines.push('')
  lines.push('**Fears**')
  lines.push(list(a.targetAudience.fears))
  lines.push('')
  lines.push('**Motivations**')
  lines.push(list(a.targetAudience.motivations))
  lines.push('')

  lines.push('## Format and hook')
  lines.push('')
  lines.push(`**Format:** ${FORMAT_LABELS[a.format.primary] ?? a.format.primary}${a.format.secondary ? ` (secondary: ${a.format.secondary})` : ''}`)
  lines.push('')
  lines.push(a.format.rationale)
  lines.push('')
  lines.push(`**Hook (${a.hook.type}) — strength ${a.hook.strengthScore}/10**`)
  lines.push('')
  lines.push(a.hook.summary)
  lines.push('')
  lines.push(`- Why it may work: ${a.hook.whyItMayWork}`)
  lines.push(`- Why it may not work: ${a.hook.whyItMayNotWork}`)
  lines.push('')

  lines.push('## Structure')
  lines.push('')
  if (a.structure.sections.length) {
    for (const section of a.structure.sections) {
      lines.push(`- **${section.timestamp ? `[${section.timestamp}] ` : ''}${section.title}** — ${section.summary}`)
    }
  } else {
    lines.push('_No section breakdown available._')
  }
  lines.push('')
  lines.push(`**Narrative arc:** ${a.structure.narrativeArc}`)
  lines.push('')
  lines.push(`**Pacing:** ${a.structure.pacingObservations}`)
  lines.push('')
  lines.push('**Open loops**')
  lines.push(list(a.structure.openLoops))
  lines.push('')
  lines.push('**Pattern interrupts**')
  lines.push(list(a.structure.patternInterrupts))
  lines.push('')

  lines.push('## Script and communication')
  lines.push('')
  if (a.script.keyClaims.length) {
    lines.push('| Claim | Basis | Support |')
    lines.push('| --- | --- | --- |')
    for (const claim of a.script.keyClaims) {
      lines.push(`| ${claim.claim} | ${claim.basis} | ${claim.support} |`)
    }
  } else {
    lines.push('_No key claims extracted._')
  }
  lines.push('')
  lines.push('**Emotional triggers**')
  lines.push(list(a.script.emotionalTriggers))
  lines.push('')
  lines.push('**Repeated themes**')
  lines.push(list(a.script.repeatedThemes))
  lines.push('')
  lines.push(`**Clarity and specificity:** ${a.script.clarityAndSpecificity}`)
  lines.push('')
  lines.push('**Weak or vague sections**')
  lines.push(list(a.script.weakOrVagueSections))
  lines.push('')

  lines.push('## Packaging')
  lines.push('')
  lines.push(`**Title analysis:** ${a.packaging.titleAnalysis}`)
  lines.push('')
  lines.push(`**Title formula:** ${a.packaging.titleFormula}`)
  lines.push('')
  lines.push(`**Curiosity gap:** ${a.packaging.curiosityGap}`)
  lines.push('')
  lines.push(`**Clarity:** ${a.packaging.clarity}`)
  lines.push('')
  lines.push(`**Keyword targeting:** ${a.packaging.keywordTargeting.join(', ') || '—'}`)
  lines.push('')
  lines.push(`**Thumbnail:** ${a.packaging.thumbnailAnalysis ?? '_Not analysed._'}`)
  lines.push('')
  lines.push(`**Alignment:** ${a.packaging.alignmentNotes}`)
  lines.push('')

  lines.push('## Content strategy')
  lines.push('')
  lines.push(`**Why it could perform:** ${a.contentStrategy.whyItCouldPerform}`)
  lines.push('')
  lines.push(`**Audience demand served:** ${a.contentStrategy.audienceDemandServed}`)
  lines.push('')
  lines.push(`**Differentiation:** ${a.contentStrategy.differentiation}`)
  lines.push('')
  lines.push('**Strengths**')
  lines.push(list(a.contentStrategy.ideaStrengths))
  lines.push('')
  lines.push('**Weaknesses**')
  lines.push(list(a.contentStrategy.ideaWeaknesses))
  lines.push('')
  lines.push('**Missed opportunities**')
  lines.push(list(a.contentStrategy.missedOpportunities))
  lines.push('')
  lines.push('**Content gaps**')
  lines.push(list(a.contentStrategy.contentGapObservations))
  lines.push('')

  const pv = a.productValidation
  lines.push('## Product / idea validation')
  lines.push('')
  if (!pv.productDiscussed && pv.buildVerdict === 'not_applicable') {
    lines.push('_This video does not discuss a product or business idea._')
  } else {
    lines.push(`**Idea:** ${pv.productIdea ?? '—'}`)
    lines.push('')
    lines.push(`**Problem solved:** ${pv.problemSolved}`)
    lines.push('')
    lines.push(
      `**Verdict:** ${pv.buildVerdict.toUpperCase()} · feasibility ${pv.feasibility} · complexity ${pv.buildComplexity} · confidence ${pv.confidenceScore}/10`,
    )
    lines.push('')
    lines.push(pv.rationale)
    lines.push('')
    lines.push(`**Estimated build effort:** ${pv.estimatedBuildEffort}`)
    lines.push('')
    lines.push('**Market demand signals**')
    lines.push(list(pv.marketDemandSignals))
    lines.push('')
    lines.push('**MVP scope**')
    lines.push(list(pv.mvpScope))
    lines.push('')
    lines.push('**Features that would make it better**')
    if (pv.improvementFeatures.length) {
      for (const f of pv.improvementFeatures) lines.push(`- **${f.feature}** (${f.effort} effort) — ${f.whyItMatters}`)
    } else {
      lines.push('_None suggested._')
    }
    lines.push('')
    lines.push('**Suggested stack**')
    lines.push(list(pv.suggestedStack))
    lines.push('')
    lines.push('**Risks**')
    lines.push(list(pv.risks))
    lines.push('')
    lines.push('**Existing alternatives**')
    lines.push(list(pv.existingAlternatives))
  }
  lines.push('')

  lines.push('## Ethical inspiration')
  lines.push('')
  lines.push('**Strategies to learn from**')
  lines.push(list(a.ethicalInspiration.strategiesToLearnFrom))
  lines.push('')
  lines.push('**What not to copy**')
  lines.push(list(a.ethicalInspiration.whatNotToCopy))
  lines.push('')

  lines.push('## Recommendations (original ideas for your channel)')
  lines.push('')
  lines.push('### Video ideas')
  if (a.recommendations.originalVideoIdeas.length) {
    for (const idea of a.recommendations.originalVideoIdeas) {
      lines.push(`- **${idea.title}** — ${idea.angle} _(${idea.whyItCouldWork})_`)
    }
  } else {
    lines.push('_None suggested._')
  }
  lines.push('')
  lines.push('### Alternative titles')
  lines.push(list(a.recommendations.alternativeTitles))
  lines.push('')
  lines.push('### Hook ideas')
  lines.push(list(a.recommendations.hookIdeas))
  lines.push('')
  lines.push('### Improvement suggestions')
  lines.push(list(a.recommendations.improvementSuggestions))
  lines.push('')

  lines.push('## Analysis confidence')
  lines.push('')
  lines.push(`Transcript used: **${a.analysisConfidence.transcriptUsed ? 'yes' : 'no'}** · Level: **${a.analysisConfidence.level}**`)
  lines.push('')
  lines.push(list(a.analysisConfidence.limitations, '_No limitations noted._'))
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push(`_Generated by ${input.appName}. Inferences are marked as such; no analytics data was used._`)

  return lines.join('\n')
}

/** Minimal Markdown -> HTML for the print/PDF export. Handles what we emit above. */
export function markdownToPrintableHtml(markdown: string, title: string): string {
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const inline = (s: string) =>
    escape(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/_(.+?)_/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')

  const out: string[] = []
  const lines = markdown.split('\n')
  let inList = false
  let tableBuffer: string[] = []

  const flushList = () => {
    if (inList) {
      out.push('</ul>')
      inList = false
    }
  }
  const flushTable = () => {
    if (!tableBuffer.length) return
    const rows = tableBuffer.filter((r) => !/^\|\s*-{2,}/.test(r))
    out.push('<table>')
    rows.forEach((row, i) => {
      const cells = row.split('|').slice(1, -1).map((c) => c.trim())
      const tag = i === 0 ? 'th' : 'td'
      out.push(`<tr>${cells.map((c) => `<${tag}>${inline(c)}</${tag}>`).join('')}</tr>`)
    })
    out.push('</table>')
    tableBuffer = []
  }

  for (const line of lines) {
    if (line.startsWith('|')) {
      flushList()
      tableBuffer.push(line)
      continue
    }
    flushTable()

    if (line.startsWith('### ')) {
      flushList()
      out.push(`<h3>${inline(line.slice(4))}</h3>`)
    } else if (line.startsWith('## ')) {
      flushList()
      out.push(`<h2>${inline(line.slice(3))}</h2>`)
    } else if (line.startsWith('# ')) {
      flushList()
      out.push(`<h1>${inline(line.slice(2))}</h1>`)
    } else if (line.startsWith('> ')) {
      flushList()
      out.push(`<blockquote>${inline(line.slice(2))}</blockquote>`)
    } else if (line.startsWith('- ')) {
      if (!inList) {
        out.push('<ul>')
        inList = true
      }
      out.push(`<li>${inline(line.slice(2))}</li>`)
    } else if (line.trim() === '---') {
      flushList()
      out.push('<hr>')
    } else if (line.trim() === '') {
      flushList()
    } else {
      flushList()
      out.push(`<p>${inline(line.replace(/\s\s$/, ''))}</p>`)
    }
  }
  flushList()
  flushTable()

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<style>
  :root { color-scheme: light; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
         max-width: 820px; margin: 0 auto; padding: 40px 24px; color: #111827; line-height: 1.6; background: #fff; }
  h1 { font-size: 28px; margin: 0 0 8px; line-height: 1.25; }
  h2 { font-size: 20px; margin: 32px 0 8px; padding-bottom: 6px; border-bottom: 1px solid #e5e7eb; }
  h3 { font-size: 16px; margin: 20px 0 6px; }
  p { margin: 0 0 10px; }
  ul { margin: 0 0 12px; padding-left: 20px; }
  li { margin-bottom: 4px; }
  table { border-collapse: collapse; width: 100%; margin: 0 0 16px; font-size: 14px; }
  th, td { border: 1px solid #e5e7eb; padding: 7px 10px; text-align: left; vertical-align: top; }
  th { background: #f9fafb; font-weight: 600; }
  blockquote { margin: 0 0 14px; padding: 10px 14px; background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 4px; }
  hr { border: 0; border-top: 1px solid #e5e7eb; margin: 24px 0; }
  code { background: #f3f4f6; padding: 1px 5px; border-radius: 4px; font-size: 13px; }
  a { color: #2563eb; }
  @media print { body { padding: 0; max-width: none; } h2 { page-break-after: avoid; } table, ul { page-break-inside: avoid; } }
</style>
</head>
<body>
${out.join('\n')}
<script>
  // Opens the browser's print dialog when the page is loaded with ?print=1,
  // which is the simplest reliable "save as PDF" that needs no extra library.
  if (new URLSearchParams(location.search).get('print') === '1') window.addEventListener('load', () => window.print());
</script>
</body>
</html>`
}
