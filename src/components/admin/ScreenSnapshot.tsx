import { getDisplayTemplate, getTemplateWidths } from '@/lib/displayTemplates'
import { resolveScreenTheme } from '@/lib/screenThemes'

type Item = { contentType: string; active: boolean; textContent: string | null; settings: unknown; galleryId: string | null; bgColor: string | null }
type Section = { position: number; contentItems: Item[] }
type Snapshot = {
  name: string
  orientation: string
  layout: { mainSections: number; headerEnabled: boolean; footerEnabled: boolean; footerTicker: string | null; bgColor: string | null } | null
  sections: Section[]
}

const labels: Record<string, string> = {
  IMAGE_GALLERY: 'גלריית תמונות', EVENTS: 'אירועים', RSS_FEED: 'חדשות',
  TEXT: 'טקסט', ANNOUNCEMENTS: 'הודעות', ANNOUNCEMENT: 'הודעות',
  GALLERY: 'גלריית תמונות', TIMETABLE: 'שינויי מערכת', SCHEDULE_CHANGES: 'שינויי מערכת',
  WEATHER: 'מזג אוויר', RSS: 'חדשות', VIDEO: 'וידאו', BIRTHDAYS: 'ימי הולדת', EMPTY: 'אזור ריק',
}

/** Static, server-rendered summary of the saved layout. No iframe, animation or browser capture. */
type Media = {id:string;url:string;galleryId:string|null}
type Notice = {id:string;title:string;body:string;priority:string;bgColor:string}
const ids = (v:unknown):string[] => Array.isArray(v) ? v.filter((x):x is string=>typeof x==='string') : []
const plain = (v:string|null|undefined) => (v??'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim()
export default function ScreenSnapshot({ screen, media, announcements }: { screen: Snapshot; media: Media[]; announcements: Notice[] }) {
  const layout = screen.layout
  const count = Math.max(1, Math.min(3, layout?.mainSections ?? 1))
  const template = getDisplayTemplate(layout?.bgColor ?? null)
  const widths = getTemplateWidths(template, count)
  const theme = resolveScreenTheme(layout?.bgColor ?? null)
  return (
    <div className="h-40 flex items-center justify-center overflow-hidden p-2" style={{ background: '#e5e7eb' }}>
      <div dir="rtl" className="h-full flex flex-col overflow-hidden rounded-sm shadow-sm" style={{ width: screen.orientation === 'PORTRAIT' ? '30%' : '100%', background: theme.bg, color: theme.panelText }}>
        {layout?.headerEnabled !== false && <div className="px-2 py-1 text-[9px] font-semibold truncate" style={{ background: theme.header, color: theme.headerText }}>{screen.name}</div>}
        <div className="flex flex-1 min-h-0 gap-1 p-1">
          {Array.from({ length: count }, (_, i) => {
            const section = screen.sections.find(s => s.position === i)
            const item = section?.contentItems.find(x => x.active && x.contentType !== 'EMPTY')
            const cfg = (item?.settings && typeof item.settings === 'object' && !Array.isArray(item.settings) ? item.settings : {}) as Record<string,unknown>
            const folders = ids(cfg.folderIds), selected = ids(cfg.imageIds)
            const photo = item?.contentType === 'IMAGE_GALLERY' ? (folders.length ? media.find(m=>m.galleryId && folders.includes(m.galleryId)) : selected.length ? media.find(m=>m.id===selected[0]) : media.find(m=>m.galleryId && m.galleryId===item.galleryId)) : undefined
            const notice = item?.contentType === 'ANNOUNCEMENT' ? announcements.find(a=>ids(cfg.selectedAnnouncementIds).includes(a.id)) : undefined
            const text = plain(notice?.body ?? item?.textContent)
            const heading = notice?.title ?? (typeof cfg.title === 'string' ? cfg.title : '') ?? ''
            const priorityColor = notice?.priority === 'HIGH' || notice?.priority === 'EMERGENCY' ? '#b91c1c' : notice?.priority === 'MEDIUM' ? '#b45309' : undefined
            return <div key={i} className="min-w-0 rounded-sm p-1 flex flex-col justify-center items-center text-center overflow-hidden" style={{ flex: `${widths[i] ?? 100 / count} ${widths[i] ?? 100 / count} 0%`, background: priorityColor ?? theme.panel, color: priorityColor ? '#fff' : theme.panelText, border: `1px solid ${theme.border}` }}>
              {photo && (photo.url.startsWith('/') && !photo.url.startsWith('//') || /^https?:\/\//i.test(photo.url)) ? <img src={photo.url} alt="תמונת גלריה" loading="lazy" className="w-full h-full object-cover" /> : <>
              <span className="text-[9px] font-semibold leading-tight break-words">{heading || (item ? (labels[item.contentType] ?? item.contentType.replace(/_/g,' ')) : 'אזור ריק')}</span>
              {text && <span className="mt-1 text-[8px] leading-tight opacity-75 line-clamp-3 break-words">{text.slice(0, 110)}</span>}
              </>}
            </div>
          })}
        </div>
        {layout?.footerEnabled !== false && <div className="px-2 py-0.5 text-[8px] truncate" style={{ background: theme.footer, color: theme.footerText }}>{layout?.footerTicker || screen.name}</div>}
      </div>
    </div>
  )
}
