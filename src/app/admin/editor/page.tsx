// src/app/admin/editor/page.tsx
import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { distributeWidths, toISOStringOrNull } from '@/lib/utils'
import ScreenLayoutEditor from '@/components/admin/editor/ScreenLayoutEditor'
import type { Screen, ScreenLayout, ScreenSection, ContentItem } from '@/types'

interface Props {
  searchParams: { screen?: string }
}

export default async function EditorPage({ searchParams }: Props) {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')

  const schoolId = user.schoolId
  const screenId = searchParams.screen

  // If no screen param, pick the first screen of this school
  let resolvedId = screenId
  if (!resolvedId) {
    const first = await db.screen.findFirst({
      where: schoolId ? { schoolId } : {},
      orderBy: { createdAt: 'asc' },
    })
    if (!first) redirect('/admin/screens/new')
    resolvedId = first.id
  }

  const raw = await db.screen.findFirst({
    where: {
      id: resolvedId,
      ...(schoolId && user.role !== 'SUPER_ADMIN' ? { schoolId } : {}),
    },
    include: {
      layout: true,
      sections: {
        orderBy: { position: 'asc' },
        include: {
          contentItems: {
            orderBy: { priority: 'desc' },
          },
        },
      },
    },
  })

  if (!raw) notFound()

  // Default layout if not yet created
  const layout: ScreenLayout = raw.layout ? {
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
    footerTicker:        raw.layout.footerTicker    ?? null,
    footerShowSchoolName:raw.layout.footerShowSchoolName,
    footerShowClock:     raw.layout.footerShowClock,
    bgColor:             raw.layout.bgColor         ?? null,
    bgImageUrl:          raw.layout.bgImageUrl      ?? null,
  } : {
    id: '', screenId: raw.id,
    headerEnabled: true,  headerShowLogo: true, headerShowTitle: true,
    headerShowClock: true, headerShowDate: true, headerShowHebDate: true,
    headerShowWeather: false, headerScrollText: null,
    mainSections: 1,
    footerEnabled: true, footerTicker: null,
    footerShowSchoolName: true, footerShowClock: false,
    bgColor: null, bgImageUrl: null,
  }

  // Ensure section count matches layout.mainSections
  const sectionCount   = layout.mainSections
  const widths         = distributeWidths(sectionCount)   // ← fixed rounding
  const sections: ScreenSection[] = Array.from({ length: sectionCount }, (_, i) => {
    const existing = raw.sections.find(s => s.position === i)
    return {
      id:       existing?.id ?? `new-${i}`,
      screenId: raw.id,
      position: i,
      widthPct: widths[i],
      contentItems: (existing?.contentItems ?? []).map((ci): ContentItem => ({
        id:             ci.id,
        sectionId:      ci.sectionId,
        contentType:    ci.contentType,
        priority:       ci.priority,
        active:         ci.active,
        startDate:      toISOStringOrNull(ci.startDate),
        endDate:        toISOStringOrNull(ci.endDate),
        startTime:      ci.startTime  ?? null,
        endTime:        ci.endTime    ?? null,
        daysOfWeek:     ci.daysOfWeek ?? [],
        textContent:    ci.textContent  ?? null,
        textColor:      ci.textColor    ?? null,
        bgColor:        ci.bgColor      ?? null,
        fontSize:       ci.fontSize     ?? null,
        galleryId:      ci.galleryId    ?? null,
        slideDuration:  ci.slideDuration,
        transitionStyle:ci.transitionStyle,
        videoUrl:       ci.videoUrl    ?? null,
        videoLoop:      ci.videoLoop,
        videoMuted:     ci.videoMuted,
        rssUrl:         ci.rssUrl      ?? null,
        rssMaxItems:    ci.rssMaxItems,
        weatherCity:    ci.weatherCity ?? null,
        weatherUnits:   ci.weatherUnits,
      })),
    }
  })

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
  }

  return (
    <div className="h-full">
      <ScreenLayoutEditor screen={screen} layout={layout} sections={sections} />
    </div>
  )
}
