import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { HEARTBEAT_MIN_WRITE_GAP_MINUTES } from '@/lib/screenConnection'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// Heartbeat of a public display page: "this screen's page is running and reaches the server".
//
// - Public (the TV has no login), so it can only set Screen.lastSeenAt to the server's time. It
//   never reads or changes configuration or content, and the reply is always an empty 204, whether
//   or not anything was stored (it reveals nothing about the screen or the school).
// - One SQL statement, no read first: it writes only for an existing, active screen of an active
//   school, and only when the stored report is older than HEARTBEAT_MIN_WRITE_GAP_MINUTES, so a
//   screen causes at most about one write an hour whatever it sends (reloads, many open tabs).
// - Server time in UTC: the column is a TIMESTAMP without time zone, which Prisma reads as UTC;
//   plain NOW() would be converted to the database session's time zone (e.g. Asia/Jerusalem).
// - Screen.updatedAt is deliberately not touched (a heartbeat is not an edit).
// - A small in-memory gate also drops repeats of the same id within a minute before the database.
const ID = /^[a-z0-9]{20,40}$/
const GATE_MS = 60_000
const recent = new Map<string, number>()

const noContent = () => new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!ID.test(id)) return noContent()
  const now = Date.now()
  const last = recent.get(id)
  if (last !== undefined && now - last < GATE_MS) return noContent()
  if (recent.size > 5_000) recent.clear()
  recent.set(id, now)
  try {
    await db.$executeRaw`
      UPDATE "screens" AS s SET "lastSeenAt" = (NOW() AT TIME ZONE 'UTC')
      WHERE s."id" = ${id} AND s."active" = TRUE
        AND (s."lastSeenAt" IS NULL OR s."lastSeenAt" < (NOW() AT TIME ZONE 'UTC') - make_interval(mins => ${HEARTBEAT_MIN_WRITE_GAP_MINUTES}::int))
        AND EXISTS (SELECT 1 FROM "schools" AS sc WHERE sc."id" = s."schoolId" AND sc."active" = TRUE)`
  } catch (e) {
    // The display ignores the reply; only the error type is logged.
    console.error(`Heartbeat failed: ${e instanceof Error ? e.name : typeof e}`)
  }
  return noContent()
}
