'use client'
// src/components/admin/editor/ContentEditor.tsx
// Inline content editor — loads, edits, and saves the single ContentItem
// for a given section. Opens below the SectionEditor type picker.

import { useState, useEffect, useCallback } from 'react'
import { Save, Trash2, X, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import type { ContentItem, ContentType, ScreenSection } from '@/types'
import SchedulingPanel, { type SchedulingValues } from './SchedulingPanel'
import TextContentForm    from './content-forms/TextContentForm'
import ClockContentForm   from './content-forms/ClockContentForm'
import DateContentForm    from './content-forms/DateContentForm'
import WeatherContentForm from './content-forms/WeatherContentForm'

interface Props {
  screenId:  string
  section:   ScreenSection
  onClose:   () => void
  onSaved:   (item: ContentItem | null) => void
}

// Fields we edit locally before persisting
type EditableItem = Partial<ContentItem> & { contentType: ContentType }

const TYPE_LABELS: Record<ContentType, string> = {
  TEXT:          'טקסט',
  IMAGE_GALLERY: 'גלריה',
  VIDEO:         'וידאו',
  CLOCK:         'שעון',
  DATE:          'תאריך',
  WEATHER:       'מזג אויר',
  RSS_FEED:      'RSS',
  TIMETABLE:     'לוח שיעורים',
  EVENTS:        'אירועים',
  BIRTHDAYS:     'ימי הולדת',
  ANNOUNCEMENT:  'הודעות',
  EMPTY:         'ריק',
}

// Types that have no extra configuration
const NO_CONFIG_TYPES: ContentType[] = ['CLOCK', 'DATE', 'EMPTY']

function defaultItem(type: ContentType): EditableItem {
  return {
    contentType:     type,
    active:          true,
    startDate:       null,
    endDate:         null,
    startTime:       null,
    endTime:         null,
    daysOfWeek:      [],
    textContent:     '',
    textColor:       '#ffffff',
    bgColor:         '#000000',
    fontSize:        24,
    galleryId:       null,
    slideDuration:   5,
    transitionStyle: 'fade',
    videoUrl:        null,
    videoLoop:       true,
    videoMuted:      true,
    rssUrl:          null,
    rssMaxItems:     5,
    weatherCity:     '',
    weatherUnits:    'metric',
  }
}

function schedulingFromItem(item: EditableItem): SchedulingValues {
  return {
    active:     item.active     ?? true,
    startDate:  item.startDate  ?? '',
    endDate:    item.endDate    ?? '',
    startTime:  item.startTime  ?? '',
    endTime:    item.endTime    ?? '',
    daysOfWeek: item.daysOfWeek ?? [],
  }
}

export default function ContentEditor({ screenId, section, onClose, onSaved }: Props) {
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [item,     setItem]     = useState<EditableItem>(
    defaultItem(section.contentItems[0]?.contentType ?? 'TEXT'),
  )
  const [existingId, setExistingId] = useState<string | null>(null)

  // ── Load existing content item ────────────────────────
  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const res  = await fetch(
          `/api/screens/${screenId}/sections/${section.id}/content`,
        )
        const data = await res.json()

        if (cancelled) return

        if (data.data) {
          setExistingId(data.data.id)
          setItem({
            contentType:     data.data.contentType,
            active:          data.data.active,
            startDate:       data.data.startDate  ?? null,
            endDate:         data.data.endDate    ?? null,
            startTime:       data.data.startTime  ?? '',
            endTime:         data.data.endTime    ?? '',
            daysOfWeek:      data.data.daysOfWeek ?? [],
            textContent:     data.data.textContent     ?? '',
            textColor:       data.data.textColor       ?? '#ffffff',
            bgColor:         data.data.bgColor         ?? '#000000',
            fontSize:        data.data.fontSize        ?? 24,
            galleryId:       data.data.galleryId       ?? null,
            slideDuration:   data.data.slideDuration   ?? 5,
            transitionStyle: data.data.transitionStyle ?? 'fade',
            videoUrl:        data.data.videoUrl        ?? null,
            videoLoop:       data.data.videoLoop       ?? true,
            videoMuted:      data.data.videoMuted      ?? true,
            rssUrl:          data.data.rssUrl          ?? null,
            rssMaxItems:     data.data.rssMaxItems     ?? 5,
            weatherCity:     data.data.weatherCity     ?? '',
            weatherUnits:    data.data.weatherUnits    ?? 'metric',
          })
        } else {
          // No existing item — start with current section type if set
          const type = section.contentItems[0]?.contentType ?? 'TEXT'
          setItem(defaultItem(type))
          setExistingId(null)
        }
      } catch {
        if (!cancelled) toast.error('שגיאה בטעינת התוכן')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [screenId, section.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Patch helpers ─────────────────────────────────────
  const patchItem = useCallback((patch: Partial<ContentItem>) => {
    setItem(prev => ({ ...prev, ...patch }))
  }, [])

  const patchScheduling = useCallback((patch: Partial<SchedulingValues>) => {
    setItem(prev => ({ ...prev, ...patch }))
  }, [])

  // ── Save ──────────────────────────────────────────────
  async function handleSave() {
    if (item.contentType === 'EMPTY') {
      await handleDelete()
      return
    }

    setSaving(true)
    try {
      const body = {
        contentType:     item.contentType,
        active:          item.active    ?? true,
        startDate:       item.startDate || null,
        endDate:         item.endDate   || null,
        startTime:       item.startTime || null,
        endTime:         item.endTime   || null,
        daysOfWeek:      item.daysOfWeek ?? [],
        textContent:     item.textContent   ?? null,
        textColor:       item.textColor     ?? null,
        bgColor:         item.bgColor       ?? null,
        fontSize:        item.fontSize      ?? null,
        galleryId:       item.galleryId     ?? null,
        slideDuration:   item.slideDuration ?? 5,
        transitionStyle: item.transitionStyle ?? 'fade',
        videoUrl:        item.videoUrl       ?? null,
        videoLoop:       item.videoLoop      ?? true,
        videoMuted:      item.videoMuted     ?? true,
        rssUrl:          item.rssUrl         ?? null,
        rssMaxItems:     item.rssMaxItems    ?? 5,
        weatherCity:     item.weatherCity    ?? null,
        weatherUnits:    item.weatherUnits   ?? 'metric',
      }

      // Always POST — the route does delete-then-create (upsert)
      const res = await fetch(
        `/api/screens/${screenId}/sections/${section.id}/content`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(body),
        },
      )

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'שגיאה בשמירה')
      }

      const saved = await res.json()
      setExistingId(saved.data.id)
      toast.success('התוכן נשמר')
      onSaved(saved.data)
    } catch (err: any) {
      toast.error(err.message ?? 'שגיאה בשמירת התוכן')
    } finally {
      setSaving(false)
    }
  }

  // ── Delete ────────────────────────────────────────────
  async function handleDelete() {
    if (!existingId) {
      onSaved(null)
      onClose()
      return
    }

    setDeleting(true)
    try {
      const res = await fetch(
        `/api/screens/${screenId}/sections/${section.id}/content/${existingId}`,
        { method: 'DELETE' },
      )
      if (!res.ok) throw new Error('שגיאה במחיקה')
      toast.success('התוכן נמחק')
      onSaved(null)
      onClose()
    } catch (err: any) {
      toast.error(err.message ?? 'שגיאה במחיקה')
    } finally {
      setDeleting(false)
    }
  }

  const scheduling = schedulingFromItem(item)

  return (
    <div className="bg-white border border-blue-100 rounded-xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-blue-50 border-b border-blue-100">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-blue-700">
            עריכת תוכן — {TYPE_LABELS[item.contentType] ?? item.contentType}
          </span>
          {item.active === false && (
            <span className="text-[10px] px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded-full">כבוי</span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-blue-100 text-blue-400 hover:text-blue-700 transition-colors"
          aria-label="סגור"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Body */}
      <div className="p-3 space-y-3 max-h-[60vh] overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8 gap-2 text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs">טוען...</span>
          </div>
        ) : (
          <>
            {/* Type-specific form */}
            {!NO_CONFIG_TYPES.includes(item.contentType) && (
              <div>
                {item.contentType === 'TEXT' && (
                  <TextContentForm item={item} onChange={patchItem} />
                )}
                {item.contentType === 'WEATHER' && (
                  <WeatherContentForm item={item} onChange={patchItem} />
                )}
                {item.contentType === 'IMAGE_GALLERY' && (
                  <div className="rounded-lg bg-gray-50 border border-dashed border-gray-200 p-6 text-center">
                    <p className="text-xs text-gray-400">גלריית תמונות תהיה זמינה בשלב 2</p>
                    <p className="text-[10px] text-gray-300 mt-1">יש ליצור גלריה בספריית המדיה תחילה</p>
                  </div>
                )}
                {(item.contentType === 'RSS_FEED' ||
                  item.contentType === 'VIDEO' ||
                  item.contentType === 'TIMETABLE' ||
                  item.contentType === 'EVENTS' ||
                  item.contentType === 'BIRTHDAYS' ||
                  item.contentType === 'ANNOUNCEMENT') && (
                  <div className="rounded-lg bg-gray-50 border border-dashed border-gray-200 p-6 text-center">
                    <p className="text-xs text-gray-400">
                      {TYPE_LABELS[item.contentType]} יהיה זמין בשלב 3
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Clock / Date preview */}
            {item.contentType === 'CLOCK' && <ClockContentForm />}
            {item.contentType === 'DATE'  && <DateContentForm />}

            {/* Scheduling */}
            <SchedulingPanel
              values={scheduling}
              onChange={patchScheduling}
            />
          </>
        )}
      </div>

      {/* Footer actions */}
      {!loading && (
        <div className="flex items-center gap-2 px-3 py-2.5 border-t border-gray-100 bg-gray-50">
          {existingId && item.contentType !== 'EMPTY' && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-3 h-3" />
              {deleting ? 'מוחק...' : 'מחק תוכן'}
            </button>
          )}

          <div className="flex-1" />

          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors"
          >
            ביטול
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50',
              item.contentType === 'EMPTY'
                ? 'bg-red-500 text-white hover:bg-red-600'
                : 'bg-blue-600 text-white hover:bg-blue-700',
            )}
          >
            <Save className="w-3 h-3" />
            {saving ? 'שומר...' : item.contentType === 'EMPTY' ? 'נקה תוכן' : 'שמור תוכן'}
          </button>
        </div>
      )}
    </div>
  )
}
