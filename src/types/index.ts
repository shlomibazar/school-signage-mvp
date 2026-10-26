export type Role = 'SUPER_ADMIN'|'SCHOOL_ADMIN'|'EDITOR'|'VIEWER'
export type Orientation = 'LANDSCAPE'|'PORTRAIT'
export type Priority = 'LOW'|'MEDIUM'|'HIGH'|'EMERGENCY'
export type MediaType = 'IMAGE'|'VIDEO'
export type ContentType = 'TEXT'|'IMAGE_GALLERY'|'VIDEO'|'CLOCK'|'DATE'|'WEATHER'|'RSS_FEED'|'TIMETABLE'|'EVENTS'|'BIRTHDAYS'|'ANNOUNCEMENT'|'EMPTY'
export type DateType = 'HEBREW'|'GREGORIAN'|'BOTH'

export interface AuthUser { id:string; email:string; name:string; role:Role; schoolId:string|null }
export interface JWTPayload { sub:string; email:string; name:string; role:Role; schoolId:string|null; iat:number; exp:number }

export interface School { id:string; name:string; slug:string; logoUrl:string|null; weatherCity?:string|null; locale:string; timezone:string; active:boolean; theme?:SchoolTheme }
export interface SchoolTheme { primaryColor:string; secondaryColor:string; backgroundColor:string; fontFamily:string; logoUrl:string|null; borderRadius:number }

export interface Screen { id:string; schoolId:string; name:string; slug:string; orientation:Orientation; width:number; height:number; active:boolean; refreshSecs:number; layout?:ScreenLayout; sections?:ScreenSection[] }

export interface ScreenLayout {
  id:string; screenId:string
  headerEnabled:boolean; headerHeight:number; headerShowLogo:boolean; headerShowTitle:boolean
  headerShowClock:boolean; headerShowDate:boolean; headerShowHebDate:boolean
  headerDateType:DateType; headerShowParasha?:boolean; headerShowWeather:boolean; headerScrollText:string|null
  headerTitleFontSize?:number; headerTitleFontWeight?:number
  mainSections:number
  footerEnabled:boolean; footerHeight:number; footerTicker:string|null
  footerShowSchoolName:boolean; footerShowClock:boolean; footerShowBirthdays:boolean
  footerFeedMode?:'manual'|'rss'|'both'; footerRssUrl?:string|null; footerRssMaxItems?:number; footerRssRefreshMinutes?:number; footerTickerSpeed?:'slow'|'normal'|'fast'
  bgColor:string|null; bgImageUrl:string|null; fontFamily?:string
}

export interface ScreenSection { id:string; screenId:string; position:number; widthPct:number; contentItems:ContentItem[] }

// Per-type settings
export interface ClockSettings { hourFormat:'12'|'24'; showSeconds:boolean }
export interface DateSettings { dateFormat:'full'|'short'|'daymonth'; locale:'he'|'en' }
export interface RssSettings { refreshInterval:number; displayStyle:'list'|'ticker' }
export interface VideoSettings { showControls:boolean }
export interface GallerySettings { showCaptions:boolean; showDots:boolean; imageIds:string[]; imageFit?: "cover" | "contain"; mosaicCount?:4|6|9; groupDuration?:number; folderIds?:string[]; displayMode?:"slideshow"|"mosaic"|"collage"; imageOrder?:"random"|"newest"|"oldest"|"name"; showGallery?:boolean; showSectionTitle?:boolean; sectionTitle?:string; sectionTitleSize?:"normal"|"large"|"xlarge" }
export interface SingleAnnouncement { id:string; title:string; body:string; priority:'info'|'warning'|'urgent'; icon:string; attachments?:{id:string;url:string;kind:string}[] }
export interface AnnouncementContentSettings { title:string; priority:'info'|'warning'|'urgent'; style:'banner'|'card'; icon:string; items:SingleAnnouncement[]; selectedAnnouncementIds?:string[]; rotationSecs:number; showSectionTitle?:boolean; sectionTitle?:string; sectionTitleSize?:'normal'|'large'|'xlarge' }
export interface BirthdaySettings { personName:string; grade:string; birthDate:string; greetingText:string }
export interface EventSettings { eventTitle:string; eventDate:string; eventTime:string; location:string; description:string }
export interface TimetableSettings { title:string; menuText:string; items:string[]; displayMode?:'list'|'long'|'webtop-list'|'webtop-grid'; pageSeconds?:number; linesPerPage?:number; institutionCode?:string; grades?:number[]; refreshSeconds?:number; minColumnWidth?:number; columnsPerPage?:number; headerFontSize?:number; bodyFontSize?:number; detailFontSize?:number; scrollSpeed?:number; showExams?:boolean; showEvents?:boolean; showChanges?:boolean; showMessages?:boolean; showStudyGroup?:boolean; showEmptyHours?:boolean; groupIdenticalRows?:boolean; showUnpublished?:boolean; scrollDelaySeconds?:number; listFontSize?:number; dateMode?:"today"|"tomorrow"|"specific"; specificDate?:string; hourFrom?:number; hourTo?:number }
export type ContentSettings = ClockSettings|DateSettings|RssSettings|VideoSettings|GallerySettings|AnnouncementContentSettings|BirthdaySettings|EventSettings|TimetableSettings|Record<string,never>

export interface ContentItem { id:string; sectionId:string; contentType:ContentType; priority:number; active:boolean; startDate:string|null; endDate:string|null; startTime:string|null; endTime:string|null; daysOfWeek:number[]; textContent:string|null; textColor:string|null; bgColor:string|null; fontSize:number|null; galleryId:string|null; gallery?:Gallery; slideDuration:number; transitionStyle:string; videoUrl:string|null; videoLoop:boolean; videoMuted:boolean; rssUrl:string|null; rssMaxItems:number; weatherCity:string|null; weatherUnits:string; settings:ContentSettings|null }

export interface Announcement { id:string; schoolId:string; title:string; body:string; priority:Priority; bgColor:string; textColor:string; icon:string|null; active:boolean; startAt:string; endAt:string; startTime:string|null; endTime:string|null; daysOfWeek:number[]; isEmergency:boolean; screens?:AnnouncementScreen[] }
export interface AnnouncementScreen { announcementId:string; screenId:string; sectionPosition:number|null }

export interface Message { id:string; schoolId:string; title:string; body:string; priority:string; icon:string; bgColor:string; textColor:string; active:boolean; createdAt:string; updatedAt:string }

export interface MediaFile { id:string; schoolId:string; galleryId:string|null; filename:string; originalName:string; mimeType:string; size:number; mediaType:MediaType; url:string; caption:string|null; hidden:boolean; uploadedAt:string }
export interface MediaLibraryImage { mimeType?:string; id:string; filename:string; originalName:string; url:string; size:number; caption:string|null; uploadedAt:string; galleryId:string|null }
export interface Gallery { id:string; schoolId:string; name:string; description?:string|null; coverUrl?:string|null; createdAt:string; files?:MediaFile[]; fileCount?:number }

export interface ApiResponse<T=unknown> { data?:T; error?:string; message?:string }
export interface PublicScreenData { screen:Screen; school:School; activeAnnouncements:Announcement[]; emergencyAlert:Announcement|null; sections:PublicSection[] }
export interface PublicSection { position:number; widthPct:number; activeContent:ContentItem|null }
export interface RssFeedItem { title:string; link:string; description:string; pubDate:string }
