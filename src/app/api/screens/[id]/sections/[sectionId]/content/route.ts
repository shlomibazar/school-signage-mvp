// src/app/api/screens/[id]/sections/[sectionId]/content/route.ts
// GET  – fetch the single content item for this section
// POST – create (or replace) the content item for this section

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { toISOStringOrNull } from '@/lib/utils'

function apiError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

// Validate the section belongs to the screen and the screen belongs to the school
async function resolveSection(
  screenId: string,
  sectionId: string,
  schoolId: string | null,
  isSuperAdmin: boolean,
) {
  return db.screenSection.findFirst({
    where: {
      id: sectionId,
      screenId,
      screen: isSuperAdmin || !schoolId ? undefined : { schoolId },
    },
  })
}

const ContentSchema = z.object({
  contentType: z.enum([
    'TEXT', 'IMAGE_GALLERY', 'VIDEO', 'CLOCK', 'DATE',
    'WEATHER', 'RSS_FEED', 'TIMETABLE', 'EVENTS',
    'BIRTHDAYS', 'ANNOUNCEMENT', 'EMPTY',
  ]),
  active:          z.boolean().default(true),
  // Scheduling
  startDate:       z.string().nullable().optional(),
  endDate:         z.string().nullable().optional(),
  startTime:       z.string().nullable().optional(),
  endTime:         z.string().nullable().optional(),
  daysOfWeek:      z.array(z.number().int().min(0).max(6)).default([]),
  // Text
  textContent:     z.string().nullable().optional(),
  textColor:       z.string().nullable().optional(),
  bgColor:         z.string().nullable().optional(),
  fontSize:        z.number().int().nullable().optional(),
  // Gallery
  galleryId:       z.string().nullable().optional(),
  slideDuration:   z.number().int().min(1).max(60).default(5),
  transitionStyle: z.string().default('fade'),
  // Video
  videoUrl:        z.string().nullable().optional(),
  videoLoop:       z.boolean().default(true),
  videoMuted:      z.boolean().default(true),
  // RSS
  rssUrl:          z.string().nullable().optional(),
  rssMaxItems:     z.number().int().min(1).max(20).default(5),
  // Weather
  weatherCity:     z.string().nullable().optional(),
  weatherUnits:    z.string().default('metric'),
})

// ── GET ──────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; sectionId: string } },
) {
  try {
    const user = await requireRole('VIEWER')
    const section = await resolveSection(
      params.id, params.sectionId,
      user.schoolId, user.role === 'SUPER_ADMIN',
    )
    if (!section) return apiError('Section not found', 404)

    const item = await db.contentItem.findFirst({
      where: { sectionId: params.sectionId },
      orderBy: { createdAt: 'asc' },
      include: { gallery: { include: { files: { where: { hidden: false } } } } },
    })

    if (!item) return NextResponse.json({ data: null })

    return NextResponse.json({
      data: {
        ...item,
        startDate: toISOStringOrNull(item.startDate),
        endDate:   toISOStringOrNull(item.endDate),
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      },
    })
  } catch (err: any) {
    if (err.message === 'Unauthorized') return apiError('Unauthorized', 401)
    if (err.message === 'Forbidden')    return apiError('Forbidden', 403)
    console.error('GET content', err)
    return apiError('Server error', 500)
  }
}

// ── POST (create / replace) ───────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; sectionId: string } },
) {
  try {
    const user = await requireRole('EDITOR')
    const section = await resolveSection(
      params.id, params.sectionId,
      user.schoolId, user.role === 'SUPER_ADMIN',
    )
    if (!section) return apiError('Section not found', 404)

    const body   = await req.json()
    const parsed = ContentSchema.parse(body)

    // One item per section: delete existing first
    await db.contentItem.deleteMany({ where: { sectionId: params.sectionId } })

    const item = await db.contentItem.create({
      data: {
        sectionId:       params.sectionId,
        contentType:     parsed.contentType,
        active:          parsed.active,
        priority:        0,
        startDate:       parsed.startDate ? new Date(parsed.startDate) : null,
        endDate:         parsed.endDate   ? new Date(parsed.endDate)   : null,
        startTime:       parsed.startTime  ?? null,
        endTime:         parsed.endTime    ?? null,
        daysOfWeek:      parsed.daysOfWeek,
        textContent:     parsed.textContent  ?? null,
        textColor:       parsed.textColor    ?? null,
        bgColor:         parsed.bgColor      ?? null,
        fontSize:        parsed.fontSize     ?? null,
        galleryId:       parsed.galleryId    ?? null,
        slideDuration:   parsed.slideDuration,
        transitionStyle: parsed.transitionStyle,
        videoUrl:        parsed.videoUrl     ?? null,
        videoLoop:       parsed.videoLoop,
        videoMuted:      parsed.videoMuted,
        rssUrl:          parsed.rssUrl       ?? null,
        rssMaxItems:     parsed.rssMaxItems,
        weatherCity:     parsed.weatherCity  ?? null,
        weatherUnits:    parsed.weatherUnits,
      },
    })

    return NextResponse.json({
      data: {
        ...item,
        startDate: toISOStringOrNull(item.startDate),
        endDate:   toISOStringOrNull(item.endDate),
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      },
    }, { status: 201 })
  } catch (err: any) {
    if (err.message === 'Unauthorized') return apiError('Unauthorized', 401)
    if (err.message === 'Forbidden')    return apiError('Forbidden', 403)
    if (err instanceof z.ZodError)      return NextResponse.json({ error: err.errors }, { status: 400 })
    console.error('POST content', err)
    return apiError('Server error', 500)
  }
}
