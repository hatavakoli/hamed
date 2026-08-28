'use client'

import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { formatTimestamp } from '@/lib/utils'

type Segment = { start: number; duration: number; text: string }

/** Transcript reader with client-side search and clickable timestamps. */
export function TranscriptViewer({
  segments,
  rawText,
  youtubeVideoId,
}: {
  segments: Segment[]
  rawText: string
  youtubeVideoId: string
}) {
  const [query, setQuery] = useState('')

  const rows = useMemo<Segment[]>(() => {
    if (segments.length) return segments
    // No timing data: show the plain text as one block.
    return [{ start: 0, duration: 0, text: rawText }]
  }, [segments, rawText])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((r) => r.text.toLowerCase().includes(term))
  }, [rows, query])

  const matchCount = query.trim() ? filtered.length : 0

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the transcript…"
            className="pl-8"
          />
        </div>
        {query.trim() && (
          <Badge variant="secondary">
            {matchCount} match{matchCount === 1 ? '' : 'es'}
          </Badge>
        )}
      </div>

      <div className="thin-scroll max-h-[28rem] space-y-1 overflow-y-auto rounded-lg border bg-muted/30 p-3">
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No lines match “{query}”.</p>
        ) : (
          filtered.map((segment, i) => (
            <p key={i} className="flex gap-3 text-sm leading-relaxed">
              {segments.length > 0 && (
                <a
                  href={`https://www.youtube.com/watch?v=${youtubeVideoId}&t=${Math.floor(segment.start)}s`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="shrink-0 pt-0.5 font-mono text-xs text-muted-foreground hover:text-foreground hover:underline"
                  title="Open YouTube at this timestamp"
                >
                  {formatTimestamp(segment.start)}
                </a>
              )}
              <span>{highlight(segment.text, query)}</span>
            </p>
          ))
        )}
      </div>
    </div>
  )
}

function highlight(text: string, query: string) {
  const term = query.trim()
  if (!term) return text
  const parts = text.split(new RegExp(`(${escapeRegExp(term)})`, 'ig'))
  return parts.map((part, i) =>
    part.toLowerCase() === term.toLowerCase() ? (
      <mark key={i} className="rounded bg-amber-200 px-0.5 dark:bg-amber-500/40 dark:text-foreground">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    ),
  )
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
