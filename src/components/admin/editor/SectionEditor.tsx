'use client'
// src/components/admin/editor/SectionEditor.tsx
// Type picker + inline ContentEditor launcher

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { ContentItem, ContentType, ScreenSection } from '@/types'
import ContentEditor from './ContentEditor'

interface Props {
  screenId:  string
  section:   ScreenSection
  index:     number
  onUpdate:  (section: ScreenSection) => void
}

const CONTENT_TYPES: { value: ContentType; label: string; icon: string }[] = [
  { value: 'EMPTY',         label: 'ריק',        icon: '☐'  },
  { value: 'TEXT',          label: 'טקסט',        icon: '📝' },
  { value: 'IMAGE_GALLERY', label: 'גלריה',       icon: '🖼' },
  { value: 'VIDEO',         label: 'וידאו',        icon: '🎬' },
  { value: 'CLOCK',         label: 'שעון',         icon: '🕐' },
  { value: 'DATE',          label: 'תאריך',        icon: '📅' },
  { value: 'WEATHER',       label: 'מזג אויר',     icon: '🌤' },
  { value: 'RSS_FEED',      label: 'RSS',           icon: '📰' },
  { value: 'ANNOUNCEMENT',  label: 'הודעות',       icon: '📢' },
  { value: 'EVENTS',        label: 'אירועים',      icon: '🗓' },
  { value: 'BIRTHDAYS',     label: 'ימי הולדת',   icon: '🎂' },
  { value: 'TIMETABLE',     label: 'לוח שיעורים', icon: '📋' },
]

export default function SectionEditor({ screenId, section, index, onUpdate }: Props) {
  const currentType   = section.contentItems[0]?.contentType ?? 'EMPTY'
  const [editorOpen,  setEditorOpen]  = useState(false)
  const [localSection, setLocalSection] = useState<ScreenSection>(section)

  function handleTypeClick(type: ContentType) {
    // Update local section optimistically so the type grid reflects the pick
    const patched: ScreenSection = {
      ...localSection,
      contentItems:
        type === 'EMPTY'
          ? []
          : [
              {
                ...(localSection.contentItems[0] ?? buildStub(localSection.id)),
                contentType: type,
              } as ContentItem,
            ],
    }
    setLocalSection(patched)
    onUpdate(patched)

    // Open editor for configurable types; close for EMPTY
    if (type === 'EMPTY') {
      setEditorOpen(false)
    } else {
      setEditorOpen(true)
    }
  }

  function handleSaved(saved: ContentItem | null) {
    const patched: ScreenSection = {
      ...localSection,
      contentItems: saved ? [saved] : [],
    }
    setLocalSection(patched)
    onUpdate(patched)
  }

  const displayType = localSection.contentItems[0]?.contentType ?? 'EMPTY'

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      {/* Section header */}
      <div className="px-3 py-2.5 bg-gray-50 text-xs font-medium text-gray-500 border-b border-gray-100 flex items-center justify-between">
        <span>אזור {index + 1}</span>
        {displayType !== 'EMPTY' && (
          <button
            onClick={() => setEditorOpen(v => !v)}
            className={cn(
              'text-[10px] px-2 py-0.5 rounded-full transition-colors',
              editorOpen
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-500 hover:bg-blue-50 hover:text-blue-600',
            )}
          >
            {editorOpen ? 'סגור עריכה' : 'ערוך תוכן'}
          </button>
        )}
      </div>

      {/* Type grid */}
      <div className="p-3">
        <p className="text-[10px] text-gray-400 mb-2">סוג תוכן</p>
        <div className="grid grid-cols-3 gap-1.5">
          {CONTENT_TYPES.map(ct => (
            <button
              key={ct.value}
              onClick={() => handleTypeClick(ct.value)}
              className={cn(
                'flex flex-col items-center gap-0.5 px-1 py-2 rounded-lg border text-center transition-colors',
                displayType === ct.value
                  ? 'border-blue-400 bg-blue-50 text-blue-700'
                  : 'border-gray-100 hover:border-gray-300 text-gray-600',
              )}
            >
              <span style={{ fontSize: 14 }}>{ct.icon}</span>
              <span className="text-[10px] leading-tight">{ct.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Inline ContentEditor */}
      {editorOpen && displayType !== 'EMPTY' && (
        <div className="px-3 pb-3">
          <ContentEditor
            screenId={screenId}
            section={localSection}
            onClose={() => setEditorOpen(false)}
            onSaved={handleSaved}
          />
        </div>
      )}
    </div>
  )
}

// Minimal stub when a section has no existing item yet
function buildStub(sectionId: string): Omit<ContentItem, 'contentType'> {
  return {
    id:              `new-${sectionId}`,
    sectionId,
    priority:        0,
    active:          true,
    startDate:       null,
    endDate:         null,
    startTime:       null,
    endTime:         null,
    daysOfWeek:      [],
    textContent:     null,
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
    weatherCity:     null,
    weatherUnits:    'metric',
  }
}
