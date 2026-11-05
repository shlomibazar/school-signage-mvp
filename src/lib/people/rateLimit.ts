import { db } from '@/lib/db'

// Limits changes to people per signed-in user, stored in the database like the login limiter (the
// existing pairing_rate_limits table, keys "people:<userId>"), so it holds across restarts and
// several app instances. Counted atomically before the change. Generous for real admin work
// (a person a few seconds); it only stops scripted bulk changes. Fails open (logged by type only).

export const PEOPLE_MAX_CHANGES = 300
export const PEOPLE_WINDOW_MS = 15 * 60_000

export async function peopleChangeBlocked(userId: string, now = new Date()): Promise<boolean> {
  const expired = new Date(now.getTime() - PEOPLE_WINDOW_MS)
  try {
    const rows = await db.$queryRaw<{ count: number }[]>`
      INSERT INTO "pairing_rate_limits" ("key", "count", "windowStart")
      VALUES (${'people:' + userId}, 1, ${now})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "pairing_rate_limits"."windowStart" < ${expired} THEN 1 ELSE "pairing_rate_limits"."count" + 1 END,
        "windowStart" = CASE WHEN "pairing_rate_limits"."windowStart" < ${expired} THEN ${now} ELSE "pairing_rate_limits"."windowStart" END
      RETURNING "count"`
    if (Math.random() < 0.02) await db.pairingRateLimit.deleteMany({ where: { key: { startsWith: 'people:' }, windowStart: { lt: expired } } })
    return (rows[0]?.count ?? 0) > PEOPLE_MAX_CHANGES
  } catch (e) {
    console.error(`People rate limit failed: ${e instanceof Error ? e.name : typeof e}`)
    return false
  }
}
