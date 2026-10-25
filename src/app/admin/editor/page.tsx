// src/app/admin/editor/page.tsx
import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { distributeWidths, toISOStringOrNull } from '@/lib/utils'
import ScreenLayoutEditor from '@/components/admin/editor/ScreenLayoutEditor'
import ScreenSelector from '@/components/admin/editor/ScreenSelector'
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
    headerHeight:        raw.layout.headerHeight,
    headerTitleFontSize: raw.layout.headerTitleFontSize,
    headerTitleFontWeight: raw.layout.headerTitleFontWeight,
    headerDateType:      raw.layout.headerDateType as ScreenLayout["headerDateType"],
    headerShowLogo:      raw.layout.headerShowLogo,
    headerShowTitle:     raw.layout.headerShowTitle,
    headerShowClock:     raw.layout.headerShowClock,
    headerShowDate:      raw.layout.headerShowDate,
    headerShowParasha:   raw.layout.headerShowParasha,
    headerShowHebDate:   raw.layout.headerShowHebDate,
    headerShowWeather:   raw.layout.headerShowWeather,
    headerScrollText:    raw.layout.headerScrollText ?? null,
    mainSections:        raw.layout.mainSections,
    footerEnabled:       raw.layout.footerEnabled,
    footerHeight:        raw.layout.footerHeight,
    footerShowBirthdays: raw.layout.footerShowBirthdays,
    footerTicker:        raw.layout.footerTicker    ?? null,
    footerFeedMode: raw.layout.footerFeedMode as ScreenLayout["footerFeedMode"],
    footerRssUrl: raw.layout.footerRssUrl ?? null,
    footerRssMaxItems: raw.layout.footerRssMaxItems,
    footerRssRefreshMinutes: raw.layout.footerRssRefreshMinutes,
    footerTickerSpeed: raw.layout.footerTickerSpeed as ScreenLayout["footerTickerSpeed"],
    footerShowSchoolName:raw.layout.footerShowSchoolName,
    footerShowClock:     raw.layout.footerShowClock,
    bgColor:             raw.layout.bgColor         ?? null,
    bgImageUrl:          raw.layout.bgImageUrl      ?? null,
  } : {
    id: '', screenId: raw.id,
    headerEnabled: true, headerHeight: 80, headerTitleFontSize:26, headerTitleFontWeight:700, headerDateType: "BOTH", headerShowLogo: true, headerShowTitle: true,
    headerShowClock: true, headerShowDate: true, headerShowParasha: false, headerShowHebDate: true,
    headerShowWeather: false, headerScrollText: null,
    mainSections: 1,
    footerEnabled: true, footerHeight: 48, footerShowBirthdays: false, footerTicker: null,
    footerFeedMode: "manual", footerRssUrl: null, footerRssMaxItems: 8,
    footerRssRefreshMinutes: 15, footerTickerSpeed: "normal",
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
        settings:       (ci.settings ?? null) as ContentItem["settings"],
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

  const availableScreens = await db.screen.findMany({
    where: schoolId && user.role !== 'SUPER_ADMIN' ? { schoolId } : {},
    select: { id: true, name: true }, orderBy: { createdAt: 'asc' },
  })

  return (
    <div className="min-w-0">
      <ScreenLayoutEditor schoolId={raw.schoolId} initialLogoUrl={(await db.school.findUnique({where:{id:raw.schoolId},select:{logoUrl:true}}))?.logoUrl ?? null} initialWeatherCity={(await db.school.findUnique({where:{id:raw.schoolId},select:{weatherCity:true}}))?.weatherCity ?? null} key={screen.id} screen={screen} layout={layout} sections={sections}
        screenSelector={<ScreenSelector currentId={screen.id} screens={availableScreens} />} />
    </div>
  )
}
