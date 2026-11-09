import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { errorResponse } from '@/lib/apiErrors'
import { screenNameSchema, generateSlug, isSlugConflict } from '@/lib/screenIdentity'

// Duplicate a screen into the same school, as a new INACTIVE screen (it cannot go live by surprise).
//
// Copied: size and orientation, refresh interval, layout (design, header, footer), every region
// with its background, its content items (type, schedule, settings) and the announcement
// assignments of its regions, and the operating hours.
// Shared, not copied: galleries/folders, media files, announcements and birthday people are
// referenced by id exactly as in the original.
// Not copied: slug (new public URL), short code, pairing codes, last connection report, snapshot.
//
// The source is read and the copy written in one transaction; the original is only read.
const Schema = z.object({ name: screenNameSchema })
type Tx = Prisma.TransactionClient

const json = (v: Prisma.JsonValue | null) => (v === null ? Prisma.DbNull : (v as Prisma.InputJsonValue))

async function copyScreen(tx: Tx, sourceId: string, schoolScope: { schoolId?: string }, name: string, slug: string) {
  const src = await tx.screen.findFirst({
    where: { id: sourceId, ...schoolScope },
    include: { layout: true, operatingSchedule: true, announcements: true, sections: { orderBy: { position: 'asc' }, include: { contentItems: true } } },
  })
  if (!src) return null
  const { id: _layoutId, screenId: _layoutScreen, ...layout } = src.layout ?? ({} as NonNullable<typeof src.layout>)
  const created = await tx.screen.create({
    data: {
      schoolId: src.schoolId, name, slug, active: false,
      orientation: src.orientation, width: src.width, height: src.height, refreshSecs: src.refreshSecs,
      ...(src.layout ? { layout: { create: layout } } : {}),
      sections: {
        create: src.sections.map(s => ({
          position: s.position, widthPct: s.widthPct, background: json(s.background),
          contentItems: {
            create: s.contentItems.map(({ id: _id, sectionId: _s, createdAt: _c, updatedAt: _u, settings, ...item }) => ({ ...item, settings: json(settings) })),
          },
        })),
      },
      ...(src.operatingSchedule ? { operatingSchedule: { create: {
        enabled: src.operatingSchedule.enabled, startTime: src.operatingSchedule.startTime, endTime: src.operatingSchedule.endTime,
        days: src.operatingSchedule.days, standbyMode: src.operatingSchedule.standbyMode,
      } } } : {}),
    },
    select: { id: true, name: true, slug: true },
  })
  if (src.announcements.length) {
    await tx.announcementScreen.createMany({ data: src.announcements.map(a => ({ announcementId: a.announcementId, screenId: created.id, sectionPosition: a.sectionPosition })) })
  }
  return created
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Duplicating creates a screen: EDITOR and up, like "מסך חדש".
    const user = await requireRole('EDITOR')
    const { id } = await params
    const parsed = Schema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'שם לא תקין' }, { status: 400 })
    const schoolScope = user.role === 'SUPER_ADMIN' ? {} : { schoolId: user.schoolId ?? '__none__' }
    // A generated slug can collide (unique index): the whole copy is retried with a new one.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const created = await db.$transaction(tx => copyScreen(tx, id, schoolScope, parsed.data.name, generateSlug(parsed.data.name)), { timeout: 20_000 })
        if (!created) return NextResponse.json({ error: 'המסך לא נמצא' }, { status: 404 })
        return NextResponse.json({ data: created }, { status: 201 })
      } catch (err) {
        if (!isSlugConflict(err)) throw err
      }
    }
    return NextResponse.json({ error: 'יצירת כתובת למסך נכשלה. נסו שוב.' }, { status: 500 })
  } catch (e) {
    return errorResponse(e, 'Screen duplicate', 'שכפול המסך נכשל')
  }
}
