import { PageHeader } from '@/components/app-shell'
import { getPreferences, getSecretStatuses } from '@/lib/settings'
import { env } from '@/lib/env'
import { SettingsForm } from './settings-form'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const [preferences, secrets] = await Promise.all([getPreferences(), getSecretStatuses()])

  return (
    <>
      <PageHeader
        title="Settings"
        description="Monitoring cadence, notifications, AI and transcript providers, and connection tests."
      />
      <SettingsForm
        preferences={preferences}
        secrets={secrets}
        environment={{
          mockMode: env.MOCK_MODE,
          appBaseUrl: env.APP_BASE_URL,
          nodeEnv: env.NODE_ENV,
          cronSecretConfigured: Boolean(env.CRON_SECRET),
          redisConfigured: Boolean(env.REDIS_URL),
        }}
      />
    </>
  )
}
