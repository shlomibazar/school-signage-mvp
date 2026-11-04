// src/app/api/screens/[id]/sections/[sectionId]/content/[itemId]/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, HttpError } from '@/lib/apiErrors'
import { Prisma } from '@prisma/client'
import { editorAnnouncementSettings } from '@/lib/announcementMerge'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { toISOStringOrNull } from '@/lib/utils'
import { galleryBelongsToSchool, contentSettingsBelongToSchool } from '@/lib/schoolScope'

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
  // Strict school scope: a non-SUPER_ADMIN user without a school matches nothing.
  return db.contentItem.findFirst({
    where: {
      id: itemId,
      sectionId,
      section: {
        screenId,
        screen: isSuperAdmin ? undefined : { schoolId: schoolId ?? '__none__' },
      },
    },
    include: { section: { select: { screen: { select: { schoolId: true } } } } },
  })
}

// Scheduling fields: HH:mm times and parseable dates; empty values mean "not set".
const timeField = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/).or(z.literal("")).transform(v => v || null).nullable().optional()
const dateField = z.string().refine(v => !v || !Number.isNaN(Date.parse(v)), 'Invalid date').transform(v => v || null).nullable().optional()

const UpdateSchema = z.object({
  active:          z.boolean().optional(),
  startDate:       dateField,
  endDate:         dateField,
  startTime:       timeField,
  endTime:         timeField,
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
  settings:        z.record(z.string(), z.unknown()).nullable().optional(),
  // Announcement ids the client loaded; its changes are merged into the stored list (see announcementMerge).
  baseAnnouncementIds: z.array(z.string().max(64)).max(500).optional(),
})

// ── PUT ───────────────────────────────────────────────────
export async function PUT(
  req: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string; sectionId: string; itemId: string }> },
) {
  const params = await paramsPromise;
  try {
    const user = await requireRole('EDITOR')

    const existing = await resolveItem(
      params.itemId, params.sectionId, params.id,
      user.schoolId, user.role === 'SUPER_ADMIN',
    )
    if (!existing) return apiError('Content item not found', 404)

    const body   = await req.json().catch(() => null)
    if (body === null) return apiError('Invalid JSON', 400)
    const parsed = UpdateSchema.parse(body)
    // Checked before the update: the gallery must belong to this screen's school.
    if (parsed.galleryId && !(await galleryBelongsToSchool(parsed.galleryId, existing.section.screen.schoolId)))
      return apiError('Gallery not found', 400)
    // Folder, image and announcement ids in settings must also belong to the screen's school.
    if (!(await contentSettingsBelongToSchool(parsed.settings as Record<string, unknown> | null | undefined, existing.section.screen.schoolId)))
      return apiError('Invalid content references', 400)

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
    // Settings are written under a row lock; an announcement list is merged with the stored one.
    const item = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM content_items WHERE id = ${params.itemId} FOR UPDATE`
      if (parsed.settings !== undefined) {
        const stored = await tx.contentItem.findUnique({ where: { id: params.itemId }, select: { contentType: true, settings: true } })
        const merged = editorAnnouncementSettings(stored, stored?.contentType ?? '', parsed.settings, parsed.baseAnnouncementIds)
        if ('conflict' in merged) throw new HttpError(409, 'רשימת ההודעות של האזור השתנתה. טענו מחדש ונסו שוב.')
        data.settings = merged.settings === null ? Prisma.DbNull : merged.settings
      }
      return tx.contentItem.update({ where: { id: params.itemId }, data })
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
  } catch (e) {
    return errorResponse(e, 'PUT content item')
  }
}

// ── DELETE ────────────────────────────────────────────────
export async function DELETE(
  _req: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string; sectionId: string; itemId: string }> },
) {
  const params = await paramsPromise;
  try {
    const user = await requireRole('EDITOR')

    const existing = await resolveItem(
      params.itemId, params.sectionId, params.id,
      user.schoolId, user.role === 'SUPER_ADMIN',
    )
    if (!existing) return apiError('Content item not found', 404)

    await db.contentItem.delete({ where: { id: params.itemId } })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorResponse(e, 'DELETE content item')
  }
}
