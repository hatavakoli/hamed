import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  ExternalLink,
  FileText,
  Lightbulb,
  Printer,
  RefreshCw,
  Rocket,
} from 'lucide-react'
import { ActionButton } from '@/components/action-button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { InfoHint } from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'
import { BuildVerdictBadge, StatusBadge, VerdictBadge } from '@/components/status-badge'
import { ScoreDial, Scorecard } from '@/components/score'
import { EmptyState } from '@/components/empty-state'
import { TranscriptViewer } from './transcript-viewer'
import { prisma } from '@/lib/prisma'
import { FORMAT_LABELS, type Analysis } from '@/lib/ai/schema'
import type { TranscriptSegment } from '@/lib/transcript/types'
import { formatDate, formatDateTime, formatDuration, formatNumber } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function VideoReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const video = await prisma.video.findUnique({
    where: { id },
    include: { channel: true, transcript: true, report: true, jobs: { orderBy: { createdAt: 'desc' }, take: 5 } },
  })
  if (!video) notFound()

  const report = video.report
  const analysis = report?.analysisStatus === 'COMPLETED' ? (report.structuredData as unknown as Analysis) : null
  const segments = (video.transcript?.segments as unknown as TranscriptSegment[] | null) ?? []

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href="/videos">
          <ArrowLeft /> All videos
        </Link>
      </Button>

      {/* ---------- Header ---------- */}
      <Card className="mb-6">
        <CardContent className="flex flex-col gap-5 p-5 lg:flex-row">
          <a href={video.url} target="_blank" rel="noreferrer noopener" className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={video.thumbnailUrl ?? 'https://placehold.co/640x360/e2e8f0/64748b/png?text=No+thumbnail'}
              alt=""
              className="aspect-video w-full rounded-lg border object-cover lg:w-72"
            />
          </a>

          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold leading-snug sm:text-xl">{video.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              <Link href={`/channels/${video.channel.id}`} className="hover:underline">
                {video.channel.title}
              </Link>
              {' · '}
              {formatDate(video.publishedAt)} · {formatDuration(video.durationSeconds)}
            </p>

            <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
              <span>{formatNumber(video.viewCount)} views</span>
              <span>{formatNumber(video.likeCount)} likes</span>
              <span>{formatNumber(video.commentCount)} comments</span>
              {video.categoryId && <span>Category {video.categoryId}</span>}
            </dl>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <StatusBadge kind="video" status={video.status} />
              <StatusBadge kind="transcript" status={video.transcriptStatus} />
              <StatusBadge kind="analysis" status={video.analysisStatus} />
              <VerdictBadge verdict={report?.verdict ?? null} />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild size="sm" variant="secondary">
                <a href={video.url} target="_blank" rel="noreferrer noopener">
                  <ExternalLink /> Watch on YouTube
                </a>
              </Button>
              <ActionButton
                endpoint={`/api/videos/${video.id}/retry-transcript`}
                successTitle="Transcript retry finished"
                size="sm"
                variant="outline"
              >
                <RefreshCw /> Retry transcript
              </ActionButton>
              <ActionButton
                endpoint={`/api/videos/${video.id}/regenerate-analysis`}
                successTitle="Re-analysis queued"
                size="sm"
                variant="outline"
                confirm="Regenerate this report? It will run a fresh AI analysis and overwrite the current one."
              >
                <RefreshCw /> Regenerate analysis
              </ActionButton>
              {analysis && (
                <>
                  <Button asChild size="sm" variant="ghost">
                    <a href={`/api/videos/${video.id}/export?format=md`}>
                      <Download /> Markdown
                    </a>
                  </Button>
                  <Button asChild size="sm" variant="ghost">
                    <a href={`/api/videos/${video.id}/export?format=html&print=1`} target="_blank" rel="noreferrer noopener">
                      <Printer /> Print / PDF
                    </a>
                  </Button>
                </>
              )}
            </div>
          </div>

          {report?.analysisStatus === 'COMPLETED' && (
            <div className="flex shrink-0 flex-col items-center gap-2 lg:pl-4">
              <ScoreDial score={report.overallScore} size="lg" />
              <p className="text-center text-xs text-muted-foreground">Overall score</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---------- Status banners ---------- */}
      {report?.confidence === 'low' && (
        <Alert variant="warning" className="mb-5">
          <AlertTriangle />
          <AlertTitle>Transcript unavailable — lower-confidence analysis</AlertTitle>
          <AlertDescription>
            This report was produced from the title, description, tags and thumbnail only. Statements about the hook,
            pacing and structure are inference, not observation. Press “Retry transcript” to try again; if it succeeds,
            a fresh, higher-confidence analysis is queued automatically.
          </AlertDescription>
        </Alert>
      )}

      {video.transcript?.errorMessage && video.transcriptStatus !== 'AVAILABLE' && (
        <Alert className="mb-5">
          <FileText />
          <AlertTitle>Transcript status: {video.transcriptStatus}</AlertTitle>
          <AlertDescription>
            {video.transcript.errorMessage}
            {video.transcript.nextRetryAt && (
              <> Next automatic retry: {formatDateTime(video.transcript.nextRetryAt)} (attempt {video.transcript.retryCount + 1} of 3).</>
            )}
          </AlertDescription>
        </Alert>
      )}

      {report?.analysisStatus === 'FAILED' && (
        <Alert variant="destructive" className="mb-5">
          <AlertTriangle />
          <AlertTitle>Analysis failed</AlertTitle>
          <AlertDescription>{report.errorMessage ?? 'Unknown error.'} Press “Regenerate analysis” to try again.</AlertDescription>
        </Alert>
      )}

      {!analysis ? (
        <EmptyState
          icon={FileText}
          title="No report yet"
          description={
            video.analysisStatus === 'PENDING'
              ? 'This video is queued. The worker picks up queued jobs every minute — or press “Run queued jobs” on the dashboard.'
              : 'Press “Regenerate analysis” to produce a report for this video.'
          }
        />
      ) : (
        <ReportBody
          analysis={analysis}
          report={report!}
          video={video}
          segments={segments}
          transcriptText={video.transcript?.rawText ?? ''}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------

type ReportRow = NonNullable<Awaited<ReturnType<typeof prisma.analysisReport.findFirst>>>
type VideoRow = { id: string; youtubeVideoId: string; transcriptStatus: string }

function ReportBody({
  analysis,
  report,
  video,
  segments,
  transcriptText,
}: {
  analysis: Analysis
  report: ReportRow
  video: VideoRow
  segments: TranscriptSegment[]
  transcriptText: string
}) {
  const a = analysis

  return (
    <Tabs defaultValue="summary">
      <TabsList>
        <TabsTrigger value="summary">Summary</TabsTrigger>
        <TabsTrigger value="strategy">Strategy</TabsTrigger>
        <TabsTrigger value="structure">Structure & script</TabsTrigger>
        <TabsTrigger value="product">Product idea</TabsTrigger>
        <TabsTrigger value="ideas">Your ideas</TabsTrigger>
        <TabsTrigger value="transcript">Transcript</TabsTrigger>
      </TabsList>

      {/* ---------------- Summary ---------------- */}
      <TabsContent value="summary" className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Executive summary</CardTitle>
              <CardDescription>
                Verdict: <VerdictBadge verdict={a.executiveSummary.verdict} />
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm leading-relaxed">{a.executiveSummary.summary}</p>
              <div className="rounded-lg border-l-4 border-primary bg-muted px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Most important takeaway</p>
                <p className="mt-1 text-sm">{a.executiveSummary.mostImportantTakeaway}</p>
              </div>
              <Section title="Top takeaways" items={a.executiveSummary.topTakeaways} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1 text-base">
                Scorecard
                <InfoHint>
                  Each metric is the model’s judgement on a 1–10 scale. These are informed opinions, not measured
                  analytics — the app has no access to YouTube retention data.
                </InfoHint>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Scorecard scores={a.scorecard as unknown as Record<string, number>} />
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Topic & audience</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <KeyValue label="Core topic" value={a.coreTopic} />
              <KeyValue label="Premise" value={a.premise} />
              <KeyValue label="Main promise" value={a.mainPromise} />
              <KeyValue
                label="Format"
                value={`${FORMAT_LABELS[a.format.primary] ?? a.format.primary}${a.format.secondary ? ` + ${a.format.secondary}` : ''}`}
              />
              <Separator />
              <KeyValue label="Audience" value={a.targetAudience.description} />
              <Section title="Pain points" items={a.targetAudience.painPoints} compact />
              <Section title="Desires" items={a.targetAudience.desires} compact />
              <Section title="Fears" items={a.targetAudience.fears} compact />
              <Section title="Motivations" items={a.targetAudience.motivations} compact />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Packaging</CardTitle>
              <CardDescription>Title, thumbnail and how well they match the delivery.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <KeyValue label="Title analysis" value={a.packaging.titleAnalysis} />
              <KeyValue label="Title formula" value={a.packaging.titleFormula} />
              <KeyValue label="Curiosity gap" value={a.packaging.curiosityGap} />
              <KeyValue label="Clarity" value={a.packaging.clarity} />
              <KeyValue label="Thumbnail" value={a.packaging.thumbnailAnalysis ?? 'Not analysed for this video.'} />
              <KeyValue label="Alignment" value={a.packaging.alignmentNotes} />
              {a.packaging.keywordTargeting.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {a.packaging.keywordTargeting.map((kw) => (
                    <Badge key={kw} variant="secondary">
                      {kw}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Analysis provenance</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              <Meta label="Model" value={`${report.modelProvider} / ${report.modelName}`} />
              <Meta label="Prompt version" value={report.promptVersion} />
              <Meta label="Generated" value={formatDateTime(report.generatedAt)} />
              <Meta label="Transcript used" value={report.transcriptUsed ? 'Yes' : 'No'} />
              <Meta label="Tokens" value={`${report.tokensInput ?? 0} in / ${report.tokensOutput ?? 0} out`} />
              <Meta label="Estimated cost" value={`$${(report.estimatedCost ?? 0).toFixed(5)}`} />
            </dl>
            {a.analysisConfidence.limitations.length > 0 && (
              <div className="mt-4">
                <Section title="Stated limitations" items={a.analysisConfidence.limitations} compact />
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* ---------------- Strategy ---------------- */}
      <TabsContent value="strategy" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Why this topic could perform</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="leading-relaxed">{a.contentStrategy.whyItCouldPerform}</p>
            <KeyValue label="Audience demand served" value={a.contentStrategy.audienceDemandServed} />
            <KeyValue label="Differentiation" value={a.contentStrategy.differentiation} />
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Strengths & weaknesses</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Section title="What makes the idea strong" items={a.contentStrategy.ideaStrengths} />
              <Section title="What makes it weak" items={a.contentStrategy.ideaWeaknesses} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Gaps & missed opportunities</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Section title="Missed opportunities" items={a.contentStrategy.missedOpportunities} />
              <Section title="Content gap observations" items={a.contentStrategy.contentGapObservations} />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1 text-base">
              Ethical inspiration
              <InfoHint>
                Reusable strategy you may adopt, kept separate from the creative expression that belongs to this creator.
              </InfoHint>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Section title="Strategies to learn from" items={a.ethicalInspiration.strategiesToLearnFrom} />
            <Section title="What not to copy" items={a.ethicalInspiration.whatNotToCopy} />
          </CardContent>
        </Card>
      </TabsContent>

      {/* ---------------- Structure & script ---------------- */}
      <TabsContent value="structure" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Opening hook</CardTitle>
            <CardDescription>First 15–30 seconds · strength {a.hook.strengthScore}/10</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <KeyValue label="What happens" value={a.hook.summary} />
            <KeyValue label="Hook type" value={a.hook.type} />
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg bg-emerald-500/10 p-3">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                  Why it may work
                </p>
                <p>{a.hook.whyItMayWork}</p>
              </div>
              <div className="rounded-lg bg-amber-500/10 p-3">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
                  Why it may not work
                </p>
                <p>{a.hook.whyItMayNotWork}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Timestamped outline</CardTitle>
          </CardHeader>
          <CardContent>
            {a.structure.sections.length === 0 ? (
              <p className="text-sm text-muted-foreground">No section breakdown was produced for this video.</p>
            ) : (
              <ol className="space-y-3">
                {a.structure.sections.map((section, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-0.5 shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                      {section.timestamp ?? `${i + 1}`}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{section.title}</p>
                      <p className="text-sm text-muted-foreground">{section.summary}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            <Separator className="my-4" />
            <div className="grid gap-4 md:grid-cols-2">
              <KeyValue label="Narrative arc" value={a.structure.narrativeArc} />
              <KeyValue label="Pacing" value={a.structure.pacingObservations} />
              <Section title="Open loops" items={a.structure.openLoops} />
              <Section title="Pattern interrupts" items={a.structure.patternInterrupts} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1 text-base">
              Key claims
              <InfoHint>
                “Verified” means the claim appears in the transcript or metadata. “Inferred” is the model’s reading of the
                material.
              </InfoHint>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {a.script.keyClaims.length === 0 ? (
              <p className="text-sm text-muted-foreground">No key claims were extracted.</p>
            ) : (
              a.script.keyClaims.map((claim, i) => (
                <div key={i} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium">{claim.claim}</p>
                    <Badge variant={claim.basis === 'verified' ? 'success' : 'muted'}>{claim.basis}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{claim.support}</p>
                </div>
              ))
            )}
            <Separator />
            <div className="grid gap-4 md:grid-cols-2">
              <Section title="Emotional triggers" items={a.script.emotionalTriggers} />
              <Section title="Repeated themes" items={a.script.repeatedThemes} />
              <KeyValue label="Clarity & specificity" value={a.script.clarityAndSpecificity} />
              <Section title="Weak or vague sections" items={a.script.weakOrVagueSections} />
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* ---------------- Product validation ---------------- */}
      <TabsContent value="product" className="space-y-4">
        <ProductValidation validation={a.productValidation} />
      </TabsContent>

      {/* ---------------- Recommendations ---------------- */}
      <TabsContent value="ideas" className="space-y-4">
        <Alert variant="info">
          <Lightbulb />
          <AlertTitle>These are original ideas for your own channel</AlertTitle>
          <AlertDescription>
            They target the same underlying viewer demand — they are not rewrites of this creator’s title or script.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Video ideas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {a.recommendations.originalVideoIdeas.map((idea, i) => (
              <div key={i} className="rounded-lg border p-4">
                <p className="font-medium">{idea.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{idea.angle}</p>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  <span className="font-medium">Why it could work: </span>
                  {idea.whyItCouldWork}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Alternative titles</CardTitle>
            </CardHeader>
            <CardContent>
              <Section items={a.recommendations.alternativeTitles} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Hook ideas</CardTitle>
            </CardHeader>
            <CardContent>
              <Section items={a.recommendations.hookIdeas} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Improvements</CardTitle>
            </CardHeader>
            <CardContent>
              <Section items={a.recommendations.improvementSuggestions} />
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      {/* ---------------- Transcript ---------------- */}
      <TabsContent value="transcript">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Transcript</CardTitle>
            <CardDescription>
              Status: {video.transcriptStatus}
              {transcriptText ? ` · ${transcriptText.length.toLocaleString()} characters` : ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {transcriptText ? (
              <TranscriptViewer segments={segments} rawText={transcriptText} youtubeVideoId={video.youtubeVideoId} />
            ) : (
              <EmptyState
                icon={FileText}
                title="No transcript stored"
                description="Use the “Retry transcript” button above. If the video genuinely has no captions, the report stays metadata-only."
              />
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}

function ProductValidation({ validation }: { validation: Analysis['productValidation'] }) {
  const v = validation

  if (!v.productDiscussed && v.buildVerdict === 'not_applicable') {
    return (
      <EmptyState
        icon={Rocket}
        title="No product or business idea in this video"
        description="The product-validation section only fills in when the video discusses a product, tool, app, service or business idea."
      />
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">Can we build this?</CardTitle>
            <BuildVerdictBadge verdict={v.buildVerdict} />
            <Badge variant="secondary">Confidence {v.confidenceScore}/10</Badge>
          </div>
          <CardDescription>{v.productIdea ?? 'No specific product named.'}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="leading-relaxed">{v.rationale}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Pill label="Feasibility" value={v.feasibility} tone={v.feasibility} />
            <Pill label="Build complexity" value={v.buildComplexity} tone={v.buildComplexity === 'low' ? 'high' : v.buildComplexity === 'high' ? 'low' : 'medium'} />
            <Pill label="Effort" value={v.estimatedBuildEffort} />
            <Pill label="Problem" value={v.problemSolved} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">MVP scope</CardTitle>
            <CardDescription>The smallest version worth shipping.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Section items={v.mvpScope} />
            <Separator />
            <Section title="Suggested stack" items={v.suggestedStack} compact />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Features that would make it better</CardTitle>
            <CardDescription>Beyond what the video describes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {v.improvementFeatures.length === 0 ? (
              <p className="text-sm text-muted-foreground">None suggested.</p>
            ) : (
              v.improvementFeatures.map((feature, i) => (
                <div key={i} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{feature.feature}</p>
                    <Badge variant={feature.effort === 'low' ? 'success' : feature.effort === 'high' ? 'destructive' : 'warning'}>
                      {feature.effort} effort
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{feature.whyItMatters}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Demand signals</CardTitle>
          </CardHeader>
          <CardContent>
            <Section items={v.marketDemandSignals} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Risks</CardTitle>
          </CardHeader>
          <CardContent>
            <Section items={v.risks} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Existing alternatives</CardTitle>
          </CardHeader>
          <CardContent>
            <Section items={v.existingAlternatives} />
          </CardContent>
        </Card>
      </div>
    </>
  )
}

// --- small presentational helpers -------------------------------------------

function Section({ title, items, compact }: { title?: string; items: string[]; compact?: boolean }) {
  return (
    <div>
      {title && <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>}
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">None identified.</p>
      ) : (
        <ul className={compact ? 'space-y-0.5' : 'space-y-1.5'}>
          {items.map((item, i) => (
            <li key={i} className="flex gap-2 text-sm">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground" />
              <span className={compact ? 'text-muted-foreground' : ''}>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 leading-relaxed">{value || '—'}</p>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  )
}

function Pill({ label, value, tone }: { label: string; value: string; tone?: string }) {
  const variant = tone === 'high' ? 'success' : tone === 'low' ? 'destructive' : tone === 'medium' ? 'warning' : 'secondary'
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      {tone ? (
        <Badge variant={variant} className="mt-1">
          {value}
        </Badge>
      ) : (
        <p className="mt-0.5 text-sm">{value}</p>
      )}
    </div>
  )
}
