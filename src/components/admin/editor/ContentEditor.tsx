'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Save, Trash2, X, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import type {
  ContentItem, ContentType, ScreenSection,
  ClockSettings, DateSettings, RssSettings, VideoSettings,
  GallerySettings, AnnouncementContentSettings,
  BirthdaySettings, EventSettings, TimetableSettings, ContentSettings,
} from '@/types'
import SchedulingPanel, { type SchedulingValues } from './SchedulingPanel'
import TextContentForm         from './content-forms/TextContentForm'
import ClockContentForm        from './content-forms/ClockContentForm'
import DateContentForm         from './content-forms/DateContentForm'
import WeatherContentForm      from './content-forms/WeatherContentForm'
import RssContentForm          from './content-forms/RssContentForm'
import VideoContentForm        from './content-forms/VideoContentForm'
import GalleryContentForm      from './content-forms/GalleryContentForm'
import AnnouncementContentForm from './content-forms/AnnouncementContentForm'
import BirthdayContentForm     from './content-forms/BirthdayContentForm'
import EventsContentForm       from './content-forms/EventsContentForm'
import TimetableContentForm    from './content-forms/TimetableContentForm'

const DEFAULT_CLOCK:        ClockSettings               = { hourFormat: '24', showSeconds: false }
const DEFAULT_DATE:         DateSettings                = { dateFormat: 'full', locale: 'he' }
const DEFAULT_RSS:          RssSettings                 = { refreshInterval: 15, displayStyle: 'list' }
const DEFAULT_VIDEO:        VideoSettings               = { showControls: false }
const DEFAULT_GALLERY:      GallerySettings             = { showCaptions: true, showDots: true, imageIds: [], folderIds: [], imageFit: "contain", displayMode: "slideshow", imageOrder: "random", showGallery: true, showSectionTitle: true, sectionTitle: "גלריית תמונות", sectionTitleSize: "normal" }
const DEFAULT_ANNOUNCEMENT: AnnouncementContentSettings = { title: '', priority: 'info', style: 'banner', icon: '📢', items: [], rotationSecs: 10, showSectionTitle: true, sectionTitle: 'הודעות כלליות', sectionTitleSize: 'normal' }
const DEFAULT_BIRTHDAY:     BirthdaySettings            = { personName: '', grade: '', birthDate: '', greetingText: 'יום הולדת שמח! 🎂' }
const DEFAULT_EVENT:        EventSettings               = { eventTitle: '', eventDate: '', eventTime: '', location: '', description: '' }
const DEFAULT_TIMETABLE:    TimetableSettings           = { title: '', menuText: '', items: [] }

function defaultSettingsFor(type: ContentType): ContentSettings {
  switch (type) {
    case 'CLOCK':         return { ...DEFAULT_CLOCK }
    case 'DATE':          return { ...DEFAULT_DATE }
    case 'RSS_FEED':      return { ...DEFAULT_RSS }
    case 'VIDEO':         return { ...DEFAULT_VIDEO }
    case 'IMAGE_GALLERY': return { ...DEFAULT_GALLERY }
    case 'ANNOUNCEMENT':  return { ...DEFAULT_ANNOUNCEMENT }
    case 'BIRTHDAYS':     return { ...DEFAULT_BIRTHDAY }
    case 'EVENTS':        return { ...DEFAULT_EVENT }
    case 'TIMETABLE':     return { ...DEFAULT_TIMETABLE }
    default:              return {} as Record<string,never>
  }
}

type EditableItem = Partial<ContentItem> & { contentType: ContentType }

function makeDefault(type: ContentType): EditableItem {
  return {
    contentType: type, active: true, startDate: null, endDate: null,
    startTime: null, endTime: null, daysOfWeek: [],
    textContent: '', textColor: '#ffffff', bgColor: '#000000', fontSize: 24,
    galleryId: null, slideDuration: 5, transitionStyle: 'fade',
    videoUrl: null, videoLoop: true, videoMuted: true,
    rssUrl: null, rssMaxItems: 5, weatherCity: '', weatherUnits: 'metric',
    settings: defaultSettingsFor(type),
  }
}

function schedulingFrom(item: EditableItem): SchedulingValues {
  return { active: item.active ?? true, startDate: item.startDate ?? '', endDate: item.endDate ?? '',
           startTime: item.startTime ?? '', endTime: item.endTime ?? '', daysOfWeek: item.daysOfWeek ?? [] }
}

const TYPE_LABELS: Record<ContentType, string> = {
  TEXT:'טקסט', IMAGE_GALLERY:'גלריה', VIDEO:'וידאו', CLOCK:'שעון', DATE:'תאריך',
  WEATHER:'מזג אויר', RSS_FEED:'RSS', TIMETABLE:'לוח/תפריט', EVENTS:'אירועים',
  BIRTHDAYS:'ימי הולדת', ANNOUNCEMENT:'הודעה', EMPTY:'ריק',
}

