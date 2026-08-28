'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Activity,
  CalendarRange,
  LayoutDashboard,
  ListVideo,
  LogOut,
  Menu,
  Settings,
  Tv,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ThemeToggle } from '@/components/theme-toggle'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/channels', label: 'Channels', icon: Tv },
  { href: '/videos', label: 'Videos & reports', icon: ListVideo },
  { href: '/digests', label: 'Weekly digests', icon: CalendarRange },
  { href: '/jobs', label: 'Activity log', icon: Activity },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function AppShell({
  children,
  appName,
  adminEmail,
  mockMode,
}: {
  children: React.ReactNode
  appName: string
  adminEmail: string | null
  mockMode: boolean
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = React.useState(false)

  React.useEffect(() => setMobileOpen(false), [pathname])

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  const nav = (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <item.icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r bg-card p-4 lg:flex">
        <Link href="/" className="mb-6 flex items-center gap-2 px-1">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Tv className="size-4" />
          </div>
          <span className="truncate text-sm font-semibold leading-tight">{appName}</span>
        </Link>
        {nav}
        <div className="mt-auto space-y-3 pt-4">
          {mockMode && (
            <Badge variant="warning" className="w-full justify-center">
              Mock mode — no live APIs
            </Badge>
          )}
          <div className="rounded-lg border p-3">
            <p className="truncate text-xs text-muted-foreground">Signed in as</p>
            <p className="truncate text-sm font-medium">{adminEmail ?? 'admin'}</p>
            <Button variant="ghost" size="sm" className="mt-2 w-full justify-start px-2" onClick={logout}>
              <LogOut className="size-4" /> Sign out
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r bg-card p-4">
            <div className="mb-6 flex items-center justify-between">
              <span className="truncate text-sm font-semibold">{appName}</span>
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)} aria-label="Close menu">
                <X />
              </Button>
            </div>
            {nav}
            <Button variant="ghost" size="sm" className="mt-auto justify-start px-2" onClick={logout}>
              <LogOut className="size-4" /> Sign out
            </Button>
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu />
          </Button>
          <span className="truncate text-sm font-medium lg:hidden">{appName}</span>
          <div className="ml-auto flex items-center gap-1">
            {mockMode && (
              <Badge variant="warning" className="hidden sm:inline-flex">
                Mock mode
              </Badge>
            )}
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl p-4 sm:p-6">{children}</main>
      </div>
    </div>
  )
}

/** Standard page heading used on every page. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
