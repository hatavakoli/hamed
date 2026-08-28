import { loadEnvFiles } from '../scripts/load-env'
loadEnvFiles()

import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../src/lib/crypto'

/**
 * Optional seed: creates the admin user, marks setup complete, and adds three
 * demo channels so a fresh install has something to look at.
 *
 * Run with:  npm run db:seed
 * Safe to run more than once (everything is an upsert).
 */

const prisma = new PrismaClient()

const DEMO_CHANNELS = [
  { input: '@demo-saas-builder', title: 'Demo SaaS Builder (mock)' },
  { input: '@demo-growth-lab', title: 'Demo Growth Lab (mock)' },
  { input: '@demo-indie-founder', title: 'Demo Indie Founder (mock)' },
]

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? 'admin@example.com').toLowerCase()
  const password = process.env.ADMIN_PASSWORD ?? 'changeme-admin'

  await prisma.user.upsert({
    where: { email },
    create: { email, name: 'Admin', role: 'ADMIN', passwordHash: hashPassword(password) },
    update: {},
  })
  console.log(`✔ Admin user ready: ${email}`)

  const prefs: Record<string, string> = {
    'pref:setupCompleted': 'true',
    'pref:adminEmail': email,
    'pref:appName': process.env.APP_NAME ?? 'YouTube Content Intelligence Monitor',
  }
  for (const [key, value] of Object.entries(prefs)) {
    await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } })
  }
  console.log('✔ Preferences initialised (setup marked complete)')

  // Only add demo channels when running against the mock adapters, so we never
  // invent fake channel IDs in a real installation.
  const mockMode = ['1', 'true', 'yes'].includes((process.env.MOCK_MODE ?? '').toLowerCase())
  if (!mockMode && process.env.YOUTUBE_API_KEY) {
    console.log('ℹ Skipping demo channels — a real YouTube API key is configured. Add your own channels in the UI.')
  } else {
    const { MockYouTubeClient } = await import('../src/lib/youtube/mock-client')
    const client = new MockYouTubeClient()
    for (const demo of DEMO_CHANNELS) {
      const resolved = await client.resolveChannel(demo.input)
      await prisma.channel.upsert({
        where: { youtubeChannelId: resolved.youtubeChannelId },
        create: {
          youtubeChannelId: resolved.youtubeChannelId,
          title: resolved.title,
          handle: resolved.handle,
          description: resolved.description,
          thumbnailUrl: resolved.thumbnailUrl,
          uploadsPlaylistId: resolved.uploadsPlaylistId,
          isActive: true,
        },
        update: {},
      })
      console.log(`✔ Demo channel ready: ${resolved.title}`)
    }
    console.log('\nNext: open the dashboard and press "Check all channels now".')
  }
}

main()
  .catch((err) => {
    console.error('Seed failed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
