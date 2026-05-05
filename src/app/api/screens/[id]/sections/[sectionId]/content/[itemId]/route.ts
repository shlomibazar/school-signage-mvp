// src/app/api/screens/[id]/sections/[sectionId]/content/[itemId]/route.ts
// PUT    – update a content item
// DELETE – remove a content item (section becomes empty)

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { toISOStringOrNull } from '@/lib/utils'

function apiError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

async function resolveItem(
  itemId: string,
  sectionId: string,
  screenId: string,
  schoolId: string | null,
  isSuperAdmin: boolean,
) {
  return db.contentItem.findFirst({
    where: {
      id: itemId,
      sectionId,
      section: {
        screenId,
        screen: isSuperAdmin || !schoolId ? undefined : { schoolId },
      },
    },
  })
}

const UpdateSchema = z.object({
  active:          z.boolean().optional(),
  startDate:       z.string().nullable().optional(),
  endDate:         z.string().nullable().optional(),
  startTime:       z.string().nullable().optional(),
  endTime:         z.string().nullable().optional(),
  daysOfWeek:      z.array(z.number().int().min(0).max(6)).optional(),
  textContent:     z.string().nullable().optional(),
  textColor:       z.string().nullable().optional(),
  bgColor:         z.string().nullable().optional(),
  fontSize:        z.number().int().nullable().optional(),
  galleryId:       z.string().nullable().optional(),
  slideDuration:   z.number().int().min(1).max(60).optional(),
  transitionStyle: z.string().optional(),
  videoUrl:        z.string().nullable().optional(),
  videoLoop:       z.boolean().optional(),
  videoMuted:      z.boolean().optional(),
  rssUrl:          z.string().nullable().optional(),
  rssMaxItems:     z.number().int().min(1).max(20).optional(),
  weatherCity:     z.string().nullable().optional(),
  weatherUnits:    z.string().optional(),
})

// ── PUT ───────────────────────────────────────────────────
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string; sectionId: string; itemId: string } },
) {
  try {
    const user = await requireRole('EDITOR')

    const existing = await resolveItem(
      params.itemId, params.sectionId, params.id,
      user.schoolId, user.role === 'SUPER_ADMIN',
    )
    if (!existing) return apiError('Content item not found', 404)

    const body   = await req.json()
    const parsed = UpdateSchema.parse(body)

    const item = await db.contentItem.update({
      where: { id: params.itemId },
      data: {
        ...(parsed.active          !== undefined ? { active: parsed.active }               : {}),
        ...(parsed.startDate       !== undefined ? { startDate: parsed.startDate ? new Date(parsed.startDate) : null } : {}),
        ...(parsed.endDate         !== undefined ? { endDate:   parsed.endDate   ? new Date(parsed.endDate)   : null } : {}),
        ...(parsed.startTime       !== undefined ? { startTime: parsed.startTime }         : {}),
        ...(parsed.endTime         !== undefined ? { endTime:   parsed.endTime }           : {}),
        ...(parsed.daysOfWeek      !== undefined ? { daysOfWeek: parsed.daysOfWeek }       : {}),
        ...(parsed.textContent     !== undefined ? { textContent: parsed.textContent }     : {}),
        ...(parsed.textColor       !== undefined ? { textColor:   parsed.textColor }       : {}),
        ...(parsed.bgColor         !== undefined ? { bgColor:     parsed.bgColor }         : {}),
        ...(parsed.fontSize        !== undefined ? { fontSize:    parsed.fontSize }        : {}),
        ...(parsed.galleryId       !== undefined ? { galleryId:   parsed.galleryId }       : {}),
        ...(parsed.slideDuration   !== undefined ? { slideDuration: parsed.slideDuration } : {}),
        ...(parsed.transitionStyle !== undefined ? { transitionStyle: parsed.transitionStyle } : {}),
        ...(parsed.videoUrl        !== undefined ? { videoUrl:    parsed.videoUrl }        : {}),
        ...(parsed.videoLoop       !== undefined ? { videoLoop:   parsed.videoLoop }       : {}),
        ...(parsed.videoMuted      !== undefined ? { videoMuted:  parsed.videoMuted }      : {}),
        ...(parsed.rssUrl          !== undefined ? { rssUrl:      parsed.rssUrl }          : {}),
        ...(parsed.rssMaxItems     !== undefined ? { rssMaxItems: parsed.rssMaxItems }     : {}),
        ...(parsed.weatherCity     !== undefined ? { weatherCity: parsed.weatherCity }     : {}),
        ...(parsed.weatherUnits    !== undefined ? { weatherUnits: parsed.weatherUnits }   : {}),
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
    })
  } catch (err: any) {
    if (err.message === 'Unauthorized') return apiError('Unauthorized', 401)
    if (err.message === 'Forbidden')    return apiError('Forbidden', 403)
    if (err instanceof z.ZodError)      return NextResponse.json({ error: err.errors }, { status: 400 })
    console.error('PUT content item', err)
    return apiError('Server error', 500)
  }
}

// ── DELETE ────────────────────────────────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; sectionId: string; itemId: string } },
) {
  try {
    const user = await requireRole('EDITOR')

    const existing = await resolveItem(
      params.itemId, params.sectionId, params.id,
      user.schoolId, user.role === 'SUPER_ADMIN',
    )
    if (!existing) return apiError('Content item not found', 404)

    await db.contentItem.delete({ where: { id: params.itemId } })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    if (err.message === 'Unauthorized') return apiError('Unauthorized', 401)
    if (err.message === 'Forbidden')    return apiError('Forbidden', 403)
    console.error('DELETE content item', err)
    return apiError('Server error', 500)
  }
}
