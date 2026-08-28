import Link from 'next/link'
import { CalendarRange, Mail } from 'lucide-react'
import { PageHeader } from '@/components/app-shell'
import { ActionButton } from '@/components/action-button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/empty-state'
import { prisma } from '@/lib/prisma'
import { addDays, formatDate, truncate } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function DigestsPage() {
  const digests = await prisma.weeklyDigest.findMany({ orderBy: { weekStart: 'desc' }, take: 52 })

  return (
    <>
      <PageHeader
        title="Weekly digests"
        description="A summary of everything analysed in the previous 7 days, sent every Monday at 08:00 UTC."
        actions={
          <ActionButton endpoint="/api/jobs/weekly-digest" successTitle="Digest generated">
            <Mail /> Generate this week&apos;s digest
          </ActionButton>
        }
      />

      {digests.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="No digests yet"
          description="The first digest is generated on Monday, or press the button above to make one right now."
        />
      ) : (
        <div className="space-y-3">
          {digests.map((digest) => (
            <Link key={digest.id} href={`/digests/${digest.id}`}>
              <Card className="transition-colors hover:border-primary/40">
                <CardContent className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {formatDate(digest.weekStart)} – {formatDate(addDays(digest.weekEnd, -1))}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {truncate(digest.summary ?? 'No summary.', 220)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="secondary">{digest.videoCount} videos</Badge>
                    <Badge variant={digest.sentAt ? 'success' : 'muted'}>{digest.sentAt ? 'Emailed' : 'Not emailed'}</Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
