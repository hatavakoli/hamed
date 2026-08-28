import fs from 'node:fs'
import path from 'node:path'

/**
 * Tiny .env loader (no dotenv dependency).
 * Next.js loads .env automatically; standalone scripts like the worker do not.
 * Real environment variables always win over the file.
 */
export function loadEnvFiles(files = ['.env.local', '.env']) {
  for (const file of files) {
    const fullPath = path.resolve(process.cwd(), file)
    if (!fs.existsSync(fullPath)) continue
    const content = fs.readFileSync(fullPath, 'utf8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      if (process.env[key] === undefined) process.env[key] = value
    }
  }
}
