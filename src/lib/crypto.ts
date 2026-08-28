import crypto from 'node:crypto'
import { env } from './env'

/**
 * AES-256-GCM helpers used for secrets that the admin chooses to store in the
 * database (via the Setup/Settings pages) instead of in .env.
 *
 * The key is derived from NEXTAUTH_SECRET. If you rotate that secret, stored
 * secrets can no longer be decrypted -- re-enter them in Settings.
 */

function key(): Buffer {
  return crypto.createHash('sha256').update(env.NEXTAUTH_SECRET).digest()
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`
}

export function decryptSecret(payload: string): string | null {
  try {
    const [version, ivB64, tagB64, dataB64] = payload.split(':')
    if (version !== 'v1' || !ivB64 || !tagB64 || !dataB64) return null

    // Node's base64 decoder silently ignores trailing junk, so validate each
    // part round-trips exactly. Without this, appended characters would decode
    // to the original value instead of being rejected.
    const iv = decodeStrictBase64(ivB64)
    const tag = decodeStrictBase64(tagB64)
    const data = decodeStrictBase64(dataB64)
    if (!iv || !tag || !data) return null

    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

function decodeStrictBase64(value: string): Buffer | null {
  const buf = Buffer.from(value, 'base64')
  return buf.toString('base64') === value ? buf : null
}

/** Password hashing with Node's built-in scrypt -- no extra dependency needed. */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(password, salt, 64)
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split(':')
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, 'hex')
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length)
  return crypto.timingSafeEqual(expected, actual)
}

/** Constant-time string compare that never throws on length mismatch. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return crypto.timingSafeEqual(ab, bb)
}

/** Show `sk-abcd...wxyz` instead of the real key in the UI. */
export function maskSecret(secret?: string | null): string | null {
  if (!secret) return null
  if (secret.length <= 8) return '****'
  return `${secret.slice(0, 4)}…${secret.slice(-4)}`
}
