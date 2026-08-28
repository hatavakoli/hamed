import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Providers } from '@/components/theme-provider'
import { getPreferences } from '@/lib/settings'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const prefs = await getPreferences().catch(() => null)
  return {
    title: prefs?.appName ?? 'YouTube Content Intelligence Monitor',
    description: 'Monitor YouTube channels, analyse every new video with AI, and validate the product ideas inside them.',
  }
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1220' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
