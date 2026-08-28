'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/toast'

/** Pause / resume monitoring for one channel. */
export function ToggleChannelButton({
  id,
  isActive,
  children,
}: {
  id: string
  isActive: boolean
  children: React.ReactNode
}) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  async function toggle() {
    setLoading(true)
    try {
      const res = await fetch(`/api/channels/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ isActive: !isActive }),
      })
      const json = (await res.json()) as { ok: boolean; error?: string }
      if (!json.ok) {
        toast({ title: 'Could not update the channel', description: json.error, variant: 'error' })
        return
      }
      toast({ title: isActive ? 'Monitoring paused' : 'Monitoring resumed', variant: 'success' })
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button size="sm" variant="outline" loading={loading} onClick={toggle}>
      {children}
    </Button>
  )
}

export function DeleteChannelButton({ id, title, videoCount }: { id: string; title: string; videoCount: number }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  async function remove() {
    const message =
      `Delete "${title}"?\n\nThis also deletes ${videoCount} stored video(s) and their reports. ` +
      `This cannot be undone.`
    if (!window.confirm(message)) return

    setLoading(true)
    try {
      const res = await fetch(`/api/channels/${id}`, { method: 'DELETE' })
      const json = (await res.json()) as { ok: boolean; error?: string }
      if (!json.ok) {
        toast({ title: 'Could not delete the channel', description: json.error, variant: 'error' })
        return
      }
      toast({ title: 'Channel deleted', variant: 'success' })
      router.push('/channels')
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10" loading={loading} onClick={remove}>
      <Trash2 />
    </Button>
  )
}
