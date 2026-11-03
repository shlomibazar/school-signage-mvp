import { createHash } from 'crypto'
import { db } from '@/lib/db'

// Failed-login limiting, stored in the database (the existing pairing_rate_limits table, keys
// prefixed "login:"), so it holds across restarts and several app instances without a schema
// change. It is keyed by the account (normalized e-mail, hashed), not by IP address: on the
// hosting proxy chain the client IP cannot be trusted, and a per-account limit cannot be
// bypassed by rotating addresses. Unknown e-mails are counted the same way, so the response
// never reveals whether an account exists.
//
// Trade-off: someone who knows an address can keep that account locked by failing on purpose;
// the lock only lasts until the window ends, and a successful login clears the counter.

export const LOGIN_MAX_FAILURES = 8
export const LOGIN_WINDOW_MS = 15 * 60_000

const keyFor = (email: string) => 'login:' + createHash('sha256').update(email.trim().toLowerCase()).digest('hex')

/** True when this account has used up its failed attempts in the current window. */
export async function isLoginLocked(email: string, now = new Date()): Promise<boolean> {
  try {
    const row = await db.pairingRateLimit.findUnique({ where: { key: keyFor(email) } })
    return !!row && row.windowStart > new Date(now.getTime() - LOGIN_WINDOW_MS) && row.count >= LOGIN_MAX_FAILURES
  } catch (e) {
    // Fail open: a problem with the limiter must never lock everybody out.
    console.error('Login rate limit check failed:', e)
    return false
  }
}

export async function recordLoginFailure(email: string, now = new Date()): Promise<void> {
  const key = keyFor(email)
  const windowStart = new Date(now.getTime() - LOGIN_WINDOW_MS)
  try {
    await db.$transaction(async tx => {
      await tx.pairingRateLimit.upsert({ where: { key }, create: { key, count: 0, windowStart: now }, update: {} })
      await tx.pairingRateLimit.updateMany({ where: { key, windowStart: { lt: windowStart } }, data: { count: 0, windowStart: now } })
      await tx.pairingRateLimit.update({ where: { key }, data: { count: { increment: 1 } } })
    })
    // Keep the table small: drop login windows that ended long ago (cheap, rare rows).
    if (Math.random() < 0.05) {
      await db.pairingRateLimit.deleteMany({ where: { key: { startsWith: 'login:' }, windowStart: { lt: new Date(now.getTime() - 24 * 60 * 60_000) } } })
    }
  } catch (e) {
    console.error('Login rate limit update failed:', e)
  }
}

export async function clearLoginFailures(email: string): Promise<void> {
  try {
    await db.pairingRateLimit.deleteMany({ where: { key: keyFor(email) } })
  } catch (e) {
    console.error('Login rate limit reset failed:', e)
  }
}
