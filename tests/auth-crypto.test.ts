import { beforeAll, describe, expect, it } from 'vitest'

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = 'test-secret-for-unit-tests'
  process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test'
})

describe('secret encryption', () => {
  it('round-trips a value', async () => {
    const { encryptSecret, decryptSecret } = await import('@/lib/crypto')
    const secret = 'sk-ant-super-secret-value'
    const encrypted = encryptSecret(secret)
    expect(encrypted).not.toContain(secret)
    expect(encrypted.startsWith('v1:')).toBe(true)
    expect(decryptSecret(encrypted)).toBe(secret)
  })

  it('returns null for tampered ciphertext instead of throwing', async () => {
    const { encryptSecret, decryptSecret } = await import('@/lib/crypto')
    const encrypted = encryptSecret('value')
    expect(decryptSecret(`${encrypted}tampered`)).toBeNull()
    expect(decryptSecret('not-even-close')).toBeNull()
  })

  it('produces a different ciphertext each time (random IV)', async () => {
    const { encryptSecret } = await import('@/lib/crypto')
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'))
  })
})

describe('password hashing', () => {
  it('verifies the correct password and rejects a wrong one', async () => {
    const { hashPassword, verifyPassword } = await import('@/lib/crypto')
    const hash = hashPassword('correct horse battery staple')
    expect(hash).not.toContain('correct horse')
    expect(verifyPassword('correct horse battery staple', hash)).toBe(true)
    expect(verifyPassword('wrong password', hash)).toBe(false)
  })

  it('rejects a malformed stored hash', async () => {
    const { verifyPassword } = await import('@/lib/crypto')
    expect(verifyPassword('anything', 'garbage')).toBe(false)
  })
})

describe('secret masking', () => {
  it('never reveals the middle of a key', async () => {
    const { maskSecret } = await import('@/lib/crypto')
    expect(maskSecret('sk-ant-1234567890abcdef')).toBe('sk-a…cdef')
    expect(maskSecret('short')).toBe('****')
    expect(maskSecret(null)).toBeNull()
  })
})

describe('session tokens', () => {
  it('signs and verifies a session', async () => {
    const { createSessionToken, verifySessionToken } = await import('@/lib/auth')
    const token = createSessionToken('admin@example.com')
    const session = verifySessionToken(token)
    expect(session?.email).toBe('admin@example.com')
    expect(session?.role).toBe('ADMIN')
  })

  it('rejects a token with a tampered payload', async () => {
    const { createSessionToken, verifySessionToken } = await import('@/lib/auth')
    const token = createSessionToken('admin@example.com')
    const [, signature] = token.split('.')
    const forged = Buffer.from(JSON.stringify({ email: 'attacker@evil.com', role: 'ADMIN', exp: 9e9 })).toString('base64url')
    expect(verifySessionToken(`${forged}.${signature}`)).toBeNull()
  })

  it('rejects malformed and empty tokens', async () => {
    const { verifySessionToken } = await import('@/lib/auth')
    expect(verifySessionToken(undefined)).toBeNull()
    expect(verifySessionToken('')).toBeNull()
    expect(verifySessionToken('no-dot')).toBeNull()
  })

  it('rejects an expired session', async () => {
    const { verifySessionToken } = await import('@/lib/auth')
    const crypto = await import('node:crypto')
    const body = Buffer.from(JSON.stringify({ email: 'a@b.c', role: 'ADMIN', exp: 1 })).toString('base64url')
    const signature = crypto.createHmac('sha256', process.env.NEXTAUTH_SECRET!).update(body).digest('base64url')
    expect(verifySessionToken(`${body}.${signature}`)).toBeNull()
  })
})

describe('safe error messages', () => {
  it('redacts API keys from error text', async () => {
    const { safeErrorMessage } = await import('@/lib/logger')
    expect(safeErrorMessage(new Error('failed for key=AIzaSyTOPSECRET123'))).toBe('failed for key=***')
    expect(safeErrorMessage(new Error('Bearer sk-ant-abcdef123456'))).toContain('Bearer ***')
    expect(safeErrorMessage(new Error('bad sk-ant0123456789abcdef'))).toContain('***')
  })
})
