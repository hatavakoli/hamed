import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { getPreferences, isSetupCompleted } from '@/lib/settings'
import { LoginForm } from './login-form'

export const dynamic = 'force-dynamic'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const session = await getSession()
  if (session) redirect('/')

  // A brand new install goes to the setup wizard instead.
  const setupDone = await isSetupCompleted().catch(() => true)
  if (!setupDone) redirect('/setup')

  const prefs = await getPreferences().catch(() => null)
  const { next } = await searchParams

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <LoginForm appName={prefs?.appName ?? 'YouTube Content Intelligence Monitor'} next={next ?? '/'} />
    </div>
  )
}
