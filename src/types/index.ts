// src/types/index.ts
// Shared TypeScript types across admin and display

export type Role = 'SUPER_ADMIN' | 'SCHOOL_ADMIN' | 'EDITOR' | 'VIEWER'
export type Orientation = 'LANDSCAPE' | 'PORTRAIT'
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'EMERGENCY'
export type MediaType = 'IMAGE' | 'VIDEO'

export type ContentType =
  | 'TEXT'
  | 'IMAGE_GALLERY'
  | 'VIDEO'
  | 'CLOCK'
  | 'DATE'
  | 'WEATHER'
  | 'RSS_FEED'
  | 'TIMETABLE'
  | 'EVENTS'
  | 'BIRTHDAYS'
  | 'ANNOUNCEMENT'
  | 'EMPTY'

// ─── Auth ───────────────────────────────────────────────
export interface AuthUser {
  id: string
  email: string
  name: string
  role: Role
  schoolId: string | null
}

export interface JWTPayload {
  sub: string
  email: string
  name: string
  role: Role
  schoolId: string | null
  iat: number
  exp: number
}

// ─── School ─────────────────────────────────────────────
export interface School {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  locale: string
  timezone: string
  active: boolean
  theme?: SchoolTheme
}

export interface SchoolTheme {
  primaryColor: string
  secondaryColor: string
  backgroundColor: string
  fontFamily: string
  logoUrl: string | null
  borderRadius: number
}

// ─── Screen ─────────────────────────────────────────────
export interface Screen {
  id: string
  schoolId: string
  name: string
  slug: string
  orientation: Orientation
  width: number
  height: number
  active: boolean
  refreshSecs: number
  layout?: ScreenLayout
  sections?: ScreenSection[]
}

export interface ScreenLayout {
  id: string
  screenId: string
  headerEnabled: boolean
  headerShowLogo: boolean
  headerShowTitle: boolean
  headerShowClock: boolean
  headerShowDate: boolean
  headerShowHebDate: boolean
  headerShowWeather: boolean
  headerScrollText: string | null
  mainSections: number
  footerEnabled: boolean
  footerTicker: string | null
  footerShowSchoolName: boolean
  footerShowClock: boolean
  bgColor: string | null
  bgImageUrl: string | null
}

export interface ScreenSection {
  id: string
  screenId: string
  position: number  // 0, 1, 2
  widthPct: number
  contentItems: ContentItem[]
}

// ─── Content Items ───────────────────────────────────────
export interface ContentItem {
  id: string
  sectionId: string
  contentType: ContentType
  priority: number
  active: boolean
  startDate: string | null
  endDate: string | null
  startTime: string | null
  endTime: string | null
  daysOfWeek: number[]
  // Text
  textContent: string | null
  textColor: string | null
  bgColor: string | null
  fontSize: number | null
  // Gallery
  galleryId: string | null
  gallery?: Gallery
  slideDuration: number
  transitionStyle: string
  // Video
  videoUrl: string | null
  videoLoop: boolean
  videoMuted: boolean
  // RSS
  rssUrl: string | null
  rssMaxItems: number
  // Weather
  weatherCity: string | null
  weatherUnits: string
}

// ─── Announcements ───────────────────────────────────────
export interface Announcement {
  id: string
  schoolId: string
  title: string
  body: string
  priority: Priority
  bgColor: string
  textColor: string
  icon: string | null
  active: boolean
  startAt: string
  endAt: string
  startTime: string | null
  endTime: string | null
  daysOfWeek: number[]
  isEmergency: boolean
  screens?: AnnouncementScreen[]
}

export interface AnnouncementScreen {
  announcementId: string
  screenId: string
  sectionPosition: number | null
}

// ─── Media ───────────────────────────────────────────────
export interface MediaFile {
  id: string
  schoolId: string
  galleryId: string | null
  filename: string
  originalName: string
  mimeType: string
  size: number
  mediaType: MediaType
  url: string
  caption: string | null
  hidden: boolean
  uploadedAt: string
}

export interface Gallery {
  id: string
  schoolId: string
  name: string
  createdAt: string
  files?: MediaFile[]
}

// ─── API Response shapes ──────────────────────────────────
export interface ApiResponse<T = unknown> {
  data?: T
  error?: string
  message?: string
}

// ─── Editor state ────────────────────────────────────────
export interface EditorState {
  screen: Screen
  layout: ScreenLayout
  sections: ScreenSection[]
  isDirty: boolean
}

// ─── Display / Public screen ─────────────────────────────
export interface PublicScreenData {
  screen: Screen
  school: School
  activeAnnouncements: Announcement[]
  emergencyAlert: Announcement | null
  sections: PublicSection[]
}

export interface PublicSection {
  position: number
  widthPct: number
  activeContent: ContentItem | null
}
