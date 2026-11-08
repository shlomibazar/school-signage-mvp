// src/app/api/screens/[id]/sections/[sectionId]/content/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { errorResponse, HttpError } from '@/lib/apiErrors'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { validateExternalUrl, requestHosts } from '@/lib/externalUrlServer'
import { toISOStringOrNull } from '@/lib/utils'
import { Prisma } from '@prisma/client'
import { galleryBelongsToSchool, contentSettingsBelongToSchool } from '@/lib/schoolScope'
import { editorAnnouncementSettings } from '@/lib/announcementMerge'
import { normalizeBirthdayRegion } from '@/lib/birthdayDisplay'

function apiError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

async function resolveSection(
  screenId: string,
  sectionId: string,
  schoolId: string | null,
  isSuperAdmin: boolean,
) {
  // Strict school scope: a non-SUPER_ADMIN user without a school matches nothing.
  return db.screenSection.findFirst({
    where: {
      id: sectionId,
      screenId,
      screen: isSuperAdmin ? undefined : { schoolId: schoolId ?? '__none__' },
    },
    include: { screen: { select: { schoolId: true } } },
  })
}

// Scheduling fields: HH:mm times and parseable dates; empty values mean "not set".
const timeField = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/).or(z.literal("")).transform(v => v || null).nullable().optional()
const dateField = z.string().refine(v => !v || !Number.isNaN(Date.parse(v)), 'Invalid date').transform(v => v || null).nullable().optional()

const ContentSchema = z.object({
  contentType: z.enum([
    'TEXT', 'IMAGE_GALLERY', 'VIDEO', 'CLOCK', 'DATE',
    'WEATHER', 'RSS_FEED', 'TIMETABLE', 'EVENTS',
    'BIRTHDAYS', 'ANNOUNCEMENT', 'IFRAME', 'EMPTY',
  ]),
  active:          z.boolean().default(true),
  startDate:       dateField,
  endDate:         dateField,
  startTime:       timeField,
  endTime:         timeField,
  daysOfWeek:      z.array(z.number().int().min(0).max(6)).default([]),
  // Text / shared display
  textContent:     z.string().nullable().optional(),
  textColor:       z.string().nullable().optional(),
  bgColor:         z.string().nullable().optional(),
  // Within INT4 (larger values used to reach the database and fail with a 500).
  fontSize:        z.number().int().min(1).max(1000).nullable().optional(),
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
  // Flexible per-type settings JSON
  settings:        z.record(z.string(), z.unknown()).nullable().optional(),
  // Announcement ids the editor loaded; its changes are merged into the stored list (see announcementMerge).
  baseAnnouncementIds: z.array(z.string().max(64)).max(500).optional(),
})

// ── GET ──────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string; sectionId: string }> },
) {
  const params = await paramsPromise;
  try {
    const user    = await requireRole('VIEWER')
    const section = await resolveSection(
      params.id, params.sectionId,
      user.schoolId, user.role === 'SUPER_ADMIN',
    )
    if (!section) return apiError('Section not found', 404)

    const item = await db.contentItem.findFirst({
      where:   { sectionId: params.sectionId },
      orderBy: { createdAt: 'asc' },
      include: { gallery: { include: { files: { where: { hidden: false } } } } },
    })

    if (!item) return NextResponse.json({ data: null })

    return NextResponse.json({
      data: {
        ...item,
        // Never return another school's gallery files (defense in depth for older records).
        gallery: item.gallery && item.gallery.schoolId === section.screen.schoolId ? item.gallery : null,
        startDate: toISOStringOrNull(item.startDate),
        endDate:   toISOStringOrNull(item.endDate),
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      },
    })
  } catch (e) {
    return errorResponse(e, 'GET content')
  }
}

// ── POST (replace) ────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string; sectionId: string }> },
) {
  const params = await paramsPromise;
  try {
    const user    = await requireRole('EDITOR')
    const section = await resolveSection(
      params.id, params.sectionId,
      user.schoolId, user.role === 'SUPER_ADMIN',
    )
    if (!section) return apiError('Section not found', 404)

    const body   = await req.json().catch(() => null)
    if (body === null) return apiError('Invalid JSON', 400)
    const parsed = ContentSchema.parse(body)
    // Checked before any mutation: the gallery must belong to this screen's school.
    if (parsed.galleryId && !(await galleryBelongsToSchool(parsed.galleryId, section.screen.schoolId)))
      return apiError('Gallery not found', 400)
    // Folder, image and announcement ids in settings must also belong to the screen's school.
    if (!(await contentSettingsBelongToSchool(parsed.settings, section.screen.schoolId)))
      return apiError('Invalid content references', 400)
    // "אתר חיצוני": the URL is checked here (https, public host, not this app) and is the only
    // setting stored; nothing else of the request's settings is kept for this type.
    if (parsed.contentType === 'IFRAME') {
      const check = await validateExternalUrl(parsed.settings?.url, requestHosts(req.headers))
      if (!check.ok) return apiError(check.error, 400)
      parsed.settings = { url: check.url }
    }
    // "ימי הולדת": only the display settings are stored (audience, range, grades, name format, heading).
    // The people come from the central registry; names, classes or dates typed into a request (or a
    // legacy single-person card being re-saved) are never kept, nor a list attached for display.
    if (parsed.contentType === 'BIRTHDAYS') parsed.settings = normalizeBirthdayRegion(parsed.settings)

    const fields = {
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
    }

    // One item per section. The section and its item are locked, and the stored item is updated
    // in place (its id stays the same, so announcement assignments that refer to it stay valid).
    // An announcement list from the editor is merged with the stored one, never blindly replaced.
    const item = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM screen_sections WHERE id = ${params.sectionId} FOR UPDATE`
      await tx.$queryRaw`SELECT id FROM content_items WHERE "sectionId" = ${params.sectionId} ORDER BY id FOR UPDATE`
      const stored = await tx.contentItem.findMany({ where: { sectionId: params.sectionId }, orderBy: { createdAt: 'asc' } })
      const keep = stored[0]
      const merged = editorAnnouncementSettings(keep, parsed.contentType, parsed.settings, parsed.baseAnnouncementIds)
      if ('conflict' in merged) throw new HttpError(409, 'רשימת ההודעות של האזור השתנתה. טענו מחדש את העורך ונסו שוב.')
      const settings = merged.settings ? (merged.settings as Prisma.InputJsonValue) : Prisma.DbNull
      if (stored.length > 1) await tx.contentItem.deleteMany({ where: { sectionId: params.sectionId, id: { not: keep.id } } })
      return keep
        ? tx.contentItem.update({ where: { id: keep.id }, data: { ...fields, settings } })
        : tx.contentItem.create({ data: { sectionId: params.sectionId, ...fields, settings } })
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
  } catch (e) {
    return errorResponse(e, 'POST content', 'שמירת התוכן נכשלה בשרת. נסו שוב בעוד רגע.', 'השרת לא קיבל את התוכן (סוג תוכן או שדה לא מוכר). רעננו את הדף ונסו שוב; אם הבעיה חוזרת, פנו לתמיכה.')
  }
}
