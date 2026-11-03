import DisabledScreen from '@/components/display/DisabledScreen'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { resolveEmergency, getActiveAnnouncements, resolveActiveContent } from '@/lib/scheduling'
import { toISOStringOrNull } from '@/lib/utils'
import type { PublicScreenData, ContentItem, Announcement, Screen, School } from '@/types'
import ScreenDisplay from '@/components/display/ScreenDisplay'
import { DEFAULT_SCHEDULE, type ScreenSchedule } from '@/lib/screenSchedule'
export const dynamic='force-dynamic'
export const revalidate=0
// A gallery is only serialized when it belongs to the screen's school (defense in depth).
function serializeCI(raw:any,schoolId:string):ContentItem{return{id:raw.id,sectionId:raw.sectionId,contentType:raw.contentType,priority:raw.priority,active:raw.active,startDate:toISOStringOrNull(raw.startDate),endDate:toISOStringOrNull(raw.endDate),startTime:raw.startTime??null,endTime:raw.endTime??null,daysOfWeek:raw.daysOfWeek??[],textContent:raw.textContent??null,textColor:raw.textColor??null,bgColor:raw.bgColor??null,fontSize:raw.fontSize??null,galleryId:raw.galleryId??null,slideDuration:raw.slideDuration,transitionStyle:raw.transitionStyle,videoUrl:raw.videoUrl??null,videoLoop:raw.videoLoop,videoMuted:raw.videoMuted,rssUrl:raw.rssUrl??null,rssMaxItems:raw.rssMaxItems,weatherCity:raw.weatherCity??null,weatherUnits:raw.weatherUnits,settings:raw.settings??null,gallery:raw.gallery&&raw.gallery.schoolId===schoolId?{id:raw.gallery.id,schoolId:raw.gallery.schoolId,name:raw.gallery.name,createdAt:toISOStringOrNull(raw.gallery.createdAt)??'',files:(raw.gallery.files??[]).map((f:any)=>({id:f.id,schoolId:f.schoolId,galleryId:f.galleryId??null,filename:f.filename,originalName:f.originalName,mimeType:f.mimeType,size:f.size,mediaType:f.mediaType,url:f.url,caption:f.caption??null,hidden:f.hidden,uploadedAt:toISOStringOrNull(f.uploadedAt)??''}))}:undefined}}
async function getScreenData(slug:string):Promise<PublicScreenData|null>{
  const raw=await db.screen.findUnique({where:{slug},include:{school:{include:{theme:true}},layout:true,sections:{orderBy:{position:'asc'},include:{contentItems:{where:{active:true},orderBy:{priority:'desc'},include:{gallery:{include:{files:{where:{hidden:false}}}}}}}},announcements:{include:{announcement:true}}}})
  if(!raw)return null
  const screen:Screen={id:raw.id,schoolId:raw.schoolId,name:raw.name,slug:raw.slug,orientation:raw.orientation,width:raw.width,height:raw.height,active:raw.active,refreshSecs:raw.refreshSecs,layout:raw.layout?{id:raw.layout.id,screenId:raw.layout.screenId,headerEnabled:raw.layout.headerEnabled,headerShowLogo:raw.layout.headerShowLogo,headerShowTitle:raw.layout.headerShowTitle,headerShowClock:raw.layout.headerShowClock,headerShowDate:raw.layout.headerShowDate,headerShowParasha:raw.layout.headerShowParasha,headerShowHebDate:raw.layout.headerShowHebDate,headerShowWeather:raw.layout.headerShowWeather,headerScrollText:raw.layout.headerScrollText??null,mainSections:raw.layout.mainSections,footerEnabled:raw.layout.footerEnabled,footerTicker:raw.layout.footerTicker??null,footerFeedMode:raw.layout.footerFeedMode as "manual"|"rss"|"both",footerRssUrl:raw.layout.footerRssUrl??null,footerRssMaxItems:raw.layout.footerRssMaxItems,footerRssRefreshMinutes:raw.layout.footerRssRefreshMinutes,footerTickerSpeed:raw.layout.footerTickerSpeed as "slow"|"normal"|"fast",footerHeight:raw.layout.footerHeight,footerShowBirthdays:raw.layout.footerShowBirthdays,headerHeight:raw.layout.headerHeight,headerTitleFontSize:raw.layout.headerTitleFontSize,headerTitleFontWeight:raw.layout.headerTitleFontWeight,headerDateType:raw.layout.headerDateType as "HEBREW"|"GREGORIAN"|"BOTH",footerShowSchoolName:raw.layout.footerShowSchoolName,footerShowClock:raw.layout.footerShowClock,bgColor:raw.layout.bgColor??null,bgImageUrl:raw.layout.bgImageUrl??null,fontFamily:raw.layout.fontFamily??"Heebo"}:undefined}
  const school:School={id:raw.school.id,name:raw.school.name,slug:raw.school.slug,logoUrl:raw.school.logoUrl??null,weatherCity:raw.school.weatherCity??null,locale:raw.school.locale,timezone:raw.school.timezone,active:raw.school.active,theme:raw.school.theme?{primaryColor:raw.school.theme.primaryColor,secondaryColor:raw.school.theme.secondaryColor,backgroundColor:raw.school.theme.backgroundColor,fontFamily:raw.school.theme.fontFamily,logoUrl:raw.school.theme.logoUrl??null,borderRadius:raw.school.theme.borderRadius}:undefined}
  const now=new Date()
  const allAnn:Announcement[]=raw.announcements.map(a=>({id:a.announcement.id,schoolId:a.announcement.schoolId,title:a.announcement.title,body:a.announcement.body,priority:a.announcement.priority,bgColor:a.announcement.bgColor,textColor:a.announcement.textColor,icon:a.announcement.icon??null,showTitle:a.announcement.showTitle,active:a.announcement.active,startAt:toISOStringOrNull(a.announcement.startAt)??'',endAt:toISOStringOrNull(a.announcement.endAt)??'',startTime:a.announcement.startTime??null,endTime:a.announcement.endTime??null,daysOfWeek:a.announcement.daysOfWeek??[],isEmergency:a.announcement.isEmergency,screens:[{announcementId:a.announcement.id,screenId:raw.id,sectionPosition:null}]}))
  const tz=raw.school.timezone
  // Sections with scheduled items also send the candidates, so the TV switches at the scheduled
  // minute (re-checked locally every 30 s) instead of waiting for the next page refresh.
  const scheduled=(ci:ContentItem)=>!!(ci.startDate||ci.endDate||ci.startTime||ci.endTime||ci.daysOfWeek.length)
  return{screen,school,emergencyAlert:resolveEmergency(allAnn,now,tz),activeAnnouncements:getActiveAnnouncements(allAnn,raw.id,now,tz),sections:raw.sections.slice(0,raw.layout?.mainSections ?? raw.sections.length).map(s=>{const items=s.contentItems.map(ci=>serializeCI(ci,raw.schoolId));return{position:s.position,widthPct:s.widthPct,activeContent:resolveActiveContent(items,now,tz),...(items.some(scheduled)?{items}:{})}})}
}
// Fallback: if the schedule table is missing (migration not applied) or the query fails,
// the screen uses DEFAULT_SCHEDULE (schedule disabled), so content stays on air rather
// than the whole public screen failing. Only the error code/name is logged.
async function loadOperatingSchedule(screenId:string):Promise<ScreenSchedule>{
  try{
    const stored = await db.$queryRaw<Array<{ enabled: boolean; startTime: string; endTime: string; days: number[]; standbyMode: string }>>`
      SELECT "enabled", "startTime", "endTime", "days", "standbyMode"
      FROM "ScreenOperatingSchedule" WHERE "screenId" = ${screenId} LIMIT 1
    `
    const item = stored[0]
    return item ? {
      enabled: item.enabled, startTime: item.startTime, endTime: item.endTime,
      days: item.days, standbyMode: ['clock', 'message', 'logo'].includes(item.standbyMode) ? item.standbyMode as ScreenSchedule['standbyMode'] : 'logo',
    } : DEFAULT_SCHEDULE
  }catch(error){
    const code=(error as {code?:unknown})?.code
    console.error('Operating schedule unavailable; using default schedule (always on).', typeof code==='string'?code:(error as Error)?.name??'UnknownError')
    return DEFAULT_SCHEDULE
  }
}
export default async function PublicScreenPage({ params: paramsPromise }:{params: Promise<{slug:string}>}){
  const params = await paramsPromise;
  // Check activation before loading expensive media and content relations.
  const state = await db.screen.findUnique({ where: { slug: params.slug }, select: { active: true, school: { select: { timezone: true } } } })
  if (!state) notFound()
  if (!state.active) return <DisabledScreen timezone={state.school.timezone} />
  const data=await getScreenData(params.slug)
  if(!data)notFound()
  const schedule = await loadOperatingSchedule(data.screen.id)
  return <ScreenDisplay data={data} refreshSecs={data.screen.refreshSecs} schedule={schedule}/>
}
