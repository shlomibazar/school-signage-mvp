// src/app/api/screens/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { errorResponse } from '@/lib/apiErrors'
import { screenNameSchema, generateSlug, isSlugConflict } from '@/lib/screenIdentity'

const CreateScreenSchema = z.object({
  // Trimmed first, so a name of spaces only is rejected (the admin form applies the same rule).
  name:        screenNameSchema,
  // Optional: the admin form no longer sends it, and a unique one is generated instead.
  slug:        z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, 'Slug חייב להכיל רק אותיות לועזיות קטנות, מספרים ומקף').optional(),
  orientation: z.enum(['LANDSCAPE', 'PORTRAIT']).default('LANDSCAPE'),
  // Optional: derived from the orientation when omitted (see screenDimensions).
  width:       z.number().int().min(1).max(10000).optional(),
  height:      z.number().int().min(1).max(10000).optional(),
  refreshSecs: z.number().int().min(300).max(900).default(600),
})

function apiError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

// Landscape 1920×1080, portrait 1080×1920 by default. Explicit sizes from API clients are
// kept, but oriented to match: the longer side is the width on landscape, the height on portrait.
function screenDimensions(orientation: 'LANDSCAPE' | 'PORTRAIT', width?: number, height?: number) {
  const long = Math.max(width ?? 1920, height ?? 1080)
  const short = Math.min(width ?? 1920, height ?? 1080)
  return orientation === 'PORTRAIT' ? { width: short, height: long } : { width: long, height: short }
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

    const requested = body && typeof body === 'object' ? (body as { schoolId?: unknown }).schoolId : undefined
    if (user.role === 'SUPER_ADMIN' && requested !== undefined && requested !== null && typeof requested !== 'string') {
      return apiError('מזהה בית ספר לא תקין', 400)
    }
    const schoolId =
      user.role === 'SUPER_ADMIN'
        ? ((requested as string | null | undefined) || user.schoolId)
        : user.schoolId

    if (!schoolId) return apiError('משתמש לא שייך לבית ספר', 400)
    // A SUPER_ADMIN may name any school: it must exist (instead of a foreign-key error later).
    if (user.role === 'SUPER_ADMIN' && !(await db.school.findUnique({ where: { id: schoolId }, select: { id: true } }))) {
      return apiError('בית הספר לא נמצא', 400)
    }

    // An explicitly requested slug must be free (unchanged behavior for API callers).
    if (validated.slug) {
      const existing = await db.screen.findUnique({ where: { slug: validated.slug } })
      if (existing) return apiError('כתובת ה-URL כבר בשימוש, בחר אחרת', 409)
    }

    const dimensions = screenDimensions(validated.orientation, validated.width, validated.height)
    const create = (slug: string) => db.screen.create({
      data: {
        ...validated,
        ...dimensions,
        slug,
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

    if (validated.slug) {
      try {
        return NextResponse.json({ data: await create(validated.slug) }, { status: 201 })
      } catch (err) {
        // Taken between the check and the insert.
        if (isSlugConflict(err)) return apiError('כתובת ה-URL כבר בשימוש, בחר אחרת', 409)
        throw err
      }
    }
    // Generated slug: the unique index is the source of truth, so retry on a collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return NextResponse.json({ data: await create(generateSlug(validated.name)) }, { status: 201 })
      } catch (err) {
        if (!isSlugConflict(err)) throw err
      }
    }
    return apiError('לא ניתן ליצור כתובת למסך כעת, נסה שוב', 503)
  } catch (err: any) {
    if (err?.message === 'Unauthorized') return apiError('נדרשת כניסה למערכת', 401)
    if (err?.message === 'Forbidden')    return apiError('אין הרשאה',          403)
    return errorResponse(err, 'POST /api/screens', 'שגיאת שרת')
  }
}
