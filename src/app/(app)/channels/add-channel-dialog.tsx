'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useToast } from '@/components/toast'

export function AddChannelDialog() {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input, isActive: true, checkNow: true }),
      })
      const json = (await res.json()) as { ok: boolean; error?: string; data?: { title?: string } }
      if (!json.ok) {
        setError(json.error ?? 'Could not add that channel.')
        return
      }
      toast({
        title: 'Channel added',
        description: `${json.data?.title ?? 'Channel'} is now monitored. A first check has been queued.`,
        variant: 'success',
      })
      setInput('')
      setOpen(false)
      router.refresh()
    } catch {
      setError('Could not reach the server.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> Add channel
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Add a channel to monitor</DialogTitle>
            <DialogDescription>
              We resolve whatever you paste into a canonical YouTube channel ID before saving it.
            </DialogDescription>
          </DialogHeader>

          <div className="my-5 space-y-2">
            <Label htmlFor="channel-input">Channel URL, @handle, or channel ID</Label>
            <Input
              id="channel-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="@mkbhd"
              autoFocus
              required
            />
            <ul className="space-y-0.5 text-xs text-muted-foreground">
              <li>· https://www.youtube.com/@channelname</li>
              <li>· https://www.youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxx</li>
              <li>· @channelname · UCxxxxxxxxxxxxxxxxxxxxxx</li>
              <li>· a video URL — we will find the channel that owns it</li>
            </ul>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={loading}>
              Add and check
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
