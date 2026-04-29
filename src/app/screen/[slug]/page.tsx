// src/app/screen/[slug]/page.tsx
// Public display page — shown on TVs/kiosks. NO admin controls.

import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { resolveEmergency, getActiveAnnouncements, resolveActiveContent } from '@/lib/scheduling'
import { toISOStringOrNull } from '@/lib/utils'
import type {
  PublicScreenData, ContentItem, Announcement,
  Screen, ScreenLayout, ScreenSection, School, SchoolTheme,
} from '@/types'
import ScreenDisplay from '@/components/display/ScreenDisplay'

interface Props {
  params: { slug: string }
}

export const dynamic  = 'force-dynamic'
export const revalidate = 0

// ── Serializers: Prisma Date → ISO string ───────────────
function serializeContentItem(raw: any): ContentItem {
  return {
    id:              raw.id,
    sectionId:       raw.sectionId,
    contentType:     raw.contentType,
    priority:        raw.priority,
    active:          raw.active,
    startDate:       toISOStringOrNull(raw.startDate),
    endDate:         toISOStringOrNull(raw.endDate),
    startTime:       raw.startTime  ?? null,
    endTime:         raw.endTime    ?? null,
    daysOfWeek:      raw.daysOfWeek ?? [],
    textContent:     raw.textContent  ?? null,
    textColor:       raw.textColor    ?? null,
    bgColor:         raw.bgColor      ?? null,
    fontSize:        raw.fontSize     ?? null,
    galleryId:       raw.galleryId    ?? null,
    slideDuration:   raw.slideDuration,
    transitionStyle: raw.transitionStyle,
    videoUrl:        raw.videoUrl    ?? null,
    videoLoop:       raw.videoLoop,
    videoMuted:      raw.videoMuted,
    rssUrl:          raw.rssUrl       ?? null,
    rssMaxItems:     raw.rssMaxItems,
    weatherCity:     raw.weatherCity  ?? null,
    weatherUnits:    raw.weatherUnits,
    gallery: raw.gallery ? {
      id:        raw.gallery.id,
      schoolId:  raw.gallery.schoolId,
      name:      raw.gallery.name,
      createdAt: toISOStringOrNull(raw.gallery.createdAt) ?? '',
      files: (raw.gallery.files ?? []).map((f: any) => ({
        id:           f.id,
        schoolId:     f.schoolId,
        galleryId:    f.galleryId ?? null,
        filename:     f.filename,
        originalName: f.originalName,
        mimeType:     f.mimeType,
        size:         f.size,
        mediaType:    f.mediaType,
        url:          f.url,
        caption:      f.caption    ?? null,
        hidden:       f.hidden,
        uploadedAt:   toISOStringOrNull(f.uploadedAt) ?? '',
      })),
    } : undefined,
  }
}

function serializeAnnouncement(raw: any, screenId: string): Announcement {
  return {
    id:          raw.id,
    schoolId:    raw.schoolId,
    title:       raw.title,
    body:        raw.body,
    priority:    raw.priority,
    bgColor:     raw.bgColor,
    textColor:   raw.textColor,
    icon:        raw.icon     ?? null,
    active:      raw.active,
    startAt:     toISOStringOrNull(raw.startAt) ?? '',
    endAt:       toISOStringOrNull(raw.endAt)   ?? '',
    startTime:   raw.startTime ?? null,
    endTime:     raw.endTime   ?? null,
    daysOfWeek:  raw.daysOfWeek ?? [],
    isEmergency: raw.isEmergency,
    screens: [{
      announcementId:  raw.id,
      screenId,
      sectionPosition: null,
    }],
  }
}

async function getScreenData(slug: string): Promise<PublicScreenData | null> {
  const raw = await db.screen.findUnique({
    where: { slug, active: true },
    include: {
      school: { include: { theme: true } },
      layout: true,
      sections: {
        orderBy: { position: 'asc' },
        include: {
          contentItems: {
            where:   { active: true },
            orderBy: { priority: 'desc' },
            include: {
              gallery: { include: { files: { where: { hidden: false } } } },
            },
          },
        },
      },
      announcements: {
        include: { announcement: true },
      },
    },
  })

  if (!raw) return null

  // Build typed Screen
  const screen: Screen = {
    id:          raw.id,
    schoolId:    raw.schoolId,
    name:        raw.name,
    slug:        raw.slug,
    orientation: raw.orientation,
    width:       raw.width,
    height:      raw.height,
    active:      raw.active,
    refreshSecs: raw.refreshSecs,
    layout:      raw.layout ? {
      id:                  raw.layout.id,
      screenId:            raw.layout.screenId,
      headerEnabled:       raw.layout.headerEnabled,
      headerShowLogo:      raw.layout.headerShowLogo,
      headerShowTitle:     raw.layout.headerShowTitle,
      headerShowClock:     raw.layout.headerShowClock,
      headerShowDate:      raw.layout.headerShowDate,
      headerShowHebDate:   raw.layout.headerShowHebDate,
      headerShowWeather:   raw.layout.headerShowWeather,
      headerScrollText:    raw.layout.headerScrollText ?? null,
      mainSections:        raw.layout.mainSections,
      footerEnabled:       raw.layout.footerEnabled,
      footerTicker:        raw.layout.footerTicker       ?? null,
      footerShowSchoolName:raw.layout.footerShowSchoolName,
      footerShowClock:     raw.layout.footerShowClock,
      bgColor:             raw.layout.bgColor            ?? null,
      bgImageUrl:          raw.layout.bgImageUrl         ?? null,
    } : undefined,
  }

  // Build typed School
  const theme = raw.school.theme
  const school: School = {
    id:       raw.school.id,
    name:     raw.school.name,
    slug:     raw.school.slug,
    logoUrl:  raw.school.logoUrl ?? null,
    locale:   raw.school.locale,
    timezone: raw.school.timezone,
    active:   raw.school.active,
    theme: theme ? {
      primaryColor:    theme.primaryColor,
      secondaryColor:  theme.secondaryColor,
      backgroundColor: theme.backgroundColor,
      fontFamily:      theme.fontFamily,
      logoUrl:         theme.logoUrl ?? null,
      borderRadius:    theme.borderRadius,
    } : undefined,
  }

  const now = new Date()

  // Serialize announcements
  const allAnnouncements: Announcement[] = raw.announcements.map(a =>
    serializeAnnouncement(a.announcement, raw.id)
  )

  const emergencyAlert = resolveEmergency(allAnnouncements, now)
  const activeAnnouncements = getActiveAnnouncements(allAnnouncements, raw.id, now)

  // Serialize sections + resolve active content per section
  const sections = raw.sections.map(section => ({
    position:  section.position,
    widthPct:  section.widthPct,
    activeContent: resolveActiveContent(
      section.contentItems.map(serializeContentItem),
      raw.refreshSecs,
      now,
    ),
  }))

  return { screen, school, activeAnnouncements, emergencyAlert, sections }
}

export default async function PublicScreenPage({ params }: Props) {
  const data = await getScreenData(params.slug)
  if (!data) notFound()

  return <ScreenDisplay data={data} refreshSecs={data.screen.refreshSecs} />
}
