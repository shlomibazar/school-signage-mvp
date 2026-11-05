'use client'
import { useEffect, useRef, useState } from 'react'
import { Pencil, Repeat2, Eraser, AlertTriangle, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { isDraftDirty, confirmDiscardDraft } from '@/lib/unsavedChanges'
import { confirmDialog } from '@/components/ui/ConfirmHost'
import { Button } from '@/components/ui/Button'
import { contentTypeLabel } from '@/lib/contentTypes'
import type { ContentItem, ContentType, ScreenSection } from '@/types'
import ContentEditor from './ContentEditor'
import ContentTypePicker, { CONTENT_ICONS } from './ContentTypePicker'

interface Props {
  screenId: string; section: ScreenSection; index: number; widthPct?: number
  isTemp: boolean; onUpdate: (s: ScreenSection) => void
  /** Unsaved content in this region's form (shown on the region selector and in the save status). */
  onDirtyChange?: (sectionId: string, dirty: boolean) => void
}

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

// One content region. Nothing here changes stored content without an explicit action:
// - choosing another type only changes the form and the preview; the stored content is replaced
//   when the region's content is saved (ContentEditor asks first);
// - "ריקון האזור" removes the stored content after a confirmation.
export default function SectionEditor({ screenId, section, index, widthPct, isTemp, onUpdate, onDirtyChange }: Props) {
  const initial = section.contentItems[0] && !section.contentItems[0].id.startsWith('new-') ? section.contentItems[0] : null
  const [saved, setSaved] = useState<ContentItem | null>(initial)
  const [selectedType, setSelectedType] = useState<ContentType>(initial?.contentType ?? 'EMPTY')
  const [pickerOpen, setPickerOpen] = useState(!initial)
  const [editorOpen, setEditorOpen] = useState(!!initial)
  const [dirty, setDirty] = useState(false)
  const sectionRef = useRef(section)
  sectionRef.current = section
  // Keyboard focus after the picker closes (its buttons disappear): the new form, or "החלפת סוג".
  const rootRef = useRef<HTMLElement>(null)
  const [focusTarget, setFocusTarget] = useState<'form' | 'change' | null>(null)
  useEffect(() => {
    if (!focusTarget) return
    const root = rootRef.current
    const el = focusTarget === 'form' ? root?.querySelector<HTMLElement>('[data-content-editor-title]') : root?.querySelector<HTMLElement>('[data-change-type]')
    if (el) { el.focus(); setFocusTarget(null) }
  }, [focusTarget, editorOpen, pickerOpen])
  const regionName = `אזור ${index + 1}`

  // The preview shows the region's draft; these put the given items into the layout's section list.
  const preview = (items: ContentItem[]) => onUpdate({ ...sectionRef.current, contentItems: items })
  const showSaved = () => preview(saved ? [saved] : [])

  async function chooseType(type: ContentType) {
    if (type === selectedType) { setPickerOpen(false); setEditorOpen(true); setFocusTarget('form'); return }
    // Switching the type replaces the open form: ask first if it has unsaved changes.
    if (isDraftDirty(section.id) && !(await confirmDiscardDraft())) return
    setSelectedType(type); setPickerOpen(false); setEditorOpen(true); setFocusTarget('form')
    preview([{ ...(saved ?? buildStub(section.id)), contentType: type } as ContentItem])
  }

  /** "חזרה לתוכן השמור": back to the stored type, with its form open. */
  async function backToSaved() {
    if (isDraftDirty(section.id) && !(await confirmDiscardDraft())) return
    setSelectedType(saved?.contentType ?? 'EMPTY'); setPickerOpen(!saved); setEditorOpen(!!saved); showSaved()
  }

  /** The form was closed (after confirming any discard): show the stored content, form closed. */
  function closeEditor() {
    setSelectedType(saved?.contentType ?? 'EMPTY'); setPickerOpen(!saved); setEditorOpen(false); showSaved()
  }

  async function clearRegion() {
    if (!saved) { backToSaved(); return }
    const wasAnnouncements = saved.contentType === 'ANNOUNCEMENT'
    const ok = await confirmDialog({
      title: 'לרוקן את האזור?',
      body: <>
        <p>התוכן <b>״{contentTypeLabel(saved.contentType)}״</b> יוסר מ{regionName}, והאזור יוצג ריק במסך.</p>
        {wasAnnouncements && <p className="mt-2">ההודעות עצמן לא יימחקו — רק השיוך שלהן לאזור הזה.</p>}
      </>,
      confirmLabel: 'ריקון האזור',
      action: async () => {
        const r = await fetch(`/api/screens/${encodeURIComponent(screenId)}/sections/${encodeURIComponent(section.id)}/content/${encodeURIComponent(saved.id)}`, { method: 'DELETE' })
        if (!r.ok) throw new Error(r.status === 403 ? 'אין לך הרשאה לשנות את תוכן המסך' : 'ריקון האזור נכשל. נסו שוב.')
      },
    })
    if (!ok) return
    setSaved(null); setSelectedType('EMPTY'); setEditorOpen(false); setPickerOpen(true); preview([])
    toast.success(`${regionName} רוקן`)
  }

  function handleSaved(item: ContentItem | null) {
    setSaved(item); setSelectedType(item?.contentType ?? 'EMPTY'); preview(item ? [item] : [])
  }

  function handleDirty(next: boolean) { setDirty(next); onDirtyChange?.(section.id, next) }

  const Icon = selectedType !== 'EMPTY' ? CONTENT_ICONS[selectedType] : null
  const replacing = !!saved && selectedType !== 'EMPTY' && selectedType !== saved.contentType

  return (
    <section ref={rootRef} aria-label={regionName} className="rounded-ui-lg border border-ui-border bg-ui-surface">
      <header className="flex items-center justify-between gap-2 border-b border-ui-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="text-sm font-semibold text-ui-ink">{regionName}</h3>
          {widthPct != null && <span className="text-xs text-ui-muted">{Math.round(widthPct)}%</span>}
        </div>
        {dirty && <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700"><span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />תוכן לא נשמר</span>}
      </header>

      {isTemp ? (
        <p className="px-4 py-6 text-center text-[13px] text-ui-muted">אזור חדש. שמרו את הפריסה כדי להוסיף לו תוכן.</p>
      ) : (
        <div className="grid gap-3 p-4">
          {selectedType !== 'EMPTY' && !pickerOpen && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                {Icon && <span className="grid h-9 w-9 shrink-0 place-items-center rounded-ui-sm bg-ui-primary-soft text-ui-primary-ink"><Icon className="h-[18px] w-[18px]" aria-hidden="true" /></span>}
                <div className="min-w-0">
                  <p className="text-xs text-ui-muted">סוג תוכן</p>
                  <p className="truncate text-sm font-semibold text-ui-ink">{contentTypeLabel(selectedType)}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {!editorOpen && <Button size="sm" variant="primary" icon={<Pencil className="h-3.5 w-3.5" aria-hidden="true" />} onClick={() => setEditorOpen(true)}>עריכת תוכן</Button>}
                <Button size="sm" data-change-type icon={<Repeat2 className="h-3.5 w-3.5" aria-hidden="true" />} onClick={() => setPickerOpen(true)}>החלפת סוג</Button>
                {saved && <Button size="sm" variant="ghost" className="text-ui-danger hover:bg-ui-danger-soft" icon={<Eraser className="h-3.5 w-3.5" aria-hidden="true" />} onClick={clearRegion}>ריקון האזור</Button>}
              </div>
            </div>
          )}

          {(pickerOpen || selectedType === 'EMPTY') && (
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13px] font-semibold text-ui-ink-2">{saved ? 'בחירת סוג תוכן אחר' : 'מה יוצג באזור?'}</p>
                {selectedType !== 'EMPTY' && <button type="button" onClick={() => { setPickerOpen(false); setFocusTarget('change') }} aria-label="סגירת בחירת סוג התוכן"
                  className="ui-focus grid h-8 w-8 place-items-center rounded-ui-sm text-ui-muted hover:bg-ui-subtle"><X className="h-4 w-4" aria-hidden="true" /></button>}
              </div>
              <ContentTypePicker value={selectedType} onChange={chooseType} label={`סוג התוכן של ${regionName}`} />
            </div>
          )}

          {replacing && (
            <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-ui-sm border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
              <span className="inline-flex items-center gap-1.5"><AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                התוכן השמור (״{contentTypeLabel(saved!.contentType)}״) יוחלף רק אחרי שמירת התוכן.</span>
              <button type="button" onClick={backToSaved} className="ui-focus rounded font-medium underline underline-offset-2">חזרה לתוכן השמור</button>
            </div>
          )}

          {editorOpen && selectedType !== 'EMPTY' && (
            <ContentEditor
              key={`${section.id}::${selectedType}`}
              screenId={screenId} section={section} selectedType={selectedType}
              onClose={closeEditor} onSaved={handleSaved} onDirtyChange={handleDirty}
              onDraftChange={draft => {
                const original = saved ?? buildStub(section.id)
                preview([{ ...original, ...draft, id: original.id, sectionId: section.id } as ContentItem])
              }}
            />
          )}
        </div>
      )}
    </section>
  )
}
