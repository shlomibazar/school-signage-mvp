import { NextRequest, NextResponse } from 'next/server'
import { errorResponse } from '@/lib/apiErrors'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'

const schema = z.object({
  enabled: z.boolean(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  days: z.array(z.number().int().min(0).max(6)).max(7).refine(v => new Set(v).size === v.length),
  standbyMode: z.enum(['clock', 'message', 'logo']),
})
  // Days are required only while the schedule is on; a disabled schedule may keep an empty list.
  .refine(s => !s.enabled || s.days.length > 0, { message: 'יש לבחור לפחות יום פעילות אחד', path: ['days'] })

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole('SCHOOL_ADMIN')
    const parsed = schema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: 'הגדרות לא תקינות' }, { status: 400 })
    const { id } = await params
    const existing = await db.screen.findFirst({
      where: { id, ...(user.role === 'SUPER_ADMIN' ? {} : { schoolId: user.schoolId ?? '__none__' }) }, select: { id: true },
    })
    if (!existing) return NextResponse.json({ error: 'מסך לא נמצא' }, { status: 404 })
    const { enabled, startTime, endTime, days, standbyMode } = parsed.data
    await db.$executeRaw`
      INSERT INTO "ScreenOperatingSchedule" ("screenId", "enabled", "startTime", "endTime", "days", "standbyMode", "updatedAt")
      VALUES (${id}, ${enabled}, ${startTime}, ${endTime}, ${days}, ${standbyMode}, NOW())
      ON CONFLICT ("screenId") DO UPDATE SET
        "enabled" = EXCLUDED."enabled", "startTime" = EXCLUDED."startTime",
        "endTime" = EXCLUDED."endTime", "days" = EXCLUDED."days",
        "standbyMode" = EXCLUDED."standbyMode", "updatedAt" = NOW()
    `
    return NextResponse.json({ data: parsed.data })
  } catch (e) {
    return errorResponse(e, 'Screen schedule', 'שגיאת שרת')
  }
}
