import { NextRequest, NextResponse } from 'next/server'
import { errorResponse } from '@/lib/apiErrors'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { schoolWhere } from '@/lib/schoolScope'
import { normalizeBirthdayConfig } from '@/lib/birthdayDisplay'
import { birthdayListsFor, schoolGrades } from '@/lib/people/screenBirthdays'

export const runtime = 'nodejs'

// Editor support for birthday display settings (region and footer) of one screen:
// - grades: the grades active students of the screen's school have (for the grade filter);
// - list: what the public screen would show now for the given settings — the same public projection
//   the TV receives (display name, class, role, day/month), never more.
// EDITOR and up, own school only. Nothing is stored. Not cached.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole('EDITOR')
    const { id } = await params
    const screen = await db.screen.findFirst({ where: { id, ...schoolWhere(user) }, select: { schoolId: true, school: { select: { timezone: true } } } })
    if (!screen) return NextResponse.json({ error: 'מסך לא נמצא' }, { status: 404 })
    const q = req.nextUrl.searchParams
    const config = normalizeBirthdayConfig({
      audience: q.get('audience'), period: q.get('period'), nameFormat: q.get('nameFormat'),
      grades: (q.get('grades') ?? '').split(',').map(g => g.trim()).filter(Boolean),
    })
    const [[list], grades] = await Promise.all([
      birthdayListsFor(screen.schoolId, screen.school.timezone, [config]),
      schoolGrades(screen.schoolId),
    ])
    return NextResponse.json({ data: { list, grades, config } }, { headers: { 'Cache-Control': 'no-store, private' } })
  } catch (e) {
    return errorResponse(e, 'GET screen birthdays')
  }
}
