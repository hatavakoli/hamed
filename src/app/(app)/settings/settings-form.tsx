'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Info, Save, TestTube2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { InfoHint } from '@/components/ui/tooltip'
import { useToast } from '@/components/toast'
import type { Preferences, SecretStatus } from '@/lib/settings'

type TestResult = { ok: boolean; message: string }

export function SettingsForm({
  preferences,
  secrets,
  environment,
}: {
  preferences: Preferences
  secrets: SecretStatus[]
  environment: { mockMode: boolean; appBaseUrl: string; nodeEnv: string; cronSecretConfigured: boolean; redisConfigured: boolean }
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [prefs, setPrefs] = useState(preferences)
  const [secretEdits, setSecretEdits] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [tests, setTests] = useState<Record<string, TestResult | 'loading'>>({})

  const secretByName = new Map(secrets.map((s) => [s.name, s]))

  function set<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setPrefs((p) => ({ ...p, [key]: value }))
  }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...prefs, secrets: secretEdits }),
      })
      const json = (await res.json()) as { ok: boolean; error?: string }
      if (!json.ok) {
        toast({ title: 'Could not save settings', description: json.error, variant: 'error' })
        return
      }
      toast({ title: 'Settings saved', description: 'The worker picks up the new interval on its next tick.', variant: 'success' })
      setSecretEdits({})
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  async function runTest(key: string, endpoint: string) {
    setTests((t) => ({ ...t, [key]: 'loading' }))
    try {
      const res = await fetch(endpoint, { method: 'POST' })
      const json = (await res.json()) as { ok: boolean; error?: string; data?: { ok?: boolean; message?: string } }
      const result: TestResult = json.ok
        ? { ok: json.data?.ok !== false, message: json.data?.message ?? 'Connected.' }
        : { ok: false, message: json.error ?? 'Test failed.' }
      setTests((t) => ({ ...t, [key]: result }))
    } catch (err) {
      setTests((t) => ({ ...t, [key]: { ok: false, message: err instanceof Error ? err.message : 'Network error' } }))
    }
  }

  return (
    <div className="space-y-5">
      {environment.mockMode && (
        <Alert variant="info">
          <Info />
          <AlertTitle>MOCK_MODE is enabled</AlertTitle>
          <AlertDescription>
            All external services are mocked regardless of the settings below. Set <code>MOCK_MODE=false</code> in your
            .env and restart to use live APIs.
          </AlertDescription>
        </Alert>
      )}

      {/* Monitoring */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Monitoring</CardTitle>
          <CardDescription>How often channels are checked, and how much is pulled per check.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Check interval"
            hint="The worker checks whether this much time has elapsed every 5 minutes, so changes apply without a restart."
          >
            <Select
              value={String(prefs.monitorIntervalMinutes)}
              onChange={(e) => set('monitorIntervalMinutes', Number(e.target.value))}
            >
              {[15, 30, 45, 60, 120, 180, 360, 720, 1440].map((m) => (
                <option key={m} value={m}>
                  Every {m < 60 ? `${m} minutes` : m === 60 ? 'hour' : `${m / 60} hours`}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Max new videos per check" hint="Caps how many videos a single check can queue. Protects your API quota and AI budget.">
            <Select value={String(prefs.maxVideosPerCheck)} onChange={(e) => set('maxVideosPerCheck', Number(e.target.value))}>
              {[1, 3, 5, 10, 15, 25].map((n) => (
                <option key={n} value={n}>
                  {n} videos
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Data retention" hint="Videos published before this window are deleted along with their transcripts and reports.">
            <Select value={String(prefs.dataRetentionDays)} onChange={(e) => set('dataRetentionDays', Number(e.target.value))}>
              <option value="0">Keep everything forever</option>
              {[30, 90, 180, 365].map((d) => (
                <option key={d} value={d}>
                  Delete after {d} days
                </option>
              ))}
            </Select>
          </Field>

          <Field label="App name">
            <Input value={prefs.appName} onChange={(e) => set('appName', e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      {/* Email */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Email notifications</CardTitle>
          <CardDescription>
            Without a Resend key, emails are printed to the server terminal instead of being sent — nothing breaks.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Admin email" hint="Where reports and digests are delivered.">
            <Input type="email" value={prefs.adminEmail} onChange={(e) => set('adminEmail', e.target.value)} />
          </Field>

          <Toggle
            label="Email me when a new report is ready"
            checked={prefs.notifyOnNewReport}
            onChange={(v) => set('notifyOnNewReport', v)}
          />
          <Toggle
            label="Send the weekly digest (Mondays, 08:00 UTC)"
            checked={prefs.weeklyDigestEnabled}
            onChange={(v) => set('weeklyDigestEnabled', v)}
          />

          <SecretInput
            name="RESEND_API_KEY"
            label="Resend API key"
            status={secretByName.get('RESEND_API_KEY')}
            value={secretEdits.RESEND_API_KEY ?? ''}
            onChange={(v) => setSecretEdits((s) => ({ ...s, RESEND_API_KEY: v }))}
          />
          <SecretInput
            name="EMAIL_FROM"
            label="Sending address"
            type="text"
            placeholder="reports@yourdomain.com"
            status={secretByName.get('EMAIL_FROM')}
            value={secretEdits.EMAIL_FROM ?? ''}
            onChange={(v) => setSecretEdits((s) => ({ ...s, EMAIL_FROM: v }))}
          />

          <TestRow label="Send a test email" result={tests.email} onClick={() => runTest('email', '/api/settings/test-email')} />
        </CardContent>
      </Card>

      {/* AI */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI analysis</CardTitle>
          <CardDescription>Claude is the primary provider. The mock provider needs no key and costs nothing.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Provider">
              <Select value={prefs.aiProvider} onChange={(e) => set('aiProvider', e.target.value as Preferences['aiProvider'])}>
                <option value="anthropic">Anthropic Claude</option>
                <option value="mock">Mock (offline, free)</option>
              </Select>
            </Field>
            <Field label="Model" hint="e.g. claude-sonnet-4-5 for a good balance, or a smaller model for high volume.">
              <Input value={prefs.aiModel} onChange={(e) => set('aiModel', e.target.value)} />
            </Field>
          </div>

          <SecretInput
            name="ANTHROPIC_API_KEY"
            label="Anthropic API key"
            status={secretByName.get('ANTHROPIC_API_KEY')}
            value={secretEdits.ANTHROPIC_API_KEY ?? ''}
            onChange={(v) => setSecretEdits((s) => ({ ...s, ANTHROPIC_API_KEY: v }))}
          />

          <TestRow label="Test the AI connection" result={tests.ai} onClick={() => runTest('ai', '/api/settings/test-ai')} />
        </CardContent>
      </Card>

      {/* YouTube + transcripts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">YouTube & transcripts</CardTitle>
          <CardDescription>
            Transcripts are attempted in this order: your configured transcript API, then YouTube caption detection, then
            a clearly-marked metadata-only report.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SecretInput
            name="YOUTUBE_API_KEY"
            label="YouTube Data API key"
            status={secretByName.get('YOUTUBE_API_KEY')}
            value={secretEdits.YOUTUBE_API_KEY ?? ''}
            onChange={(v) => setSecretEdits((s) => ({ ...s, YOUTUBE_API_KEY: v }))}
          />
          <TestRow label="Test the YouTube connection" result={tests.youtube} onClick={() => runTest('youtube', '/api/settings/test-youtube')} />

          <Field label="Transcript provider">
            <Select
              value={prefs.transcriptProvider}
              onChange={(e) => set('transcriptProvider', e.target.value as Preferences['transcriptProvider'])}
            >
              <option value="api">Configured transcript API (recommended)</option>
              <option value="youtube">YouTube captions detection only</option>
              <option value="mock">Mock (offline, free)</option>
              <option value="none">Disabled — metadata-only reports</option>
            </Select>
          </Field>

          <SecretInput
            name="TRANSCRIPT_API_URL"
            label="Transcript API URL"
            type="text"
            placeholder="https://api.example.com/transcript"
            status={secretByName.get('TRANSCRIPT_API_URL')}
            value={secretEdits.TRANSCRIPT_API_URL ?? ''}
            onChange={(v) => setSecretEdits((s) => ({ ...s, TRANSCRIPT_API_URL: v }))}
          />
          <SecretInput
            name="TRANSCRIPT_API_KEY"
            label="Transcript API key"
            status={secretByName.get('TRANSCRIPT_API_KEY')}
            value={secretEdits.TRANSCRIPT_API_KEY ?? ''}
            onChange={(v) => setSecretEdits((s) => ({ ...s, TRANSCRIPT_API_KEY: v }))}
          />
          <TestRow
            label="Test the transcript provider"
            result={tests.transcript}
            onClick={() => runTest('transcript', '/api/settings/test-transcript')}
          />
        </CardContent>
      </Card>

      {/* Environment (read-only) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Environment</CardTitle>
          <CardDescription>Read-only. These come from your .env file and require a restart to change.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <EnvRow label="NODE_ENV" value={environment.nodeEnv} />
            <EnvRow label="APP_BASE_URL" value={environment.appBaseUrl} />
            <EnvRow label="MOCK_MODE" value={environment.mockMode ? 'on' : 'off'} />
            <EnvRow label="CRON_SECRET" value={environment.cronSecretConfigured ? 'configured' : 'not set'} />
            <EnvRow label="REDIS_URL" value={environment.redisConfigured ? 'configured' : 'not set (not required)'} />
          </dl>
        </CardContent>
      </Card>

      <div className="sticky bottom-4 flex justify-end">
        <Button size="lg" loading={saving} onClick={save} className="shadow-lg">
          <Save /> Save settings
        </Button>
      </div>
    </div>
  )
}

// --- helpers ----------------------------------------------------------------

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1">
        {label}
        {hint && <InfoHint>{hint}</InfoHint>}
      </Label>
      {children}
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border p-3">
      <span className="text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  )
}

function SecretInput({
  name,
  label,
  status,
  value,
  onChange,
  type = 'password',
  placeholder,
}: {
  name: string
  label: string
  status?: SecretStatus
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
}) {
  const fromEnv = status?.source === 'env'
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={name}>{label}</Label>
        {status?.configured && (
          <Badge variant={fromEnv ? 'info' : 'success'}>{fromEnv ? 'From .env' : `Saved ${status.masked}`}</Badge>
        )}
      </div>
      <Input
        id={name}
        type={type}
        value={value}
        disabled={fromEnv}
        onChange={(e) => onChange(e.target.value)}
        placeholder={
          fromEnv
            ? 'Managed by your environment variables'
            : (placeholder ?? (status?.configured ? 'Leave blank to keep the saved value' : 'Not configured'))
        }
      />
    </div>
  )
}

function TestRow({ label, result, onClick }: { label: string; result?: TestResult | 'loading'; onClick: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted p-3">
      <Button size="sm" variant="outline" loading={result === 'loading'} onClick={onClick}>
        <TestTube2 /> {label}
      </Button>
      {result && result !== 'loading' && (
        <span className={`flex items-center gap-1.5 text-sm ${result.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
          {result.ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
          {result.message}
        </span>
      )}
    </div>
  )
}

function EnvRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b py-1.5 last:border-0">
      <dt className="font-mono text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm">{value}</dd>
    </div>
  )
}
