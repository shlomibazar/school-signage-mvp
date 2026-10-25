'use client'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import type { ContentItem, ContentType, ScreenSection } from '@/types'
import ContentEditor from './ContentEditor'

interface Props {
  screenId: string; section: ScreenSection; index: number
  isTemp: boolean; onUpdate: (s: ScreenSection) => void
}

const CONTENT_TYPES: { value: ContentType; label: string; icon: string }[] = [
  { value: 'EMPTY',         label: 'ריק',        icon: '☐'  },
  { value: 'IMAGE_GALLERY', label: 'גלריה',       icon: '🖼' },
  { value: 'VIDEO',         label: 'וידאו',        icon: '🎬' },
  { value: 'RSS_FEED',      label: 'RSS',           icon: '📰' },
  { value: 'ANNOUNCEMENT',  label: 'הודעה',        icon: '📢' },
  { value: 'EVENTS',        label: 'אירועים',      icon: '🗓' },
  { value: 'BIRTHDAYS',     label: 'ימי הולדת',   icon: '🎂' },
  { value: 'TIMETABLE',     label: 'לוח/תפריט',   icon: '📋' },
]

function buildStub(sectionId: string): Omit<ContentItem,'contentType'> {
  return {
    id: `new-${sectionId}`, sectionId, priority: 0, active: true,
    startDate: null, endDate: null, startTime: null, endTime: null, daysOfWeek: [],
    textContent: null, textColor: '#ffffff', bgColor: '#000000', fontSize: 24,
    galleryId: null, slideDuration: 5, transitionStyle: 'fade',
    videoUrl: null, videoLoop: true, videoMuted: true,
    rssUrl: null, rssMaxItems: 5, weatherCity: null, weatherUnits: 'metric', settings: null,
  }
}

export default function SectionEditor({ screenId, section, index, isTemp, onUpdate }: Props) {
  const [localSection,  setLocalSection]  = useState<ScreenSection>(section)
  const [editorOpen,    setEditorOpen]    = useState(false)
  const [selectedType,  setSelectedType]  = useState<ContentType>(section.contentItems[0]?.contentType ?? 'EMPTY')

  useEffect(() => {
    setLocalSection(section)
    setSelectedType(section.contentItems[0]?.contentType ?? 'EMPTY')
  }, [section.id, section.contentItems])

  function handleTypeClick(type: ContentType) {
    setSelectedType(type)
    const patched: ScreenSection = {
      ...localSection,
      contentItems: type === 'EMPTY' ? [] : [{ ...(localSection.contentItems[0] ?? buildStub(localSection.id)), contentType: type } as ContentItem],
    }
    setLocalSection(patched); onUpdate(patched)
    setEditorOpen(type !== 'EMPTY')
  }

  function handleDraft(draft: Partial<ContentItem>) {
    const original = localSection.contentItems[0] ?? buildStub(localSection.id)
    onUpdate({ ...localSection, contentItems: [{ ...original, ...draft, id: original.id, sectionId: localSection.id } as ContentItem] })
  }

  function handleSaved(saved: ContentItem | null) {
    const patched: ScreenSection = { ...localSection, contentItems: saved ? [saved] : [] }
    setLocalSection(patched); setSelectedType(saved?.contentType ?? 'EMPTY'); onUpdate(patched)
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-3 py-2.5 bg-gray-50 text-xs font-medium text-gray-500 border-b border-gray-100 flex items-center justify-between">
        <span>אזור {index + 1}</span>
        {!isTemp && selectedType !== 'EMPTY' && (
          <button onClick={() => setEditorOpen(v => !v)}
            className={cn('text-[10px] px-2 py-0.5 rounded-full transition-colors',
              editorOpen ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500 hover:bg-blue-50 hover:text-blue-600')}>
            {editorOpen ? 'סגור' : 'ערוך תוכן'}
          </button>
        )}
      </div>
      {isTemp ? (
        <div className="p-4 text-center text-xs text-gray-400">שמור את הפריסה תחילה כדי לערוך תוכן</div>
      ) : (
        <>
          <div className="p-3">
            <p className="text-[10px] text-gray-400 mb-2">סוג תוכן</p>
            <div className="grid grid-cols-4 gap-1">
              {CONTENT_TYPES.map(ct => (
                <button key={ct.value} onClick={() => handleTypeClick(ct.value)}
                  className={cn('flex flex-col items-center gap-0.5 px-1 py-2 rounded-lg border text-center transition-colors',
                    selectedType === ct.value ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-100 hover:border-gray-300 text-gray-600')}>
                  <span style={{ fontSize: 14 }}>{ct.icon}</span>
                  <span className="text-[9px] leading-tight">{ct.label}</span>
                </button>
              ))}
            </div>
          </div>
          {editorOpen && selectedType !== 'EMPTY' && (
            <div className="px-3 pb-3">
              <ContentEditor
                key={`${localSection.id}::${selectedType}`}
                screenId={screenId} section={localSection} selectedType={selectedType}
                onClose={() => { setEditorOpen(false); onUpdate(localSection) }} onSaved={handleSaved} onDraftChange={handleDraft}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}
