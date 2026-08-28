'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useToast } from '@/components/toast'

/**
 * "Analyse past videos" — pulls in videos published BEFORE monitoring started
 * and queues them for the same transcript + AI pipeline.
 */
export function BackfillButton({ channelId }: { channelId: string }) {
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState('5')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  async function run() {
    setLoading(true)
    try {
      const res = await fetch(`/api/channels/${channelId}/backfill`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ count: Number(count) }),
      })
      const json = (await res.json()) as { ok: boolean; error?: string; data?: { message?: string } }
      if (!json.ok) {
        toast({ title: 'Backfill failed', description: json.error, variant: 'error' })
        return
      }
      toast({ title: 'Backfill queued', description: json.data?.message, variant: 'success' })
      setOpen(false)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <History /> Analyse past videos
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Analyse past videos</DialogTitle>
          <DialogDescription>
            Normal monitoring only looks at videos published after you added the channel. This pulls in older uploads and
            runs them through the same transcript and AI analysis. Videos already stored are skipped, so this is safe to
            run more than once.
          </DialogDescription>
        </DialogHeader>

        <div className="my-4 space-y-2">
          <Label htmlFor="backfill-count">How many recent uploads to pull in</Label>
          <Select id="backfill-count" value={count} onChange={(e) => setCount(e.target.value)}>
            {[3, 5, 10, 15, 25].map((n) => (
              <option key={n} value={n}>
                {n} videos
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">
            Each video costs one AI call. Start small if you are using a paid API key.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button loading={loading} onClick={run}>
            Queue backfill
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
