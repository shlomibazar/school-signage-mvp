'use client'
import { useState, useCallback, useEffect, useRef } from 'react'
import { Save, ExternalLink, PanelLeftClose, PanelLeftOpen, LayoutGrid, PanelTop, PanelBottom, Palette, ZoomIn, ZoomOut, Maximize2, Minimize2, Scan, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import { distributeWidths, toISOStringOrNull } from '@/lib/utils'
import type { Screen, ScreenLayout, ScreenSection, ContentItem } from '@/types'
import ScreenPreview from './ScreenPreview'
import SnapshotButton from './SnapshotButton'
import HeaderEditor from './HeaderEditor'
import FooterEditor from './FooterEditor'
import SectionEditor from './SectionEditor'
import RegionBackgroundEditor from './RegionBackgroundEditor'
import DesignPanel from './DesignPanel'
import { CONTENT_ICONS } from './ContentTypePicker'
import { Switch } from '@/components/ui/Switch'
import { getDisplayTemplate, withDisplayTemplate, getTemplateWidths, isStackedLayout, TEMPLATE_SECTION_COUNT, type DisplayTemplate } from '@/lib/displayTemplates'
import { contentTypeLabel } from '@/lib/contentTypes'
import { confirmDiscardDraft } from '@/lib/unsavedChanges'
import HelpButton from '@/components/admin/help/HelpButton'
import { cn } from '@/lib/utils'

interface Props { screen: Screen; layout: ScreenLayout; sections: ScreenSection[]; screenSelector?: React.ReactNode; initialLogoUrl?: string | null; initialWeatherCity?: string | null }
type Tab = 'content' | 'header' | 'footer' | 'design'
const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'content', label: 'תוכן', icon: LayoutGrid },
  { id: 'header', label: 'כותרת עליונה', icon: PanelTop },
  { id: 'footer', label: 'כותרת תחתונה', icon: PanelBottom },
  { id: 'design', label: 'עיצוב', icon: Palette },
]
function isTempId(id: string) { return id.startsWith('new-') }

