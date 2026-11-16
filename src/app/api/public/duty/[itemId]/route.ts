import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { zonedParts } from '@/lib/zonedTime'
import { displayDay } from '@/lib/duty/rules'
import { publishedDay } from '@/lib/duty/service'

// Today's duty roster for a screen region (content type DUTY_ROSTER). Only the published snapshot is
// read, never the draft; absences and approved substitutions of today are applied over it. "Today"
// and the current period follow the school's time zone. A disabled region or screen returns nothing.
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params
  const headers = { 'Cache-Control': 'no-store' }
  try {
    const item = await db.contentItem.findUnique({ where: { id: itemId }, select: { contentType: true, active: true, section: { select: { screen: { select: { active: true, schoolId: true, school: { select: { timezone: true } } } } } } } })
    if (!item || item.contentType !== 'DUTY_ROSTER' || !item.active || !item.section.screen.active) return NextResponse.json({ data: null }, { headers })
    const { schoolId, school } = item.section.screen
    const now = zonedParts(new Date(), school.timezone)
    const day = await publishedDay(schoolId, now.date)
    if (!day) return NextResponse.json({ data: { date: now.date, timeZone: school.timezone, published: false, periods: [] } }, { headers })
    return NextResponse.json({ data: {
      date: now.date, timeZone: school.timezone, published: true, publishedAt: day.publishedAt,
      periods: displayDay(day.entries, now.date, now.minutes, day.absences, day.substitutions),
    } }, { headers })
  } catch {
    // The screen keeps what it already shows (the client keeps its last good copy).
    return NextResponse.json({ error: 'unavailable' }, { status: 503, headers })
  }
}
