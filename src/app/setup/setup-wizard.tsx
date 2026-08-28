'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, Info, Tv } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import type { SecretStatus } from '@/lib/settings'

type Defaults = { appName: string; adminEmail: string; aiModel: string }

export function SetupWizard({
  alreadyCompleted,
  defaults,
  secrets,
  mockMode,
  hasEnvAdmin,
}: {
  alreadyCompleted: boolean
  defaults: Defaults
  secrets: SecretStatus[]
  mockMode: boolean
  hasEnvAdmin: boolean
}) {
  const router = useRouter()
  const [form, setForm] = useState({
    appName: defaults.appName,
    adminEmail: defaults.adminEmail,
    adminPassword: '',
    youtubeApiKey: '',
    anthropicApiKey: '',
    transcriptApiUrl: '',
    transcriptApiKey: '',
    resendApiKey: '',
    emailFrom: '',
    aiModel: defaults.aiModel,
  })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const secretByName = new Map(secrets.map((s) => [s.name, s]))

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const payload = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ''))
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = (await res.json()) as { ok: boolean; error?: string; details?: { path: string; message: string }[] }
      if (!json.ok) {
        setError(json.details?.map((d) => `${d.path}: ${d.message}`).join(' · ') ?? json.error ?? 'Setup failed.')
        return
      }
      router.push('/channels')
      router.refresh()
    } catch {
      setError('Could not reach the server.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto w-full max-w-2xl space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Tv className="size-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">{alreadyCompleted ? 'Re-run setup' : 'Welcome — let us set things up'}</h1>
          <p className="text-sm text-muted-foreground">
            This takes about two minutes. Every API key is optional; anything you leave blank falls back to a local mock.
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Setup could not be saved</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {mockMode && (
        <Alert variant="info">
          <Info />
          <AlertTitle>MOCK_MODE is on</AlertTitle>
          <AlertDescription>
            The app will use fake YouTube, transcript, AI and email adapters so you can click through everything without
            paying for anything. Set <code>MOCK_MODE=false</code> in your .env when you are ready for live data.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Your account</CardTitle>
          <CardDescription>Reports are emailed to this address and you sign in with it.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="App name" htmlFor="appName">
            <Input id="appName" value={form.appName} onChange={(e) => set('appName', e.target.value)} required />
          </Field>
          <Field label="Admin email" htmlFor="adminEmail">
            <Input
              id="adminEmail"
              type="email"
              value={form.adminEmail}
              onChange={(e) => set('adminEmail', e.target.value)}
              placeholder="you@example.com"
              required
            />
          </Field>
          <Field
            label="Admin password"
            htmlFor="adminPassword"
            hint={
              hasEnvAdmin
                ? 'Optional — ADMIN_EMAIL and ADMIN_PASSWORD are already set in your .env, so you can leave this blank.'
                : 'At least 8 characters. Stored as a scrypt hash, never in plain text.'
            }
          >
            <Input
              id="adminPassword"
              type="password"
              value={form.adminPassword}
              onChange={(e) => set('adminPassword', e.target.value)}
              placeholder={hasEnvAdmin ? 'Leave blank to use the .env password' : 'At least 8 characters'}
              minLength={form.adminPassword ? 8 : undefined}
              required={!hasEnvAdmin && !alreadyCompleted}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. API keys</CardTitle>
          <CardDescription>
            Keys entered here are encrypted before they are stored. In production prefer environment variables — those
            always take priority over anything saved here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SecretField
            id="youtubeApiKey"
            label="YouTube Data API key"
            hint="From Google Cloud Console → APIs & Services → Credentials, with YouTube Data API v3 enabled. Without it the app uses fake channels."
            status={secretByName.get('YOUTUBE_API_KEY')}
            value={form.youtubeApiKey}
            onChange={(v) => set('youtubeApiKey', v)}
          />
          <SecretField
            id="anthropicApiKey"
            label="Anthropic API key"
            hint="From console.anthropic.com. Without it the app uses a built-in mock analyst that returns realistic sample reports."
            status={secretByName.get('ANTHROPIC_API_KEY')}
            value={form.anthropicApiKey}
            onChange={(v) => set('anthropicApiKey', v)}
          />
          <Field label="Claude model" htmlFor="aiModel" hint="Default: claude-sonnet-4-5. Use a cheaper model for high volume.">
            <Input id="aiModel" value={form.aiModel} onChange={(e) => set('aiModel', e.target.value)} />
          </Field>

          <Separator className="my-2" />

          <SecretField
            id="transcriptApiUrl"
            label="Transcript API URL (optional)"
            hint="An endpoint that accepts ?videoId=... and returns transcript JSON. Leave blank to use the mock transcript provider."
            status={secretByName.get('TRANSCRIPT_API_URL')}
            value={form.transcriptApiUrl}
            onChange={(v) => set('transcriptApiUrl', v)}
            type="url"
            placeholder="https://api.example.com/transcript"
          />
          <SecretField
            id="transcriptApiKey"
            label="Transcript API key (optional)"
            status={secretByName.get('TRANSCRIPT_API_KEY')}
            value={form.transcriptApiKey}
            onChange={(v) => set('transcriptApiKey', v)}
          />

          <Separator className="my-2" />

          <SecretField
            id="resendApiKey"
            label="Resend API key (optional)"
            hint="Without it, notification emails are printed to the server terminal instead of being sent."
            status={secretByName.get('RESEND_API_KEY')}
            value={form.resendApiKey}
            onChange={(v) => set('resendApiKey', v)}
          />
          <SecretField
            id="emailFrom"
            label="Sending email address (optional)"
            hint="Must be a verified sender in Resend, e.g. reports@yourdomain.com"
            status={secretByName.get('EMAIL_FROM')}
            value={form.emailFrom}
            onChange={(v) => set('emailFrom', v)}
            placeholder="reports@yourdomain.com"
          />
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button type="submit" size="lg" loading={loading}>
          {alreadyCompleted ? 'Save changes' : 'Finish setup'}
        </Button>
      </div>
    </form>
  )
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function SecretField({
  id,
  label,
  hint,
  status,
  value,
  onChange,
  type = 'password',
  placeholder,
}: {
  id: string
  label: string
  hint?: string
  status?: SecretStatus
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
}) {
  const fromEnv = status?.source === 'env'
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {status?.configured && (
          <Badge variant={fromEnv ? 'info' : 'success'} className="gap-1">
            <CheckCircle2 className="size-3" />
            {fromEnv ? 'Set via .env' : `Saved (${status.masked})`}
          </Badge>
        )}
      </div>
      <Input
        id={id}
        type={fromEnv ? 'text' : type}
        value={fromEnv ? '' : value}
        onChange={(e) => onChange(e.target.value)}
        disabled={fromEnv}
        placeholder={fromEnv ? 'Managed by your environment variables' : (placeholder ?? (status?.configured ? 'Leave blank to keep the saved value' : ''))}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