export default function ScreenLayoutEditor({ screen, layout: initLayout, sections: initSections, screenSelector, initialLogoUrl, initialWeatherCity }: Props) {
  // School-wide values, read-only here (edited in the school settings).
  const weatherCity = initialWeatherCity ?? null
  const logoUrl = initialLogoUrl ?? null
  const [layout,   setLayout]   = useState<ScreenLayout>(initLayout)
  const [sections, setSections] = useState<ScreenSection[]>(initSections)
  const [isDirty,  setIsDirty]  = useState(false)
  // The preview box, so "עדכן צילום" can capture the stage inside it.
  const previewBoxRef = useRef<HTMLDivElement>(null)
  const [saving,   setSaving]   = useState(false)
  const [tab,      setTab]      = useState<Tab>('content')
  const savingRef = useRef(false)
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  // The region being edited (index among the visible regions), and regions with unsaved content.
  const [region, setRegion] = useState(0)
  const [draftDirty, setDraftDirtyMap] = useState<Record<string, boolean>>({})
  const [capturing, setCapturing] = useState(false)
  const onRegionDirty = useCallback((id: string, dirty: boolean) => setDraftDirtyMap(m => m[id] === dirty ? m : { ...m, [id]: dirty }), [])
  // Preview zoom: 'fit' (default) or a manual scale; the % label shows the scale in use.
  const [previewZoom, setPreviewZoom] = useState<'fit' | number>('fit')
  const [previewScale, setPreviewScale] = useState(0.5)
  const [previewEnlarged, setPreviewEnlarged] = useState(false)
  const [settingsVisible, setSettingsVisible] = useState(true)
  const stackedSections = isStackedLayout(screen.orientation)
  const zoomBy = (factor: number) => setPreviewZoom(Math.round(Math.min(2, Math.max(0.1, previewScale * factor)) * 100) / 100)
  useEffect(() => {
    if (!previewEnlarged) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setPreviewEnlarged(false) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [previewEnlarged])

  // Expose the dirty flag to the screen selector, which lives above this editor.
  useEffect(() => {
    document.body.dataset.screenEditorDirty = isDirty ? 'true' : 'false'
    return () => { delete document.body.dataset.screenEditorDirty }
  }, [isDirty])

  // Warn before closing a tab with unsaved layout changes.
  useEffect(() => {
    if (!isDirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [isDirty])

  const updateLayout = useCallback((patch: Partial<ScreenLayout>) => {
    setLayout(prev => ({ ...prev, ...patch })); setIsDirty(true)
  }, [])

  // Keep all sections (including hidden ones) in state. Changing the layout
  // only changes how many sections are visible; it never deletes content.
  const applyVisibleCount = (count: 1 | 2 | 3, template: DisplayTemplate) => {
    const widths = getTemplateWidths(template, count)
    setSections(prev => {
      const next = [...prev]
      while (next.length < count) {
        const position = next.length
        next.push({
          id: `new-pos-${position}`, screenId: screen.id,
          position, widthPct: distributeWidths(count)[position], contentItems: [],
        })
      }
      return next.map((section, i) => i < count
        ? { ...section, position: i, widthPct: widths[i] }
        : section)
    })
  }

  // Fewer regions hides the last ones (their stored content is kept); an open, unsaved draft in a
  // hidden region would be lost, so ask first.
  const confirmHide = async (count: number) =>
    !sections.slice(count).some(s => draftDirty[s.id]) || await confirmDiscardDraft()

  const handleSectionCount = async (count: 1 | 2 | 3) => {
    if (count === layout.mainSections) return
    if (!(await confirmHide(count))) return
    setRegion(r => Math.min(r, count - 1))
    applyVisibleCount(count, getDisplayTemplate(layout.bgColor))
    updateLayout({ mainSections: count })
  }

  const changeTemplate = async (next: DisplayTemplate) => {
    const current = getDisplayTemplate(layout.bgColor)
    const count = (next === 'classic' ? Math.min(3, Math.max(1, sections.length)) : TEMPLATE_SECTION_COUNT[next]) as 1|2|3
    if (next === current && count === layout.mainSections) return
    if (!(await confirmHide(count))) return
    setRegion(r => Math.min(r, count - 1))
    applyVisibleCount(count, next)
    updateLayout({ bgColor: withDisplayTemplate(layout.bgColor, next), mainSections: count })
  }

  // The content editor owns only the region's content items. Merging them (instead of replacing the
  // whole region with the editor's copy) keeps the region background, which RegionBackgroundEditor
  // owns, from being overwritten by an older copy of the region.
  const handleSectionUpdate = useCallback((updated: ScreenSection) => {
    setSections(prev => prev.map(s => s.id === updated.id ? { ...s, contentItems: updated.contentItems } : s))
  }, [])

  const handleSave = async () => {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    try {
      const res = await fetch(`/api/screens/${screen.id}/layout`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layout: { ...layout, footerShowBirthdays: layout.footerShowBirthdays ?? false }, sections: sections.map(s => ({ position: s.position, widthPct: s.widthPct, background: s.background ?? null })) }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        const message = Array.isArray(d.error)
          ? d.error.map((e: { path?: (string | number)[]; message?: string }) =>
              `${e.path?.join('.') ?? 'שדה'}: ${e.message ?? 'ערך לא תקין'}`).join('; ')
          : typeof d.error === 'string' ? d.error : `שמירת הפריסה נכשלה (${res.status})`
        throw new Error(message)
      }
      const data = await res.json()
      if (data.sections) {
        // The saved regions replace the editor's, so every field the editor shows must be carried
        // over, the region background included (it was dropped here, which blanked the backgrounds
        // after saving and erased them on the next save).
        setSections(data.sections.map((s: any): ScreenSection => ({
          id: s.id, screenId: s.screenId, position: s.position, widthPct: s.widthPct, background: s.background ?? null,
          contentItems: (s.contentItems ?? []).map((ci: any): ContentItem => ({
            id: ci.id, sectionId: ci.sectionId, contentType: ci.contentType,
            priority: ci.priority, active: ci.active,
            startDate: toISOStringOrNull(ci.startDate), endDate: toISOStringOrNull(ci.endDate),
            startTime: ci.startTime ?? null, endTime: ci.endTime ?? null, daysOfWeek: ci.daysOfWeek ?? [],
            textContent: ci.textContent ?? null, textColor: ci.textColor ?? null,
            bgColor: ci.bgColor ?? null, fontSize: ci.fontSize ?? null,
            galleryId: ci.galleryId ?? null, slideDuration: ci.slideDuration ?? 5,
            transitionStyle: ci.transitionStyle ?? 'fade',
            videoUrl: ci.videoUrl ?? null, videoLoop: ci.videoLoop ?? true, videoMuted: ci.videoMuted ?? true,
            rssUrl: ci.rssUrl ?? null, rssMaxItems: ci.rssMaxItems ?? 5,
            weatherCity: ci.weatherCity ?? null, weatherUnits: ci.weatherUnits ?? 'metric',
            settings: ci.settings ?? null,
          })),
        })))
      }
      toast.success('הפריסה נשמרה'); setIsDirty(false)
    } catch (err: any) { toast.error(err.message ?? 'שגיאה') }
    finally { savingRef.current = false; setSaving(false) }
  }

  const visible = sections.slice(0, layout.mainSections)
  const widths = getTemplateWidths(getDisplayTemplate(layout.bgColor), visible.length)
  const dirtyRegions = visible.map((s, i) => draftDirty[s.id] ? i + 1 : 0).filter(Boolean)
  const selectRegion = (i: number) => { setRegion(i); setTab('content') }
  function onTabKey(e: React.KeyboardEvent) {
    const i = TABS.findIndex(t => t.id === tab)
    // Right-to-left: ArrowLeft moves to the next tab.
    const next = e.key === 'ArrowLeft' ? (i + 1) % TABS.length : e.key === 'ArrowRight' ? (i - 1 + TABS.length) % TABS.length
      : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : -1
    if (next < 0) return
    e.preventDefault(); setTab(TABS[next].id); tabRefs.current[TABS[next].id]?.focus()
  }

  return (
    <div className="flex flex-col gap-3 min-w-0 lg:h-[calc(100dvh-125px)] lg:overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-ui-lg border border-ui-border bg-ui-surface px-4 py-2.5 shadow-ui">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3"><h1 className="text-lg font-bold text-ui-ink">{screen.name}</h1>{screenSelector}</div>
          <p className="text-xs text-ui-muted">{screen.orientation === 'LANDSCAPE' ? 'אופקי' : 'אנכי'} · <span dir="ltr">/screen/{screen.slug}</span></p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span aria-live="polite" className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', isDirty ? 'bg-amber-50 text-amber-700' : 'bg-ui-success-soft text-ui-success')}>
            {isDirty ? <><span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />פריסה לא נשמרה</> : <><Check className="h-3.5 w-3.5" aria-hidden="true" />הפריסה שמורה</>}
          </span>
          <button type="button" onClick={() => setSettingsVisible(v => !v)} aria-pressed={!settingsVisible}
            className="ui-focus hidden h-9 items-center gap-1.5 rounded-ui-sm border border-ui-border-strong px-3 text-[13px] text-ui-ink-2 hover:bg-ui-subtle lg:inline-flex">
            {settingsVisible ? <PanelLeftClose className="h-4 w-4" aria-hidden="true" /> : <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />}
            {settingsVisible ? 'הסתרת הגדרות' : 'הצגת הגדרות'}
          </button>
          <HelpButton topic={tab === 'content' ? 'content' : 'design'} />
          <a href={`/screen/${screen.slug}`} target="_blank" rel="noopener noreferrer" aria-label="תצוגה ציבורית (בלשונית חדשה)"
            className="ui-focus inline-flex h-9 items-center gap-1.5 rounded-ui-sm border border-ui-border-strong px-3 text-[13px] text-ui-ink-2 hover:bg-ui-subtle">
            <ExternalLink className="h-4 w-4" aria-hidden="true" />תצוגה ציבורית
          </a>
        </div>
      </div>
      <div className="flex flex-col lg:flex-row gap-3 min-w-0 min-h-0 lg:flex-1 items-stretch">
        {/* Hidden (not unmounted) when "הסתרת הגדרות" is on, so open content drafts are kept. */}
        <div className={cn('order-2 lg:order-none w-full lg:w-[44%] xl:w-[46%] lg:max-w-[760px] shrink-0 flex flex-col rounded-ui-lg border border-ui-border bg-ui-surface shadow-ui min-w-0 lg:h-full lg:overflow-hidden', !settingsVisible && 'lg:hidden')}>
          <div data-tour="editor-tabs" role="tablist" aria-label="הגדרות המסך" onKeyDown={onTabKey} className="m-3 mb-0 grid shrink-0 grid-cols-4 gap-1 rounded-ui bg-ui-subtle p-1">
            {TABS.map(t => {
              const Icon = t.icon
              const on = tab === t.id
              return (
                <button type="button" key={t.id} id={`editor-tab-${t.id}`} role="tab" aria-selected={on} aria-controls={`editor-panel-${t.id}`} tabIndex={on ? 0 : -1}
                  ref={el => { tabRefs.current[t.id] = el }} onClick={() => setTab(t.id)}
                  className={cn('ui-focus relative flex min-h-10 flex-col items-center justify-center gap-0.5 rounded-ui-sm px-1 py-1.5 text-[12px] leading-tight transition-colors sm:flex-row sm:gap-1.5 sm:text-[13px]',
                    on ? 'bg-ui-surface font-semibold text-ui-ink shadow-ui' : 'text-ui-muted hover:text-ui-ink')}>
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="text-center">{t.label}</span>
                  {t.id === 'content' && dirtyRegions.length > 0 && <span className="absolute top-1 end-1 h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />}
                </button>
              )
            })}
          </div>
          {/* All panels stay mounted (hidden when inactive), so an open content draft survives switching tabs. */}
          <div className="p-3 lg:flex-1 lg:min-h-0 lg:overflow-y-auto overscroll-contain">
            <div role="tabpanel" id="editor-panel-content" aria-labelledby="editor-tab-content" hidden={tab !== 'content'} className="space-y-3">
              <div data-tour="editor-regions" className="rounded-ui-lg border border-ui-border bg-ui-surface p-3">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="text-[13px] font-semibold text-ui-ink-2">אזורי תוכן</p>
                  <button type="button" onClick={() => setTab('design')} className="ui-focus rounded text-xs text-ui-primary hover:underline">
                    {visible.length} {visible.length === 1 ? 'אזור' : 'אזורים'} · שינוי המבנה בעיצוב
                  </button>
                </div>
                <div role="radiogroup" aria-label="בחירת אזור לעריכה" className={cn('grid gap-2', visible.length === 1 ? 'grid-cols-1' : visible.length === 2 ? 'grid-cols-2' : 'grid-cols-3')}
                  onKeyDown={e => {
                    const d = e.key === 'ArrowLeft' ? 1 : e.key === 'ArrowRight' ? -1 : 0
                    if (!d) return
                    e.preventDefault()
                    const next = (region + d + visible.length) % visible.length
                    setRegion(next); (e.currentTarget.children[next] as HTMLElement | undefined)?.focus()
                  }}>
                  {visible.map((s, i) => {
                    const type = s.contentItems[0]?.contentType ?? 'EMPTY'
                    const Icon = type !== 'EMPTY' ? CONTENT_ICONS[type] : null
                    const on = region === i
                    return (
                      <button type="button" key={s.id} role="radio" aria-checked={on} tabIndex={on ? 0 : -1} onClick={() => setRegion(i)}
                        aria-label={`אזור ${i + 1}: ${type === 'EMPTY' ? 'ריק' : contentTypeLabel(type)}${draftDirty[s.id] ? ', תוכן לא נשמר' : ''}`}
                        className={cn('ui-focus relative flex min-h-[52px] min-w-0 items-center gap-2 rounded-ui-sm border px-2 py-2 text-right transition-colors sm:px-2.5',
                          on ? 'border-ui-primary bg-ui-primary-soft' : 'border-ui-border hover:bg-ui-subtle')}>
                        <span className={cn('hidden h-7 w-7 shrink-0 place-items-center rounded-md text-xs font-bold sm:grid', on ? 'bg-ui-primary text-white' : 'bg-ui-subtle text-ui-ink-2')}>{i + 1}</span>
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-semibold text-ui-ink">אזור {i + 1}</span>
                          <span className="flex items-center gap-1 truncate text-[11.5px] text-ui-muted">{Icon && <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />}{type === 'EMPTY' ? 'ריק' : contentTypeLabel(type)}</span>
                        </span>
                        {draftDirty[s.id] && <span className="absolute top-1.5 end-1.5 h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />}
                      </button>
                    )
                  })}
                </div>
                <p className="mt-2 hidden text-xs text-ui-muted lg:block">אפשר גם ללחוץ על אזור בתצוגה המקדימה.</p>
              </div>
              {visible.map((section, i) => (
                <div key={section.id} hidden={region !== i}>
                  <SectionEditor screenId={screen.id} section={section} index={i} widthPct={widths[i] ?? section.widthPct}
                    isTemp={isTempId(section.id)} onUpdate={handleSectionUpdate} onDirtyChange={onRegionDirty} />
                  <div className="mt-3"><RegionBackgroundEditor value={section.background} onChange={bg => { setSections(prev => prev.map(x => x.id === section.id ? { ...x, background: bg } : x)); setIsDirty(true) }} /></div>
                </div>
              ))}
            </div>
            <div role="tabpanel" id="editor-panel-header" aria-labelledby="editor-tab-header" hidden={tab !== 'header'} className="space-y-3">
              <div className="flex items-center justify-between rounded-ui-lg border border-ui-border bg-ui-surface px-4 py-3">
                <span className="text-sm font-medium text-ui-ink">הצגת כותרת עליונה</span>
                <Switch checked={layout.headerEnabled} onCheckedChange={v=>updateLayout({headerEnabled:v})} aria-label="הצגת כותרת עליונה"/>
              </div>
              <HeaderEditor layout={layout} onChange={updateLayout} logoUrl={logoUrl} weatherCity={weatherCity}/>
            </div>
            <div role="tabpanel" id="editor-panel-footer" aria-labelledby="editor-tab-footer" hidden={tab !== 'footer'} className="space-y-3">
              <div className="flex items-center justify-between rounded-ui-lg border border-ui-border bg-ui-surface px-4 py-3">
                <span className="text-sm font-medium text-ui-ink">הצגת כותרת תחתונה</span>
                <Switch checked={layout.footerEnabled} onCheckedChange={v=>updateLayout({footerEnabled:v})} aria-label="הצגת כותרת תחתונה"/>
              </div>
              <FooterEditor layout={layout} onChange={updateLayout}/>
            </div>
            <div role="tabpanel" id="editor-panel-design" aria-labelledby="editor-tab-design" hidden={tab !== 'design'}>
              <DesignPanel layout={layout} onChange={updateLayout} stacked={stackedSections}
                onTemplate={t => void changeTemplate(t)} onSectionCount={n => void handleSectionCount(n)} onGoToContent={() => setTab('content')} />
            </div>
          </div>
          {/* Layout save: header, footer, design and the region structure. Region content is saved in its own form. */}
          <div data-tour="editor-save" className="sticky bottom-0 z-10 shrink-0 rounded-b-ui-lg border-t border-ui-border bg-ui-surface px-4 py-3 shadow-[0_-6px_18px_rgba(15,23,42,0.05)]">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 text-xs" aria-live="polite">
                <p className={isDirty ? 'font-medium text-amber-700' : 'text-ui-muted'}>{isDirty ? 'יש שינויים בפריסה שלא נשמרו' : 'הפריסה שמורה'}</p>
                {dirtyRegions.length > 0 && <p className="mt-0.5 text-ui-muted">תוכן לא שמור ב{dirtyRegions.map(n => `אזור ${n}`).join(', ')} · נשמר ב״שמירת תוכן״ של האזור</p>}
              </div>
              <button type="button" onClick={handleSave} disabled={!isDirty || saving}
                className="ui-focus inline-flex h-10 shrink-0 items-center gap-1.5 rounded-ui-sm bg-ui-primary px-4 text-sm font-medium text-white shadow-ui hover:bg-ui-primary-hover disabled:opacity-50">
                <Save className="h-4 w-4" aria-hidden="true" />{saving ? 'שומר...' : 'שמירת פריסה'}
              </button>
            </div>
          </div>
        </div>
        {previewEnlarged && <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setPreviewEnlarged(false)} aria-hidden="true"/>}
        {/* Enlarged: the same panel becomes a large overlay; fit and zoom keep working inside it. */}
        <div className={previewEnlarged
          ? 'fixed inset-3 sm:inset-6 z-50 flex flex-col rounded-2xl bg-white p-3 shadow-2xl'
          : 'order-1 lg:order-none flex-1 flex flex-col min-w-0 min-h-0 w-full lg:overflow-hidden'}
          role={previewEnlarged ? 'dialog' : undefined} aria-modal={previewEnlarged || undefined} aria-label={previewEnlarged ? 'תצוגה מקדימה מוגדלת' : undefined}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
            <p className="text-sm font-semibold text-ui-ink-2">תצוגה מקדימה <span className="text-xs font-normal text-ui-muted">· {screen.orientation === 'LANDSCAPE' ? '16:9' : '9:16'}</span></p>
            <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="תצוגה מקדימה">
              <div className="flex items-center rounded-ui-sm border border-ui-border bg-ui-surface">
                <button type="button" onClick={() => zoomBy(1 / 1.25)} aria-label="הקטנה" title="הקטנה" className="ui-focus grid h-8 w-8 place-items-center rounded-ui-sm text-ui-ink-2 hover:bg-ui-subtle"><ZoomOut className="h-4 w-4" aria-hidden="true" /></button>
                <span className="w-11 text-center text-xs tabular-nums text-ui-muted" aria-live="polite">{Math.round(previewScale * 100)}%</span>
                <button type="button" onClick={() => zoomBy(1.25)} aria-label="הגדלה" title="הגדלה" className="ui-focus grid h-8 w-8 place-items-center rounded-ui-sm text-ui-ink-2 hover:bg-ui-subtle"><ZoomIn className="h-4 w-4" aria-hidden="true" /></button>
              </div>
              <button type="button" onClick={() => setPreviewZoom('fit')} aria-pressed={previewZoom === 'fit'}
                className={cn('ui-focus inline-flex h-8 items-center gap-1 rounded-ui-sm border px-2.5 text-xs', previewZoom === 'fit' ? 'border-ui-primary bg-ui-primary-soft text-ui-primary-ink' : 'border-ui-border bg-ui-surface text-ui-ink-2 hover:bg-ui-subtle')}>
                <Scan className="h-3.5 w-3.5" aria-hidden="true" />התאמה
              </button>
              <SnapshotButton screenId={screen.id} dirty={isDirty} initialSnapshotAt={screen.snapshotAt} onCapturingChange={setCapturing}
                getStage={() => previewBoxRef.current?.querySelector<HTMLElement>('.tv-screen-stage') ?? null} />
              <button type="button" onClick={() => setPreviewEnlarged(v => !v)} aria-label={previewEnlarged ? 'סגירת התצוגה המוגדלת' : 'הגדלת התצוגה'}
                className="ui-focus inline-flex h-8 items-center gap-1 rounded-ui-sm border border-ui-border bg-ui-surface px-2.5 text-xs text-ui-ink-2 hover:bg-ui-subtle">
                {previewEnlarged ? <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" /> : <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />}
                <span className="hidden sm:inline">{previewEnlarged ? 'סגירה' : 'הגדלה'}</span>
              </button>
            </div>
          </div>
          <div data-tour="editor-preview" ref={previewBoxRef} className={cn('relative overflow-hidden rounded-ui-lg border border-slate-200 bg-slate-100',
            previewEnlarged ? 'flex-1 min-h-0' : screen.orientation === 'LANDSCAPE' ? 'h-[clamp(200px,32vh,320px)] lg:h-auto lg:min-h-0 lg:flex-1' : 'h-[50vh] min-h-[300px] lg:h-auto lg:min-h-0 lg:flex-1')}>
            <ScreenPreview layout={layout} sections={sections} screen={screen} logoUrl={logoUrl} weatherCity={weatherCity} zoom={previewZoom} onScaleChange={setPreviewScale}
              highlightIndex={capturing || tab !== 'content' ? null : region} onSelectSection={capturing ? undefined : selectRegion}/>
          </div>
        </div>
      </div>
    </div>
  )
}
