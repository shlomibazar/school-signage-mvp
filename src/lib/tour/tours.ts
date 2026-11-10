// Guided tours: static step lists. Each step points at a real element by a stable `data-tour`
// attribute on a given admin page. The tour only reads and highlights; it never clicks, saves or edits.

export type TourStep = {
  /** Page the step lives on (pathname, no query). */
  path: string
  /** Where to navigate when not on `path` (defaults to `path`). */
  href?: string
  /** `data-tour` value(s) of the element to highlight, first found wins; none (or not found) = a centered card. */
  target?: string | string[]
  title: string
  body: string
}

export type Tour = { id: string; title: string; steps: TourStep[] }

const main: Tour = {
  id: 'main',
  title: 'סיור מודרך',
  steps: [
    { path: '/admin/dashboard', title: 'ברוכים הבאים לסיור', body: 'בכמה צעדים קצרים נכיר את לוח הבקרה, ניהול המסכים ועורך המסך. אפשר לסגור את הסיור בכל רגע, והוא לא משנה שום דבר במערכת.' },
    { path: '/admin/dashboard', target: 'dash-stats', title: 'תמונת מצב', body: 'כמה מסכים יש ובכמה מהם פעילים, אילו הודעות מוצגות עכשיו, כמה טיוטות ממתינות וכמה קבצי מדיה הועלו. לחיצה על כרטיס פותחת את הדף שלו.' },
    { path: '/admin/dashboard', target: 'dash-actions', title: 'פעולות מהירות', body: 'קיצורים לפעולות הנפוצות: הודעה חדשה, העלאת מדיה, יצירת מסך ועריכת מסכים.' },
    { path: '/admin/dashboard', target: 'dash-recent', title: 'מסכים אחרונים', body: 'המסכים האחרונים ומצבם (פעיל או מושבת), עם קיצור לעריכה ולצפייה במסך עצמו.' },
    { path: '/admin/screens', target: 'screens-actions', title: 'יצירת מסך', body: 'כאן יוצרים מסך חדש בכפתור ״מסך חדש״. אפשר גם לרענן את מצב החיבור ולפתוח את העזרה על מסכים.' },
    { path: '/admin/screens', target: 'screen-card', title: 'רשימת המסכים', body: 'כל מסך מופיע ככרטיס כזה, עם תצוגה מקדימה, מצב פעיל ומצב חיבור הטלוויזיה.' },
    { path: '/admin/screens', target: 'screen-card-edit', title: 'עריכה וצפייה', body: '״עריכת מסך״ פותח את העורך. ״צפייה במסך״ מציג את המסך כפי שהוא מופיע בטלוויזיה, בלשונית חדשה.' },
    { path: '/admin/screens', target: 'screen-card-connect', title: 'חיבור טלוויזיה', body: '״חיבור טלוויזיה״ מציג קוד קצר וכתובת לפתיחה בדפדפן של הטלוויזיה. בתפריט הנוסף אפשר לשנות שם, לשכפל ועוד.' },
    { path: '/admin/editor', target: 'editor-tabs', title: 'עורך המסך: לשוניות', body: 'העורך מחולק ללשוניות: תוכן האזורים, כותרת עליונה, כותרת תחתונה ועיצוב (ערכת צבעים, פריסה ורקע).' },
    { path: '/admin/editor', target: 'editor-regions', title: 'אזורי התוכן', body: 'כל אזור במסך מציג סוג תוכן אחד: הודעות, גלריה, מערכת שעות ועוד. בוחרים אזור ועורכים את התוכן שלו; תוכן אזור נשמר בכפתור ״שמירת תוכן״ שלו.' },
    { path: '/admin/editor', target: 'editor-regions', title: 'סוג תוכן לכל אזור', body: 'לכל אזור בוחרים סוג תוכן: הודעות, גלריה, מערכת שעות, ימי הולדת, טקסט ועוד. אותה גלריה או הודעה יכולה להופיע בכמה מסכים.' },
    { path: '/admin/editor', target: 'editor-preview', title: 'תצוגה מקדימה', body: 'כך ייראה המסך בטלוויזיה. השינויים מופיעים כאן מיד, עוד לפני השמירה. לחיצה על אזור בתצוגה בוחרת אותו לעריכה.' },
    { path: '/admin/editor', target: 'editor-save', title: 'שמירה', body: 'שינויי פריסה ועיצוב נשמרים רק בלחיצה על ״שמירת פריסה״. עד אז הם לא מגיעים לטלוויזיה. הסיור עצמו לא שומר דבר.' },
    { path: '/admin/screens', target: 'screen-card-connect', title: 'מהעורך לטלוויזיה', body: 'אחרי השמירה, פותחים ״חיבור טלוויזיה״ ומזינים בטלוויזיה את הקוד. המסך מתעדכן בטלוויזיה לבד, ומצב החיבור מופיע בכרטיס.' },
    { path: '/admin/screens', title: 'זהו!', body: 'סיימתם את הסיור. במרכז העזרה יש גם סיורים קצרים למדיה, הודעות, ימי הולדת, מערכת שעות והגדרות.' },
  ],
}

