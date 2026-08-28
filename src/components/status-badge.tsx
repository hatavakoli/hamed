import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/**
 * Human-friendly status pills. The database enums are technical; these are the
 * words a non-technical operator actually understands.
 */

const VIDEO_STATUS: Record<string, { label: string; variant: 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'info' | 'muted' }> = {
  NEW: { label: 'New', variant: 'info' },
  PROCESSING: { label: 'Analysing', variant: 'warning' },
  READY: { label: 'Report ready', variant: 'success' },
  UNAVAILABLE: { label: 'Unavailable', variant: 'muted' },
  FAILED: { label: 'Failed', variant: 'destructive' },
}

const TRANSCRIPT_STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'destructive' | 'muted' | 'info' }> = {
  PENDING: { label: 'Transcript pending', variant: 'info' },
  RETRYING: { label: 'Transcript retrying', variant: 'warning' },
  AVAILABLE: { label: 'Transcript ready', variant: 'success' },
  UNAVAILABLE: { label: 'Transcript unavailable', variant: 'muted' },
  FAILED: { label: 'Transcript failed', variant: 'destructive' },
}

const ANALYSIS_STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'destructive' | 'muted' | 'info' }> = {
  PENDING: { label: 'Ready for analysis', variant: 'info' },
  RUNNING: { label: 'Analysing', variant: 'warning' },
  COMPLETED: { label: 'Report ready', variant: 'success' },
  FAILED: { label: 'Analysis failed', variant: 'destructive' },
  SKIPPED: { label: 'Skipped', variant: 'muted' },
}

const JOB_STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'destructive' | 'muted' | 'info' }> = {
  PENDING: { label: 'Queued', variant: 'info' },
  RUNNING: { label: 'Running', variant: 'warning' },
  COMPLETED: { label: 'Done', variant: 'success' },
  FAILED: { label: 'Failed', variant: 'destructive' },
}

const JOB_TYPE_LABELS: Record<string, string> = {
  CHECK_ALL_CHANNELS: 'Check all channels',
  CHECK_CHANNEL: 'Check channel',
  PROCESS_VIDEO: 'Analyse video',
  RETRY_TRANSCRIPT: 'Retry transcript',
  WEEKLY_DIGEST: 'Weekly digest',
}

type Kind = 'video' | 'transcript' | 'analysis' | 'job'

const MAPS: Record<Kind, Record<string, { label: string; variant: string }>> = {
  video: VIDEO_STATUS,
  transcript: TRANSCRIPT_STATUS,
  analysis: ANALYSIS_STATUS,
  job: JOB_STATUS,
}

export function StatusBadge({ kind, status, className }: { kind: Kind; status: string; className?: string }) {
  const entry = MAPS[kind][status] ?? { label: status, variant: 'muted' }
  return (
    <Badge variant={entry.variant as 'muted'} className={cn('whitespace-nowrap', className)}>
      {entry.label}
    </Badge>
  )
}

export function jobTypeLabel(jobType: string): string {
  return JOB_TYPE_LABELS[jobType] ?? jobType
}

export function VerdictBadge({ verdict }: { verdict: string | null }) {
  if (!verdict) return null
  const variant = verdict === 'strong' ? 'success' : verdict === 'weak' ? 'destructive' : 'warning'
  return <Badge variant={variant}>{verdict}</Badge>
}

export function BuildVerdictBadge({ verdict }: { verdict: string }) {
  const map: Record<string, { label: string; variant: 'success' | 'warning' | 'destructive' | 'muted' }> = {
    build: { label: 'Worth building', variant: 'success' },
    explore: { label: 'Worth exploring', variant: 'warning' },
    skip: { label: 'Skip', variant: 'destructive' },
    not_applicable: { label: 'No product idea', variant: 'muted' },
  }
  const entry = map[verdict] ?? map.not_applicable
  return <Badge variant={entry.variant}>{entry.label}</Badge>
}
