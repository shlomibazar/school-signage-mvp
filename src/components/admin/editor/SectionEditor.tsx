'use client'
// src/components/admin/editor/SectionEditor.tsx

import type { ScreenSection, ContentType } from '@/types'

interface Props {
  section:  ScreenSection
  index:    number
  onUpdate: (section: ScreenSection) => void
}

const CONTENT_TYPES: { value: ContentType; label: string; icon: string }[] = [
  { value: 'EMPTY',         label: 'ריק',         icon: '☐' },
  { value: 'TEXT',          label: 'טקסט',         icon: '📝' },
  { value: 'IMAGE_GALLERY', label: 'גלריה',        icon: '🖼' },
  { value: 'VIDEO',         label: 'וידאו',         icon: '🎬' },
  { value: 'CLOCK',         label: 'שעון',          icon: '🕐' },
  { value: 'DATE',          label: 'תאריך',         icon: '📅' },
  { value: 'WEATHER',       label: 'מזג אויר',      icon: '🌤' },
  { value: 'RSS_FEED',      label: 'RSS',            icon: '📰' },
  { value: 'ANNOUNCEMENT',  label: 'הודעות',        icon: '📢' },
  { value: 'EVENTS',        label: 'אירועים',       icon: '🗓' },
  { value: 'BIRTHDAYS',     label: 'ימי הולדת',    icon: '🎂' },
  { value: 'TIMETABLE',     label: 'לוח שיעורים',  icon: '📋' },
]

export default function SectionEditor({ section, index, onUpdate }: Props) {
  const currentType = section.contentItems[0]?.contentType ?? 'EMPTY'

  function handleTypeChange(type: ContentType) {
    if (type === currentType) return
    const updated: ScreenSection = {
      ...section,
      contentItems: type === 'EMPTY' ? [] : [
        {
          ...(section.contentItems[0] ?? {}),
          id:          section.contentItems[0]?.id ?? `new-${section.id}`,
          sectionId:   section.id,
          contentType: type,
          priority:    0,
          active:      true,
          startDate:   null,
          endDate:     null,
          startTime:   null,
          endTime:     null,
          daysOfWeek:  [],
          textContent:     null,
          textColor:       null,
          bgColor:         null,
          fontSize:        null,
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
        },
      ],
    }
    onUpdate(updated)
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-3 py-2.5 bg-gray-50 text-xs font-medium text-gray-500 border-b border-gray-100">
        אזור {index + 1}
      </div>
      <div className="p-3">
        <p className="text-xs text-gray-400 mb-2">סוג תוכן</p>
        <div className="grid grid-cols-3 gap-1.5">
          {CONTENT_TYPES.map(ct => (
            <button
              key={ct.value}
              onClick={() => handleTypeChange(ct.value)}
              className={`flex flex-col items-center gap-0.5 px-1 py-2 rounded-lg border text-center transition-colors ${
                currentType === ct.value
                  ? 'border-blue-400 bg-blue-50 text-blue-700'
                  : 'border-gray-100 hover:border-gray-300 text-gray-600'
              }`}
            >
              <span style={{ fontSize: 14 }}>{ct.icon}</span>
              <span className="text-[10px] leading-tight">{ct.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