const media: Tour = { id: 'media', title: 'מדיה וגלריות', steps: [
  { path: '/admin/media', target: 'nav-admin-media', title: 'ספריית המדיה', body: 'כאן נשמרות כל התמונות והסרטונים של בית הספר, לשימוש בכל המסכים.' },
  { path: '/admin/media', target: 'media-upload', title: 'העלאה', body: 'מעלים תמונות וסרטונים, גם כמה קבצים בבת אחת. הם נכנסים לתיקייה שנבחרה.' },
  { path: '/admin/media', target: 'media-folders', title: 'תיקיות הן גלריות', body: 'כל תיקייה היא גלריה. משייכים אותה לאזור ״גלריה״ בעורך, ואותה גלריה יכולה להופיע בכמה מסכים.' },
  { path: '/admin/media', title: 'בחירה ומחיקה', body: 'אפשר לסמן כמה קבצים ולמחוק אותם יחד, או למחוק קובץ בודד. מחיקה מסירה את הקובץ מכל הגלריות, ותמיד מבקשת אישור.' },
  { path: '/admin/media', title: 'הגדרות המצגת', body: 'הגדרות התצוגה של הגלריה, כמו קצב ההחלפה, נקבעות בעורך המסך, באזור הגלריה עצמו.' },
] }

const announcements: Tour = { id: 'announcements', title: 'הודעות', steps: [
  { path: '/admin/announcements', target: 'page-actions', title: 'הודעה חדשה', body: 'מכאן יוצרים הודעה חדשה.' },
  { path: '/admin/announcements', target: ['ann-filters', 'ann-list'], title: 'רשימת ההודעות', body: 'כל ההודעות ומצבן, עם סינון לפי מסך ומצב. לחיצה על הודעה פותחת אותה לעריכה.' },
  { path: '/admin/announcements/new', target: 'ann-content', title: 'תוכן ההודעה', body: 'כותרת, טקסט מעוצב וקבצים מצורפים (תמונות או PDF) שיוצגו בטלוויזיה.' },
  { path: '/admin/announcements/new', target: 'ann-schedule', title: 'מתי ואיפה', body: 'קובעים מתי ההודעה מוצגת ובאילו מסכים. ההודעה נשמרת רק בכפתור השמירה; הסיור לא שומר.' },
] }

const birthdays: Tour = { id: 'birthdays', title: 'ימי הולדת', steps: [
  { path: '/admin/birthdays', target: 'bday-tabs', title: 'תלמידים ומורים', body: 'שתי רשימות נפרדות. עוברים ביניהן כאן.' },
  { path: '/admin/birthdays', target: 'bday-actions', title: 'הוספה וייבוא', body: 'מוסיפים רשומה ידנית, או מייבאים רשימה שלמה מקובץ Excel.' },
  { path: '/admin/birthdays', title: 'הצגה במסך', body: 'בעורך המסך בוחרים לאזור את סוג התוכן ״ימי הולדת״, ושם קובעים את אפשרויות התצוגה.' },
] }

const timetable: Tour = { id: 'timetable', title: 'מערכת שעות', steps: [
  { path: '/admin/editor', target: 'editor-regions', title: 'אזור מערכת שעות', body: 'בעורך בוחרים לאזור את סוג התוכן ״מערכת שעות״, ושם בוחרים מקור: שינויים ידניים או Webtop.' },
  { path: '/admin/editor', target: 'editor-regions', title: 'שינויים ידניים', body: 'שורה לכל שינוי: ״כיתה | שעה | תיאור״. מילים כמו ״מבוטל״, ״מילוי מקום״, ״חדר״ או ״מבחן״ קובעות את הצבע.' },
  { path: '/admin/editor', target: 'editor-regions', title: 'Webtop', body: 'במצב Webtop השינויים נמשכים מהמערכת של בית הספר ומתעדכנים לבד.' },
  { path: '/admin/editor', target: 'editor-preview', title: 'תצוגה ודפדוף', body: 'כשיש הרבה שינויים, המסך מחלק אותם לעמודים ומדפדף ביניהם.' },
] }

const settings: Tour = { id: 'settings', title: 'הגדרות', steps: [
  { path: '/admin/settings', target: 'page-header', title: 'הגדרות', body: 'כאן מנהלים את פרטי בית הספר ואת הגדרות המסכים.' },
  { path: '/admin/settings', target: ['settings-screen-row', 'settings-screens'], title: 'הגדרות מסכים', body: 'לכל מסך: שעות פעילות, רענון וחיבור טלוויזיה. הפריסה והתוכן נערכים בעורך.' },
] }

export const TOURS: Record<string, Tour> = Object.fromEntries([main, media, announcements, birthdays, timetable, settings].map(t => [t.id, t]))

/** The tour (and its first step) for an admin page, for the "הדרכה לעמוד זה" button. */
export function pageTour(pathname: string): { id: string; step: number } | null {
  const at = (id: string, path: string) => ({ id, step: Math.max(0, TOURS[id].steps.findIndex(s => s.path === path)) })
  if (pathname === '/admin/dashboard') return at('main', '/admin/dashboard')
  if (pathname === '/admin/screens') return at('main', '/admin/screens')
  if (pathname === '/admin/editor') return at('main', '/admin/editor')
  if (pathname.startsWith('/admin/media')) return at('media', '/admin/media')
  if (pathname === '/admin/announcements' || pathname === '/admin/announcements/new') return at('announcements', pathname)
  if (pathname === '/admin/birthdays') return at('birthdays', '/admin/birthdays')
  if (pathname === '/admin/settings') return at('settings', '/admin/settings')
  return null
}
