'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Page error:', error)
  }, [error])

  return (
    <div className="mx-auto max-w-xl p-6">
      <Alert variant="destructive">
        <AlertTriangle />
        <AlertTitle>Something went wrong</AlertTitle>
        <AlertDescription>
          <p className="mb-3">{error.message || 'An unexpected error occurred while rendering this page.'}</p>
          <p className="mb-3 text-xs opacity-80">
            If this is the first run, the database may not be migrated yet. Run <code>npm run prisma:deploy</code>.
          </p>
          <Button size="sm" variant="outline" onClick={reset}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  )
}
