import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-5xl font-semibold">404</p>
      <p className="text-muted-foreground">That page does not exist.</p>
      <Button asChild>
        <Link href="/">Back to the dashboard</Link>
      </Button>
    </div>
  )
}
