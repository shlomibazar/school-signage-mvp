import { db } from '@/lib/db'

// Limits on the people endpoints per signed-in user, stored in the database like the login limiter
// (the existing pairing_rate_limits table, keys "<prefix>:<userId>"), so they hold across restarts
// and several app instances. Counted atomically before the work. Fail open (logged by type only).
//
// - people:        manual changes (300 per 15 minutes — a person every few seconds).
// - people-import: import requests (inspect, preview, apply; 60 per 15 minutes).

export const PEOPLE_MAX_CHANGES = 300
export const PEOPLE_IMPORT_MAX = 60
export const PEOPLE_WINDOW_MS = 15 * 60_000

async function limited(prefix: string, userId: string, max: number, now: Date): Promise<boolean> {
  const expired = new Date(now.getTime() - PEOPLE_WINDOW_MS)
  try {
    const rows = await db.$queryRaw<{ count: number }[]>`
      INSERT INTO "pairing_rate_limits" ("key", "count", "windowStart")
      VALUES (${prefix + ':' + userId}, 1, ${now})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "pairing_rate_limits"."windowStart" < ${expired} THEN 1 ELSE "pairing_rate_limits"."count" + 1 END,
        "windowStart" = CASE WHEN "pairing_rate_limits"."windowStart" < ${expired} THEN ${now} ELSE "pairing_rate_limits"."windowStart" END
      RETURNING "count"`
    if (Math.random() < 0.02) await db.pairingRateLimit.deleteMany({ where: { key: { startsWith: prefix + ':' }, windowStart: { lt: expired } } })
    return (rows[0]?.count ?? 0) > max
  } catch (e) {
    console.error(`People rate limit failed: ${e instanceof Error ? e.name : typeof e}`)
    return false
  }
}

export const peopleChangeBlocked = (userId: string, now = new Date()) => limited('people', userId, PEOPLE_MAX_CHANGES, now)
export const peopleImportBlocked = (userId: string, now = new Date()) => limited('people-import', userId, PEOPLE_IMPORT_MAX, now)
