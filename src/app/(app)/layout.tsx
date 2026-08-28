import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { getPreferences, isSetupCompleted } from '@/lib/settings'
import { env } from '@/lib/env'
import { AppShell } from '@/components/app-shell'

export const dynamic = 'force-dynamic'

/**
 * Every authenticated page lives under this layout. The session is verified
 * here on the server (the Edge middleware only does the cheap cookie check).
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const setupDone = await isSetupCompleted().catch(() => false)
  if (!setupDone) redirect('/setup')

  const session = await getSession()
  if (!session) redirect('/login')

  const prefs = await getPreferences()

  return (
    <AppShell appName={prefs.appName} adminEmail={session.email} mockMode={env.MOCK_MODE}>
      {children}
    </AppShell>
  )
}
