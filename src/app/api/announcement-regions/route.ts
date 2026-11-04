import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { listScreenRegions } from '@/lib/announcementRegions'
import { errorResponse } from '@/lib/apiErrors'

export const dynamic = 'force-dynamic'

// Screens of the user's school with their announcement regions, for "where to display".
// Only the user's own (home) school: announcements are always created in it.
export async function GET() {
  try {
    const user = await requireRole('VIEWER')
    if (!user.schoolId) return NextResponse.json({ data: [] })
    const screens = await listScreenRegions([user.schoolId])
    return NextResponse.json({ data: screens.map(({ schoolId: _school, ...s }) => s) }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    return errorResponse(e, 'Announcement regions')
  }
}
