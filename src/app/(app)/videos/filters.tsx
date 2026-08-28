'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Label } from '@/components/ui/label'

/** Filter bar for /videos. All state lives in the URL, so links are shareable. */
export function VideoFilters({ channels }: { channels: { id: string; title: string }[] }) {
  const router = useRouter()
  const params = useSearchParams()

  function update(patch: Record<string, string>) {
    const next = new URLSearchParams(params.toString())
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    next.delete('page') // any filter change resets pagination
    router.push(`/videos?${next.toString()}`)
  }

  const get = (key: string) => params.get(key) ?? ''
  const hasFilters = ['q', 'channelId', 'analysisStatus', 'transcriptStatus', 'from', 'to', 'minScore'].some((k) => get(k))

  return (
    <div className="mb-5 space-y-3 rounded-xl border bg-card p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const value = new FormData(e.currentTarget).get('q')
          update({ q: String(value ?? '') })
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={get('q')}
            placeholder="Search titles, descriptions, channels and report summaries…"
            className="pl-8"
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Filter label="Channel">
          <Select value={get('channelId')} onChange={(e) => update({ channelId: e.target.value })}>
            <option value="">All channels</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </Select>
        </Filter>

        <Filter label="Analysis status">
          <Select value={get('analysisStatus')} onChange={(e) => update({ analysisStatus: e.target.value })}>
            <option value="">Any</option>
            <option value="PENDING">Ready for analysis</option>
            <option value="RUNNING">Analysing</option>
            <option value="COMPLETED">Report ready</option>
            <option value="FAILED">Failed</option>
          </Select>
        </Filter>

        <Filter label="Transcript status">
          <Select value={get('transcriptStatus')} onChange={(e) => update({ transcriptStatus: e.target.value })}>
            <option value="">Any</option>
            <option value="AVAILABLE">Available</option>
            <option value="PENDING">Pending</option>
            <option value="RETRYING">Retrying</option>
            <option value="UNAVAILABLE">Unavailable</option>
            <option value="FAILED">Failed</option>
          </Select>
        </Filter>

        <Filter label="Sort by">
          <Select value={get('sort') || 'newest'} onChange={(e) => update({ sort: e.target.value })}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="highest">Highest score</option>
            <option value="lowest">Lowest score</option>
          </Select>
        </Filter>

        <Filter label="Published from">
          <Input type="date" value={get('from')} onChange={(e) => update({ from: e.target.value })} />
        </Filter>

        <Filter label="Published to">
          <Input type="date" value={get('to')} onChange={(e) => update({ to: e.target.value })} />
        </Filter>

        <Filter label="Minimum score">
          <Select value={get('minScore')} onChange={(e) => update({ minScore: e.target.value })}>
            <option value="">Any score</option>
            {[5, 6, 7, 8, 9].map((n) => (
              <option key={n} value={n}>
                {n}+ / 10
              </option>
            ))}
          </Select>
        </Filter>

        <div className="flex items-end">
          {hasFilters && (
            <Button variant="ghost" onClick={() => router.push('/videos')} className="w-full">
              <X /> Clear filters
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
