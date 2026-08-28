import { handleError, ok } from '@/lib/api'
import { requireAdmin } from '@/lib/auth'
import { getAdminEmail, getEmailProvider, sendToAdmin } from '@/lib/email'
import { getPreferences } from '@/lib/settings'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** POST /api/settings/test-email — sends (or logs) a test message to the admin address. */
export async function POST() {
  try {
    await requireAdmin()
    const prefs = await getPreferences()
    const provider = await getEmailProvider()
    const to = await getAdminEmail()

    const result = await sendToAdmin({
      subject: `[${prefs.appName}] Test email`,
      html: `<div style="font-family:sans-serif;padding:16px">
               <h2 style="margin:0 0 8px">Your email setup works ✅</h2>
               <p style="margin:0;color:#374151">This test was sent from ${prefs.appName} using the <strong>${provider.name}</strong> provider.</p>
             </div>`,
      text: `Your email setup works.\n\nThis test was sent from ${prefs.appName} using the ${provider.name} provider.`,
    })

    return ok({ ...result, to, providerName: provider.name })
  } catch (err) {
    return handleError(err)
  }
}
