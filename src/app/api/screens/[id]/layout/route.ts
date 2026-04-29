// src/app/api/screens/[id]/layout/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { distributeWidths } from '@/lib/utils'

const LayoutSchema = z.object({
  layout: z.object({
    headerEnabled:       z.boolean(),
    headerShowLogo:      z.boolean(),
    headerShowTitle:     z.boolean(),
    headerShowClock:     z.boolean(),
    headerShowDate:      z.boolean(),
    headerShowHebDate:   z.boolean(),
    headerShowWeather:   z.boolean(),
    headerScrollText:    z.string().nullable(),
    mainSections:        z.number().int().min(1).max(3),
    footerEnabled:       z.boolean(),
    footerTicker:        z.string().nullable(),
    footerShowSchoolName:z.boolean(),
    footerShowClock:     z.boolean(),
    bgColor:             z.string().nullable(),
    bgImageUrl:          z.string().nullable(),
  }),
  sections: z.array(z.object({
    position: z.number().int(),
    widthPct: z.number().int().min(1).max(100),
  })),
})

function apiError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireRole('EDITOR')

    // Find screen — SUPER_ADMIN can edit any screen
    const screen = await db.screen.findFirst({
      where: {
        id: params.id,
        ...(user.role !== 'SUPER_ADMIN' && user.schoolId
          ? { schoolId: user.schoolId }
          : {}),
      },
    })
    if (!screen) return apiError('מסך לא נמצא', 404)

    const body = await req.json()
    const { layout, sections } = LayoutSchema.parse(body)

    // Enforce correct widthPct distribution (fix rounding)
    const correctedWidths = distributeWidths(sections.length)
    const correctedSections = sections.map((s, i) => ({
      ...s,
      widthPct: correctedWidths[i] ?? s.widthPct,
    }))

    await db.$transaction(async tx => {
      // Upsert layout
      await tx.screenLayout.upsert({
        where:  { screenId: params.id },
        update: layout,
        create: { screenId: params.id, ...layout },
      })

      // Sync sections: delete positions that no longer exist
      const incomingPositions = correctedSections.map(s => s.position)
      await tx.screenSection.deleteMany({
        where: {
          screenId: params.id,
          position: { notIn: incomingPositions },
        },
      })

      // Upsert remaining sections
      for (const section of correctedSections) {
        await tx.screenSection.upsert({
          where:  { screenId_position: { screenId: params.id, position: section.position } },
          update: { widthPct: section.widthPct },
          create: { screenId: params.id, position: section.position, widthPct: section.widthPct },
        })
      }
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    if (err.message === 'Unauthorized') return apiError('נדרשת כניסה למערכת', 401)
    if (err.message === 'Forbidden')    return apiError('אין הרשאה',          403)
    if (err instanceof z.ZodError)      return NextResponse.json({ error: err.errors }, { status: 400 })
    console.error('PUT /api/screens/[id]/layout', err)
    return apiError('שגיאת שרת', 500)
  }
}
