// src/app/api/screens/route.ts
import { randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'

const CreateScreenSchema = z.object({
  name:        z.string().min(2).max(100),
  // Optional: the admin form no longer sends it, and a unique one is generated instead.
  slug:        z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, 'Slug חייב להכיל רק אותיות לועזיות קטנות, מספרים ומקף').optional(),
  orientation: z.enum(['LANDSCAPE', 'PORTRAIT']).default('LANDSCAPE'),
  width:       z.number().int().default(1920),
  height:      z.number().int().default(1080),
  refreshSecs: z.number().int().min(300).max(900).default(600),
})

function apiError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

// Matches /^[a-z0-9-]+$/ and 2–50 chars. Latin names keep a readable prefix (Hebrew names
// fall back to "screen"); the random suffix keeps public URLs unique and hard to guess.
function generateSlug(name: string): string {
  const base = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 30).replace(/-$/, '')
  return `${base.length >= 2 ? base : 'screen'}-${randomBytes(4).toString('hex')}`
}

const isSlugConflict = (err: any) =>
  err?.code === 'P2002' && [err?.meta?.target].flat().some((t: unknown) => String(t).includes('slug'))

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

    // An explicitly requested slug must be free (unchanged behavior for API callers).
    if (validated.slug) {
      const existing = await db.screen.findUnique({ where: { slug: validated.slug } })
      if (existing) return apiError('כתובת ה-URL כבר בשימוש, בחר אחרת', 409)
    }

    const create = (slug: string) => db.screen.create({
      data: {
        ...validated,
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
    if (err.message === 'Unauthorized') return apiError('נדרשת כניסה למערכת', 401)
    if (err.message === 'Forbidden')    return apiError('אין הרשאה',          403)
    if (err instanceof z.ZodError)      return NextResponse.json({ error: err.issues }, { status: 400 })
    console.error('POST /api/screens', err)
    return apiError('שגיאת שרת', 500)
  }
}
