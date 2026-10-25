// src/app/api/screens/[id]/sections/[sectionId]/content/[itemId]/route.ts

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
  settings:        z.record(z.unknown()).nullable().optional(),
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

    const data: Record<string, unknown> = {}
    if (parsed.active          !== undefined) data.active          = parsed.active
    if (parsed.startDate       !== undefined) data.startDate       = parsed.startDate ? new Date(parsed.startDate) : null
    if (parsed.endDate         !== undefined) data.endDate         = parsed.endDate   ? new Date(parsed.endDate)   : null
    if (parsed.startTime       !== undefined) data.startTime       = parsed.startTime
    if (parsed.endTime         !== undefined) data.endTime         = parsed.endTime
    if (parsed.daysOfWeek      !== undefined) data.daysOfWeek      = parsed.daysOfWeek
    if (parsed.textContent     !== undefined) data.textContent     = parsed.textContent
    if (parsed.textColor       !== undefined) data.textColor       = parsed.textColor
    if (parsed.bgColor         !== undefined) data.bgColor         = parsed.bgColor
    if (parsed.fontSize        !== undefined) data.fontSize        = parsed.fontSize
    if (parsed.galleryId       !== undefined) data.galleryId       = parsed.galleryId
    if (parsed.slideDuration   !== undefined) data.slideDuration   = parsed.slideDuration
    if (parsed.transitionStyle !== undefined) data.transitionStyle = parsed.transitionStyle
    if (parsed.videoUrl        !== undefined) data.videoUrl        = parsed.videoUrl
    if (parsed.videoLoop       !== undefined) data.videoLoop       = parsed.videoLoop
    if (parsed.videoMuted      !== undefined) data.videoMuted      = parsed.videoMuted
    if (parsed.rssUrl          !== undefined) data.rssUrl          = parsed.rssUrl
    if (parsed.rssMaxItems     !== undefined) data.rssMaxItems     = parsed.rssMaxItems
    if (parsed.weatherCity     !== undefined) data.weatherCity     = parsed.weatherCity
    if (parsed.weatherUnits    !== undefined) data.weatherUnits    = parsed.weatherUnits
    if (parsed.settings        !== undefined) data.settings        = parsed.settings

    const item = await db.contentItem.update({
      where: { id: params.itemId },
      data,
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
