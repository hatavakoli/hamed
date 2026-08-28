'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button, type ButtonProps } from '@/components/ui/button'
import { useToast } from '@/components/toast'

/**
 * A button that POSTs to an API route, shows a toast with the result, and
 * refreshes the server-rendered page so new data appears.
 *
 * Used for every "Check now" / "Retry" / "Regenerate" action in the app.
 */
export function ActionButton({
  endpoint,
  body,
  successTitle = 'Done',
  confirm,
  onDone,
  children,
  ...buttonProps
}: ButtonProps & {
  endpoint: string
  body?: unknown
  successTitle?: string
  confirm?: string
  onDone?: (data: unknown) => void
}) {
  const [loading, setLoading] = React.useState(false)
  const { toast } = useToast()
  const router = useRouter()

  async function run() {
    if (confirm && !window.confirm(confirm)) return
    setLoading(true)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      })
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        data?: { message?: string } & Record<string, unknown>
      }

      if (!res.ok || !json.ok) {
        toast({ title: 'That did not work', description: json.error ?? `Request failed (HTTP ${res.status}).`, variant: 'error' })
        return
      }
      toast({ title: successTitle, description: json.data?.message, variant: 'success' })
      onDone?.(json.data)
      router.refresh()
    } catch (err) {
      toast({ title: 'Network error', description: err instanceof Error ? err.message : 'Unknown error', variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button {...buttonProps} loading={loading} onClick={run}>
      {children}
    </Button>
  )
}
