import { PrismaClient } from '@prisma/client'

/**
 * A single PrismaClient per process. In dev, Next.js hot-reloads modules, so we
 * stash the client on globalThis to avoid opening a new pool on every reload.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

/** BigInt columns (view counts) are not JSON-serialisable by default. */
export function serialize<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)))
}
