import { createHash } from 'crypto'
import { db } from '@/lib/db'

// Login-attempt limiting, stored in the database (the existing pairing_rate_limits table, keys
// prefixed "login:"), so it holds across restarts and several app instances without a schema
// change. It is keyed by the account (normalized e-mail, hashed), not by IP address: on the
// hosting proxy chain the client IP cannot be trusted, and a per-account limit cannot be
// bypassed by rotating addresses. Unknown e-mails are counted the same way, so the response
// never reveals whether an account exists.
//
// Every attempt is counted atomically BEFORE the password is checked (one INSERT … ON CONFLICT
// statement), so parallel requests cannot all slip past the limit. A successful login clears
// the counter.
//
// Trade-off: someone who knows an address can keep that account locked by failing on purpose;
// the lock only lasts until the window ends.

export const LOGIN_MAX_ATTEMPTS = 8
export const LOGIN_WINDOW_MS = 15 * 60_000

const keyFor = (email: string) => 'login:' + createHash('sha256').update(email.trim().toLowerCase()).digest('hex')

/**
 * Counts one login attempt for this account and returns true when it is over the limit (the
 * password must then not be checked). Fails open: a problem with the limiter must never lock
 * everybody out.
 */
export async function loginAttemptBlocked(email: string, now = new Date()): Promise<boolean> {
  const expired = new Date(now.getTime() - LOGIN_WINDOW_MS)
  try {
    const rows = await db.$queryRaw<{ count: number }[]>`
      INSERT INTO "pairing_rate_limits" ("key", "count", "windowStart")
      VALUES (${keyFor(email)}, 1, ${now})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "pairing_rate_limits"."windowStart" < ${expired} THEN 1 ELSE "pairing_rate_limits"."count" + 1 END,
        "windowStart" = CASE WHEN "pairing_rate_limits"."windowStart" < ${expired} THEN ${now} ELSE "pairing_rate_limits"."windowStart" END
      RETURNING "count"`
    // Keep the table small: occasionally drop login windows that have ended.
    if (Math.random() < 0.02) {
      await db.pairingRateLimit.deleteMany({ where: { key: { startsWith: 'login:' }, windowStart: { lt: expired } } })
    }
    return (rows[0]?.count ?? 0) > LOGIN_MAX_ATTEMPTS
  } catch (e) {
    console.error('Login rate limit failed:', e)
    return false
  }
}

export async function clearLoginAttempts(email: string): Promise<void> {
  try {
    await db.pairingRateLimit.deleteMany({ where: { key: keyFor(email) } })
  } catch (e) {
    console.error('Login rate limit reset failed:', e)
  }
}
