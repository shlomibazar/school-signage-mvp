'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Save, X, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
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
import IframeContentForm       from './content-forms/IframeContentForm'
import { checkExternalUrl } from '@/lib/externalUrl'
import { saveErrorMessage } from '@/lib/saveErrors'
import { setDraftDirty, confirmDiscardDraft } from '@/lib/unsavedChanges'
import { announcementIdsOf } from '@/lib/announcementMerge'
import { contentTypeLabel } from '@/lib/contentTypes'
import { confirmDialog } from '@/components/ui/ConfirmHost'

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
    case 'IFRAME':        return { url: '' } as unknown as ContentSettings
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

interface Props {
  screenId: string; section: ScreenSection; selectedType: ContentType
  onClose: () => void; onSaved: (item: ContentItem | null) => void; onDraftChange?: (item: EditableItem) => void
  /** Reports whether the form has unsaved changes. */
  onDirtyChange?: (dirty: boolean) => void
  /** Lets the region header offer the same save (a second "שמירת תוכן" at the top of the form):
   *  the very same handleSave, with its guards, confirmations and error handling. */
  onSaveControl?: (control: SaveControl | null) => void
}

export type SaveControl = { save: () => void; saving: boolean; canSave: boolean }

export default function ContentEditor({ screenId, section, selectedType, onClose, onSaved, onDraftChange, onDirtyChange, onSaveControl }: Props) {
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [existingId, setExistingId] = useState<string | null>(null)
  // The type of the content stored in the region (null when the region is empty).
  const [storedType, setStoredType] = useState<ContentType | null>(null)
  const savingRef = useRef(false)
  // Announcement ids of the stored region when it was loaded (the base for merging on save).
  const baseAnnouncementIds = useRef<string[] | undefined>(undefined)
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
          setUnsavedType(!typeMatches)
          setExistingId(d.id); setStoredType(d.contentType)
          baseAnnouncementIds.current = d.contentType === 'ANNOUNCEMENT' ? announcementIdsOf(d.settings) : undefined
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
          setUnsavedType(true)
          baseAnnouncementIds.current = undefined
          setExistingId(null); setStoredType(null); setItem(makeDefault(selectedType))
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

  // Unsaved draft tracking. The baseline is taken shortly after loading, once the content forms
  // have applied their own defaults, so opening a form never counts as a change. A content type
  // that differs from the saved one (or new content) is unsaved until it is saved.
  const [unsavedType, setUnsavedType] = useState(false)
  const [baseline, setBaseline] = useState<string | null>(null)
  const itemRef = useRef(item)
  itemRef.current = item
  useEffect(() => {
    if (loading) { setBaseline(null); return }
    const t = window.setTimeout(() => setBaseline(JSON.stringify(itemRef.current)), 50)
    return () => window.clearTimeout(t)
  }, [loading])
  const dirty = !loading && baseline !== null && (unsavedType || JSON.stringify(item) !== baseline)
  useEffect(() => {
    setDraftDirty(section.id, dirty)
    dirtyCallback.current?.(dirty)
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty, section.id])
  const dirtyCallback = useRef(onDirtyChange)
  dirtyCallback.current = onDirtyChange
  useEffect(() => () => { setDraftDirty(section.id, false); dirtyCallback.current?.(false) }, [section.id])
  const requestClose = async () => { if (!dirty || await confirmDiscardDraft()) onClose() }

  const patchItem     = useCallback((patch: Partial<ContentItem>) => setItem(prev => ({ ...prev, ...patch })), [])
  const patchSchedule = useCallback((patch: Partial<SchedulingValues>) => setItem(prev => ({ ...prev, ...patch })), [])
  const patchSettings = useCallback((s: ContentSettings) => setItem(prev => ({ ...prev, settings: s })), [])

  const iframeUrl = typeof (item.settings as { url?: unknown } | null)?.url === 'string' ? (item.settings as unknown as { url: string }).url : ''

  const asSettings = <T,>(fallback: T): T =>
    ((item.settings && Object.keys(item.settings).length > 0 ? item.settings : fallback) as unknown) as T

  // The header's save button calls the latest handleSave (through a ref), so there is one save path.
  const saveRef = useRef<() => void>(() => {})
  saveRef.current = () => { void handleSave() }
  const controlCallback = useRef(onSaveControl)
  controlCallback.current = onSaveControl
  useEffect(() => {
    controlCallback.current?.({ save: () => saveRef.current(), saving, canSave: !loading && dirty && !saving })
  }, [saving, loading, dirty])
  useEffect(() => () => controlCallback.current?.(null), [])

  async function handleSave() {
    if (savingRef.current || selectedType === 'EMPTY') return
    // The server checks the address again; this only spares a request that would be refused.
    if (selectedType === 'IFRAME') {
      const check = checkExternalUrl(iframeUrl, [window.location.host])
      if (!check.ok) { toast.error(check.error); return }
    }
    // Saving another type over stored content replaces it: ask first.
    if (existingId && storedType && storedType !== selectedType) {
      const ok = await confirmDialog({
        title: 'להחליף את התוכן באזור?',
        body: <>
          <p>התוכן השמור באזור (<b>״{contentTypeLabel(storedType)}״</b>) יוחלף ב<b>״{contentTypeLabel(selectedType)}״</b>.</p>
          {storedType === 'ANNOUNCEMENT' && <p className="mt-2">ההודעות עצמן לא יימחקו — רק השיוך שלהן לאזור הזה.</p>}
        </>,
        confirmLabel: 'החלפת התוכן',
      })
      if (!ok) return
    }
    savingRef.current = true
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
        // The announcement list as loaded: the server applies only this editor's changes to it.
        ...(baseAnnouncementIds.current ? { baseAnnouncementIds: baseAnnouncementIds.current } : {}),
      }
      const res = await fetch(`/api/screens/${screenId}/sections/${section.id}/content`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!res.ok) throw new Error(saveErrorMessage(res.status, await res.json().catch(() => null)))
      const saved = await res.json()
      // Show what was stored: the announcement list may include assignments made elsewhere meanwhile.
      const next = saved.data.contentType === 'ANNOUNCEMENT' ? { ...item, settings: saved.data.settings as ContentSettings } : item
      baseAnnouncementIds.current = saved.data.contentType === 'ANNOUNCEMENT' ? announcementIdsOf(saved.data.settings) : undefined
      setItem(next)
      setExistingId(saved.data.id); setStoredType(saved.data.contentType); setUnsavedType(false); setBaseline(JSON.stringify(next)); toast.success('התוכן נשמר'); onSaved(saved.data)
    } catch (err: any) { toast.error(err.message ?? 'שגיאה') }
    finally { savingRef.current = false; setSaving(false) }
  }


  return (
    <div className="overflow-hidden rounded-ui border border-ui-primary-line bg-ui-surface">
      <div className="flex items-center justify-between gap-2 border-b border-ui-primary-line bg-ui-primary-soft px-3 py-2">
        <span data-content-editor-title tabIndex={-1} className="rounded text-[13px] font-semibold text-ui-primary-ink outline-none focus-visible:ring-2 focus-visible:ring-ui-primary">עריכת תוכן · {contentTypeLabel(selectedType)}</span>
        <button type="button" onClick={requestClose} aria-label="סגירת עריכת התוכן"
          className="ui-focus grid h-8 w-8 place-items-center rounded-ui-sm text-ui-primary-ink hover:bg-white/60">
          <X className="h-4 w-4" aria-hidden="true"/>
        </button>
      </div>
      <div className="p-3 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-10 gap-2 text-ui-muted">
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
            {selectedType==='IFRAME'        && <IframeContentForm url={iframeUrl} onChange={url => patchSettings({ url } as unknown as ContentSettings)}/>}
            {selectedType!=='ANNOUNCEMENT' && <SchedulingPanel values={schedulingFrom(item)} onChange={patchSchedule}/>}
          </>
        )}
      </div>
      {!loading && (
        // The region's own save: content is stored separately from the layout ("שמירת פריסה").
        <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-ui-border bg-ui-subtle px-3 py-2.5">
          <span className="min-w-0 flex-1 text-xs" aria-live="polite">
            {dirty ? <span className="inline-flex items-center gap-1.5 font-medium text-amber-700"><span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true"/>שינויים בתוכן לא נשמרו</span>
              : existingId ? <span className="text-ui-muted">התוכן שמור</span> : null}
          </span>
          <button type="button" onClick={requestClose} className="ui-focus h-9 rounded-ui-sm border border-ui-border-strong bg-ui-surface px-3 text-[13px] text-ui-ink-2 hover:bg-ui-subtle">ביטול</button>
          <button type="button" onClick={handleSave} disabled={saving || !dirty}
            className="ui-focus inline-flex h-9 items-center gap-1.5 rounded-ui-sm bg-ui-primary px-3 text-[13px] font-medium text-white hover:bg-ui-primary-hover disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true"/> : <Save className="h-4 w-4" aria-hidden="true"/>}{saving ? 'שומר...' : 'שמירת תוכן'}
          </button>
        </div>
      )}
    </div>
  )
}
