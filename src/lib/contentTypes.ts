import type { ContentType } from '@/types'

// The content types a screen region can show, as offered in the editor. Labels and grouping only:
// the stored values, the API and the TV rendering are unchanged.
//
// - main:   the everyday types, shown first.
// - more:   "תוכן נוסף" — supported but less common (events).
// - legacy: still rendered by the TV and accepted by the API, but no longer offered for new
//           content (removed from the picker earlier; the header shows clock, date and weather).
//           A region that already uses one still shows it, so it can be edited or replaced.
export type ContentCategory = 'main' | 'more' | 'legacy'
export type ContentTypeInfo = { type: Exclude<ContentType, 'EMPTY'>; label: string; description: string; category: ContentCategory }

export const CONTENT_TYPES: ContentTypeInfo[] = [
  { type: 'IMAGE_GALLERY', label: 'גלריית תמונות', description: 'תמונות וסרטונים מתיקיות בספריית המדיה', category: 'main' },
  { type: 'ANNOUNCEMENT', label: 'הודעות', description: 'הודעות בית הספר שהוקצו למסך', category: 'main' },
  { type: 'TIMETABLE', label: 'שינויי מערכת', description: 'שינויים במערכת השעות, לוח או תפריט', category: 'main' },
  { type: 'BIRTHDAYS', label: 'ימי הולדת', description: 'ברכת יום הולדת', category: 'main' },
  { type: 'TEXT', label: 'טקסט', description: 'טקסט חופשי בגודל ובצבע לבחירה', category: 'main' },
  { type: 'VIDEO', label: 'וידאו', description: 'סרטון מקישור', category: 'main' },
  { type: 'RSS_FEED', label: 'חדשות RSS', description: 'כותרות מפיד חדשות', category: 'main' },
  { type: 'IFRAME', label: 'אתר חיצוני', description: 'דף אינטרנט מאובטח (https) בתוך האזור', category: 'main' },
  { type: 'EVENTS', label: 'אירועים', description: 'אירוע קרוב עם תאריך ומיקום', category: 'more' },
  { type: 'CLOCK', label: 'שעון', description: 'שעון גדול', category: 'legacy' },
  { type: 'DATE', label: 'תאריך', description: 'תאריך עברי ולועזי', category: 'legacy' },
  { type: 'WEATHER', label: 'מזג אוויר', description: 'מזג אוויר לפי עיר', category: 'legacy' },
]

export const contentTypeInfo = (type: ContentType) => CONTENT_TYPES.find(c => c.type === type)
export const contentTypeLabel = (type: ContentType) => type === 'EMPTY' ? 'ריק' : contentTypeInfo(type)?.label ?? type

/** The types offered for a region: main and "more", plus a legacy type only if the region uses it. */
export function offeredContentTypes(current: ContentType): { main: ContentTypeInfo[]; more: ContentTypeInfo[] } {
  return {
    main: CONTENT_TYPES.filter(c => c.category === 'main'),
    more: CONTENT_TYPES.filter(c => c.category === 'more' || (c.category === 'legacy' && c.type === current)),
  }
}
