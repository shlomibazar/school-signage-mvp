// src/app/api/screens/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'

const CreateScreenSchema = z.object({
  name:        z.string().min(2).max(100),
  slug:        z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, 'Slug חייב להכיל רק אותיות לועזיות קטנות, מספרים ומקף'),
  orientation: z.enum(['LANDSCAPE', 'PORTRAIT']).default('LANDSCAPE'),
  width:       z.number().int().default(1920),
  height:      z.number().int().default(1080),
  refreshSecs: z.number().int().min(5).max(300).default(30),
})

function apiError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function GET() {
  try {
    const user = await requireRole('VIEWER')

    // SUPER_ADMIN can see all screens; other roles are scoped to their school
    const where = user.role === 'SUPER_ADMIN'
      ? {}
      : user.schoolId
        ? { schoolId: user.schoolId }
        : null

    if (where === null) return apiError('משתמש לא שייך לבית ספר', 400)

    const screens = await db.screen.findMany({
      where,
      include: { layout: true, _count: { select: { sections: true } } },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({ data: screens })
  } catch (err: any) {
    if (err.message === 'Unauthorized') return apiError('נדרשת כניסה למערכת', 401)
    if (err.message === 'Forbidden')    return apiError('אין הרשאה',          403)
    console.error('GET /api/screens', err)
    return apiError('שגיאת שרת', 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole('EDITOR')

    // SUPER_ADMIN can create in any school (must pass schoolId in body)
    // Other roles use their own schoolId
    const body      = await req.json()
    const validated = CreateScreenSchema.parse(body)

    const schoolId =
      user.role === 'SUPER_ADMIN'
        ? (body.schoolId ?? user.schoolId)
        : user.schoolId

    if (!schoolId) return apiError('משתמש לא שייך לבית ספר', 400)

    // Unique slug check
    const existing = await db.screen.findUnique({ where: { slug: validated.slug } })
    if (existing) return apiError('כתובת ה-URL כבר בשימוש, בחר אחרת', 409)

    const screen = await db.screen.create({
      data: {
        ...validated,
        schoolId,
        layout: {
          create: {
            headerEnabled:     true,
            footerEnabled:     true,
            mainSections:      1,
            footerShowSchoolName: true,
          },
        },
        sections: {
          create: [{ position: 0, widthPct: 100 }],
        },
      },
      include: { layout: true, sections: true },
    })

    return NextResponse.json({ data: screen }, { status: 201 })
  } catch (err: any) {
    if (err.message === 'Unauthorized') return apiError('נדרשת כניסה למערכת', 401)
    if (err.message === 'Forbidden')    return apiError('אין הרשאה',          403)
    if (err instanceof z.ZodError)      return NextResponse.json({ error: err.errors }, { status: 400 })
    console.error('POST /api/screens', err)
    return apiError('שגיאת שרת', 500)
  }
}
