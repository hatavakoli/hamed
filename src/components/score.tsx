import { SCORE_LABELS } from '@/lib/ai/schema'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

export function scoreTone(score: number | null | undefined): 'good' | 'ok' | 'bad' | 'none' {
  if (score == null) return 'none'
  if (score >= 7.5) return 'good'
  if (score >= 5.5) return 'ok'
  return 'bad'
}

const TONE_TEXT = {
  good: 'text-emerald-600 dark:text-emerald-400',
  ok: 'text-amber-600 dark:text-amber-400',
  bad: 'text-red-600 dark:text-red-400',
  none: 'text-muted-foreground',
}

const TONE_BAR = {
  good: 'bg-emerald-500',
  ok: 'bg-amber-500',
  bad: 'bg-red-500',
  none: 'bg-muted-foreground',
}

/** Large circular-ish score used in report headers. */
export function ScoreDial({ score, size = 'md' }: { score: number | null; size?: 'sm' | 'md' | 'lg' }) {
  const tone = scoreTone(score)
  const dims = size === 'lg' ? 'size-20 text-2xl' : size === 'sm' ? 'size-11 text-sm' : 'size-16 text-xl'
  return (
    <div
      className={cn(
        'flex shrink-0 flex-col items-center justify-center rounded-full border-4 font-semibold tabular-nums',
        dims,
        tone === 'good' && 'border-emerald-500/40',
        tone === 'ok' && 'border-amber-500/40',
        tone === 'bad' && 'border-red-500/40',
        tone === 'none' && 'border-muted',
        TONE_TEXT[tone],
      )}
      title={score != null ? `Overall score ${score} out of 10` : 'Not scored yet'}
    >
      {score ?? '—'}
      <span className="text-[9px] font-normal uppercase tracking-wide text-muted-foreground">/ 10</span>
    </div>
  )
}

export function ScoreChip({ score, className }: { score: number | null; className?: string }) {
  const tone = scoreTone(score)
  return (
    <span className={cn('inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums', TONE_TEXT[tone], className)}>
      {score ?? '—'}<span className="ml-0.5 font-normal text-muted-foreground">/10</span>
    </span>
  )
}

export function ScoreRow({ label, score }: { label: string; score: number | null | undefined }) {
  const tone = scoreTone(score)
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
      <span className="truncate text-sm text-muted-foreground">{label}</span>
      <span className={cn('text-sm font-semibold tabular-nums', TONE_TEXT[tone])}>{score ?? '—'}</span>
      <div className="col-span-2">
        <Progress value={score != null ? score * 10 : 0} barClassName={TONE_BAR[tone]} className="h-1.5" />
      </div>
    </div>
  )
}

/** The whole 9-metric scorecard. */
export function Scorecard({ scores }: { scores: Record<string, number | null | undefined> }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {Object.entries(SCORE_LABELS).map(([key, label]) => (
        <ScoreRow key={key} label={label} score={scores[key]} />
      ))}
    </div>
  )
}
