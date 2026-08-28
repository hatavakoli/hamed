import { createLogger, safeErrorMessage } from '../logger'
import { getPreferences, getSecret } from '../settings'
import { env } from '../env'

export * from './templates'

const log = createLogger('email')

export type SendEmailInput = {
  to: string
  subject: string
  html: string
  text: string
}

export type SendEmailResult = {
  ok: boolean
  provider: 'resend' | 'console'
  id?: string
  message: string
}

export interface EmailProvider {
  readonly name: 'resend' | 'console'
  send(input: SendEmailInput): Promise<SendEmailResult>
}

/** Resend REST API. No SDK dependency -- one POST. */
class ResendProvider implements EmailProvider {
  readonly name = 'resend' as const
  constructor(
    private apiKey: string,
    private from: string,
  ) {}

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: this.from,
          to: [input.to],
          subject: input.subject,
          html: input.html,
          text: input.text,
        }),
        signal: AbortSignal.timeout(20_000),
      })
      const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string }
      if (!res.ok) {
        return { ok: false, provider: 'resend', message: `Resend error ${res.status}: ${body.message ?? res.statusText}` }
      }
      return { ok: true, provider: 'resend', id: body.id, message: `Email sent to ${input.to}.` }
    } catch (err) {
      return { ok: false, provider: 'resend', message: safeErrorMessage(err) }
    }
  }
}

/** Development fallback: prints the whole email to the terminal. */
class ConsoleProvider implements EmailProvider {
  readonly name = 'console' as const
  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const divider = '─'.repeat(72)
    console.log(
      [
        '',
        divider,
        '📧  EMAIL (development mode — no Resend API key configured, nothing was sent)',
        divider,
        `To:      ${input.to}`,
        `Subject: ${input.subject}`,
        divider,
        input.text,
        divider,
        '',
      ].join('\n'),
    )
    return { ok: true, provider: 'console', message: `Email logged to the server terminal (would have gone to ${input.to}).` }
  }
}

export async function getEmailProvider(): Promise<EmailProvider> {
  if (env.MOCK_MODE) return new ConsoleProvider()
  const apiKey = await getSecret('RESEND_API_KEY')
  const from = (await getSecret('EMAIL_FROM')) ?? 'onboarding@resend.dev'
  if (!apiKey) return new ConsoleProvider()
  return new ResendProvider(apiKey, from)
}

/** Resolves the destination address: Settings value first, then ADMIN_EMAIL. */
export async function getAdminEmail(): Promise<string | null> {
  const prefs = await getPreferences().catch(() => null)
  return prefs?.adminEmail || env.ADMIN_EMAIL || null
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const provider = await getEmailProvider()
  const result = await provider.send(input)
  if (result.ok) log.info('Email delivered', { provider: result.provider, subject: input.subject })
  else log.error('Email failed', { provider: result.provider, message: result.message })
  return result
}

/** Sends to the configured admin. Never throws -- email must not break a job. */
export async function sendToAdmin(input: Omit<SendEmailInput, 'to'>): Promise<SendEmailResult> {
  const to = await getAdminEmail()
  if (!to) {
    log.warn('No admin email configured — skipping notification', { subject: input.subject })
    return { ok: false, provider: 'console', message: 'No admin email configured (set ADMIN_EMAIL or fill it in Settings).' }
  }
  try {
    return await sendEmail({ ...input, to })
  } catch (err) {
    const message = safeErrorMessage(err)
    log.error('Email send threw', { message })
    return { ok: false, provider: 'console', message }
  }
}
