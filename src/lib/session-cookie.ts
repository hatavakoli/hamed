/**
 * Kept in its own module with ZERO Node imports.
 *
 * `src/middleware.ts` runs on the Edge runtime and cannot bundle node:crypto,
 * so it imports the cookie name from here rather than from lib/auth.
 */
export const SESSION_COOKIE = 'ycim_session'
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days
