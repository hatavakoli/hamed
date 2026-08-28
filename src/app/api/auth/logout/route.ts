import { cookies } from 'next/headers'
import { SESSION_COOKIE } from '@/lib/auth'
import { ok } from '@/lib/api'

/** POST /api/auth/logout */
export async function POST() {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
  return ok({ loggedOut: true })
}
