import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Integration test touches an in-memory fake DB, so keep runs serial & predictable.
    sequence: { concurrent: false },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
