import Link from 'next/link'
import { ExternalLink, Pause, Play, RefreshCw, Tv } from 'lucide-react'
import { PageHeader } from '@/components/app-shell'
import { ActionButton } from '@/components/action-button'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/empty-state'
import { AddChannelDialog } from './add-channel-dialog'
import { DeleteChannelButton, ToggleChannelButton } from './channel-actions'
import { prisma } from '@/lib/prisma'
import { formatDate, timeAgo, truncate } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function ChannelsPage() {
  const channels = await prisma.channel.findMany({
    orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    include: {
      _count: { select: { videos: true } },
      videos: { orderBy: { publishedAt: 'desc' }, take: 1, select: { title: true, publishedAt: true } },
    },
  })

  const reportCounts = await prisma.video.groupBy({
    by: ['channelId'],
    where: { report: { analysisStatus: 'COMPLETED' } },
    _count: { _all: true },
  })
  const reportsByChannel = new Map(reportCounts.map((r) => [r.channelId, r._count._all]))

  return (
    <>
      <PageHeader
        title="Channels"
        description="Add 3–5 channels to start. Each one is checked automatically on your monitoring interval."
        actions={
          <>
            <AddChannelDialog />
            <ActionButton endpoint="/api/jobs/check-all-channels" successTitle="Channels checked" variant="outline">
              <RefreshCw /> Check all now
            </ActionButton>
          </>
        }
      />

      {channels.length === 0 ? (
        <EmptyState
          icon={Tv}
          title="No channels yet"
          description="Paste a YouTube channel URL, an @handle, or a channel ID. You can even paste a video URL and we will find its channel."
          action={<AddChannelDialog />}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {channels.map((channel) => (
            <Card key={channel.id} className="flex flex-col">
              <CardContent className="flex flex-1 flex-col gap-3 p-5">
                <div className="flex items-start gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={channel.thumbnailUrl ?? 'https://placehold.co/96x96/e2e8f0/64748b/png?text=YT'}
                    alt=""
                    className="size-11 shrink-0 rounded-full border object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <Link href={`/channels/${channel.id}`} className="line-clamp-1 font-medium hover:underline">
                      {channel.title}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">{channel.handle ?? channel.youtubeChannelId}</p>
                  </div>
                  <Badge variant={channel.isActive ? 'success' : 'muted'}>{channel.isActive ? 'Active' : 'Paused'}</Badge>
                </div>

                {channel.description && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">{truncate(channel.description, 160)}</p>
                )}

                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <Stat label="Videos" value={String(channel._count.videos)} />
                  <Stat label="Reports" value={String(reportsByChannel.get(channel.id) ?? 0)} />
                  <Stat label="Last checked" value={timeAgo(channel.lastCheckedAt)} />
                  <Stat label="Added" value={formatDate(channel.createdAt)} />
                </dl>

                {channel.videos[0] && (
                  <p className="line-clamp-1 rounded-md bg-muted px-2.5 py-1.5 text-xs">
                    <span className="text-muted-foreground">Latest: </span>
                    {channel.videos[0].title}
                  </p>
                )}

                {channel.lastError && (
                  <p className="line-clamp-2 rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
                    {channel.lastError}
                  </p>
                )}

                <div className="mt-auto flex flex-wrap gap-2 pt-1">
                  <Button asChild size="sm" variant="secondary">
                    <Link href={`/channels/${channel.id}`}>View</Link>
                  </Button>
                  <ActionButton
                    endpoint={`/api/channels/${channel.id}/check`}
                    successTitle="Check complete"
                    size="sm"
                    variant="outline"
                  >
                    <RefreshCw /> Check now
                  </ActionButton>
                  <ToggleChannelButton id={channel.id} isActive={channel.isActive}>
                    {channel.isActive ? <Pause /> : <Play />}
                    {channel.isActive ? 'Pause' : 'Resume'}
                  </ToggleChannelButton>
                  <Button asChild size="sm" variant="ghost">
                    <a
                      href={`https://www.youtube.com/channel/${channel.youtubeChannelId}`}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      <ExternalLink />
                    </a>
                  </Button>
                  <DeleteChannelButton id={channel.id} title={channel.title} videoCount={channel._count.videos} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  )
}
