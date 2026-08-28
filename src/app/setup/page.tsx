import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { getPreferences, getSecretStatuses, isSetupCompleted } from '@/lib/settings'
import { env } from '@/lib/env'
import { SetupWizard } from './setup-wizard'

export const dynamic = 'force-dynamic'

export default async function SetupPage() {
  const completed = await isSetupCompleted().catch(() => false)
  const session = await getSession()

  // Once configured, only a signed-in admin may revisit setup.
  if (completed && !session) redirect('/login')

  const prefs = await getPreferences().catch(() => null)
  const secrets = await getSecretStatuses().catch(() => [])

  return (
    <div className="min-h-screen bg-muted/40 p-4 py-10">
      <SetupWizard
        alreadyCompleted={completed}
        defaults={{
          appName: prefs?.appName ?? 'YouTube Content Intelligence Monitor',
          adminEmail: prefs?.adminEmail || env.ADMIN_EMAIL || '',
          aiModel: prefs?.aiModel ?? 'claude-sonnet-4-5',
        }}
        secrets={secrets}
        mockMode={env.MOCK_MODE}
        hasEnvAdmin={Boolean(env.ADMIN_EMAIL && env.ADMIN_PASSWORD)}
      />
    </div>
  )
}