interface Props {
  screenId: string; section: ScreenSection; selectedType: ContentType
  onClose: () => void; onSaved: (item: ContentItem | null) => void; onDraftChange?: (item: EditableItem) => void
}

export default function ContentEditor({ screenId, section, selectedType, onClose, onSaved, onDraftChange }: Props) {
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [deleting,   setDeleting]   = useState(false)
  const [existingId, setExistingId] = useState<string | null>(null)
  const [item,       setItem]       = useState<EditableItem>(makeDefault(selectedType))

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const res  = await fetch(`/api/screens/${screenId}/sections/${section.id}/content`)
        const data = await res.json()
        if (cancelled) return
        if (data.data) {
          const d = data.data
          const typeMatches = d.contentType === selectedType
          setExistingId(d.id)
          setItem({
            contentType: selectedType, active: d.active,
            startDate: d.startDate ?? null, endDate: d.endDate ?? null,
            startTime: d.startTime ?? '', endTime: d.endTime ?? '', daysOfWeek: d.daysOfWeek ?? [],
            textContent:     typeMatches ? (d.textContent     ?? '') : '',
            textColor:       typeMatches ? (d.textColor       ?? '#ffffff') : '#ffffff',
            bgColor:         typeMatches ? (d.bgColor         ?? '#000000') : '#000000',
            fontSize:        typeMatches ? (d.fontSize        ?? 24) : 24,
            galleryId:       typeMatches ? (d.galleryId       ?? null) : null,
            slideDuration:   typeMatches ? (d.slideDuration   ?? 5) : 5,
            transitionStyle: typeMatches ? (d.transitionStyle ?? 'fade') : 'fade',
            videoUrl:        typeMatches ? (d.videoUrl        ?? null) : null,
            videoLoop:       typeMatches ? (d.videoLoop       ?? true) : true,
            videoMuted:      typeMatches ? (d.videoMuted      ?? true) : true,
            rssUrl:          typeMatches ? (d.rssUrl          ?? null) : null,
            rssMaxItems:     typeMatches ? (d.rssMaxItems     ?? 5) : 5,
            weatherCity:     typeMatches ? (d.weatherCity     ?? '') : '',
            weatherUnits:    typeMatches ? (d.weatherUnits    ?? 'metric') : 'metric',
            settings:        typeMatches ? ((d.settings as ContentSettings) ?? defaultSettingsFor(selectedType)) : defaultSettingsFor(selectedType),
          })
        } else {
          setExistingId(null); setItem(makeDefault(selectedType))
        }
      } catch { if (!cancelled) toast.error('שגיאה בטעינת התוכן') }
      finally { if (!cancelled) setLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [screenId, section.id, selectedType])

  // Preview only: propagate the draft without saving it to the public screen.
  const draftCallback = useRef(onDraftChange)
  draftCallback.current = onDraftChange
  useEffect(() => { if (!loading) draftCallback.current?.(item) }, [item, loading])

  const patchItem     = useCallback((patch: Partial<ContentItem>) => setItem(prev => ({ ...prev, ...patch })), [])
  const patchSchedule = useCallback((patch: Partial<SchedulingValues>) => setItem(prev => ({ ...prev, ...patch })), [])
  const patchSettings = useCallback((s: ContentSettings) => setItem(prev => ({ ...prev, settings: s })), [])

  const asSettings = <T,>(fallback: T): T =>
    ((item.settings && Object.keys(item.settings).length > 0 ? item.settings : fallback) as unknown) as T

  async function handleSave() {
    if (selectedType === 'EMPTY') { await handleDelete(); return }
    setSaving(true)
    try {
      const body = {
        contentType: item.contentType, active: item.active ?? true,
        startDate: item.startDate || null, endDate: item.endDate || null,
        startTime: item.startTime || null, endTime: item.endTime || null,
        daysOfWeek: item.daysOfWeek ?? [],
        textContent: item.textContent ?? null, textColor: item.textColor ?? null,
        bgColor: item.bgColor ?? null, fontSize: item.fontSize ?? null,
        galleryId: item.galleryId ?? null, slideDuration: item.slideDuration ?? 5,
        transitionStyle: item.transitionStyle ?? 'fade',
        videoUrl: item.videoUrl ?? null, videoLoop: item.videoLoop ?? true, videoMuted: item.videoMuted ?? true,
        rssUrl: item.rssUrl ?? null, rssMaxItems: item.rssMaxItems ?? 5,
        weatherCity: item.weatherCity ?? null, weatherUnits: item.weatherUnits ?? 'metric',
        settings: item.settings ?? null,
      }
      const res = await fetch(`/api/screens/${screenId}/sections/${section.id}/content`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'שגיאה') }
      const saved = await res.json()
      setExistingId(saved.data.id); toast.success('התוכן נשמר'); onSaved(saved.data)
    } catch (err: any) { toast.error(err.message ?? 'שגיאה') }
    finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!existingId) { onSaved(null); onClose(); return }
    setDeleting(true)
    try {
      const res = await fetch(`/api/screens/${screenId}/sections/${section.id}/content/${existingId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('שגיאה במחיקה')
      toast.success('התוכן נמחק'); onSaved(null); onClose()
    } catch (err: any) { toast.error(err.message) }
    finally { setDeleting(false) }
  }

  return (
    <div className="bg-white border border-blue-100 rounded-xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-3 py-2.5 bg-blue-50 border-b border-blue-100">
        <span className="text-xs font-semibold text-blue-700">עריכת תוכן — {TYPE_LABELS[selectedType]}</span>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={handleSave} disabled={saving || loading || deleting}
            title="שמור את התוכן בלי לסגור את העורך"
            className="flex items-center gap-1 rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Save className="w-3.5 h-3.5"/>}
            {saving ? 'שומר...' : 'שמור'}
          </button>
          <button type="button" onClick={onClose} title="סגור עריכה" className="p-1 rounded hover:bg-blue-100 text-blue-400 hover:text-blue-700 transition-colors">
            <X className="w-3.5 h-3.5"/>
          </button>
        </div>
      </div>
      <div className="p-3 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-10 gap-2 text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin"/><span className="text-xs">טוען...</span>
          </div>
        ) : (
          <>
            {selectedType==='TEXT'          && <TextContentForm item={item} onChange={patchItem}/>}
            {selectedType==='CLOCK'         && <ClockContentForm settings={asSettings<ClockSettings>(DEFAULT_CLOCK)} onChange={patchSettings}/>}
            {selectedType==='DATE'          && <DateContentForm settings={asSettings<DateSettings>(DEFAULT_DATE)} onChange={patchSettings}/>}
            {selectedType==='WEATHER'       && <WeatherContentForm item={item} onChange={patchItem}/>}
            {selectedType==='RSS_FEED'      && <RssContentForm item={item} settings={asSettings<RssSettings>(DEFAULT_RSS)} onChange={patchItem} onSettings={patchSettings}/>}
            {selectedType==='VIDEO'         && <VideoContentForm item={item} settings={asSettings<VideoSettings>(DEFAULT_VIDEO)} onChange={patchItem} onSettings={patchSettings}/>}
            {selectedType==='IMAGE_GALLERY' && <GalleryContentForm item={item} settings={asSettings<GallerySettings>(DEFAULT_GALLERY)} onChange={patchItem} onSettings={patchSettings}/>}
            {selectedType==='ANNOUNCEMENT'  && <AnnouncementContentForm settings={asSettings<AnnouncementContentSettings>(DEFAULT_ANNOUNCEMENT)} onSettings={patchSettings}/>}
            {selectedType==='BIRTHDAYS'     && <BirthdayContentForm settings={asSettings<BirthdaySettings>(DEFAULT_BIRTHDAY)} onSettings={patchSettings}/>}
            {selectedType==='EVENTS'        && <EventsContentForm settings={asSettings<EventSettings>(DEFAULT_EVENT)} onSettings={patchSettings}/>}
            {selectedType==='TIMETABLE'     && <TimetableContentForm settings={asSettings<TimetableSettings>(DEFAULT_TIMETABLE)} onSettings={patchSettings}/>}
            {selectedType==='EMPTY'         && (
              <div className="rounded-lg bg-gray-50 border border-dashed border-gray-200 p-8 text-center">
                <p className="text-sm text-gray-400">אזור זה ריק — בחר סוג תוכן אחר</p>
              </div>
            )}
            {selectedType!=='EMPTY' && selectedType!=='ANNOUNCEMENT' && <SchedulingPanel values={schedulingFrom(item)} onChange={patchSchedule}/>}
          </>
        )}
      </div>
      {!loading && (
        <div className="flex items-center gap-2 px-3 py-2.5 border-t border-gray-100 bg-gray-50">
          {existingId && selectedType!=='EMPTY' && (
            <button onClick={handleDelete} disabled={deleting}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition-colors disabled:opacity-50">
              <Trash2 className="w-3 h-3"/>{deleting?'מסיר...':'הסר אזור מהפריסה'}
            </button>
          )}
          <div className="flex-1"/>
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors">ביטול</button>
          <button onClick={handleSave} disabled={saving}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50',
              selectedType==='EMPTY' ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-blue-600 text-white hover:bg-blue-700')}>
            <Save className="w-3 h-3"/>{saving?'שומר...':'שמור תוכן'}
          </button>
        </div>
      )}
    </div>
  )
}
