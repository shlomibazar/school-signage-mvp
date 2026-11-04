'use client'
import { SCREEN_FONTS } from '@/lib/screenFont'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Save, Eye, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import toast from 'react-hot-toast'
import { distributeWidths, toISOStringOrNull } from '@/lib/utils'
import type { Screen, ScreenLayout, ScreenSection, ContentItem } from '@/types'
import ScreenPreview from './ScreenPreview'
import SnapshotButton from './SnapshotButton'
import HeaderEditor from './HeaderEditor'
import FooterEditor from './FooterEditor'
import SectionEditor from './SectionEditor'
import { Switch } from '@/components/ui/Switch'
import { SCREEN_THEMES } from '@/lib/screenThemes'
import { DISPLAY_TEMPLATES, getDisplayTemplate, getDisplayThemeValue, withDisplayTemplate, withDisplayTheme, getTemplateWidths, getDisplaySurface, withDisplaySurface, isStackedLayout } from '@/lib/displayTemplates'

interface Props { screen: Screen; layout: ScreenLayout; sections: ScreenSection[]; screenSelector?: React.ReactNode; schoolId: string; initialLogoUrl?: string | null; initialWeatherCity?: string | null }
type Tab = 'header' | 'main' | 'footer' | 'design'
function isTempId(id: string) { return id.startsWith('new-') }

export default function ScreenLayoutEditor({ screen, layout: initLayout, sections: initSections, screenSelector, schoolId, initialLogoUrl, initialWeatherCity }: Props) {
  const [weatherCity, setWeatherCity] = useState(initialWeatherCity ?? null)
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl ?? null)
  const [layout,   setLayout]   = useState<ScreenLayout>(initLayout)
  const [sections, setSections] = useState<ScreenSection[]>(initSections)
  const [isDirty,  setIsDirty]  = useState(false)
  // The preview box, so "עדכן צילום" can capture the stage inside it.
  const previewBoxRef = useRef<HTMLDivElement>(null)
  const [saving,   setSaving]   = useState(false)
  const [tab,      setTab]      = useState<Tab>('header')
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
  const applyVisibleCount = (count: 1 | 2 | 3, template: 'classic'|'information'|'visual') => {
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

  const handleSectionCount = (count: 1 | 2 | 3) => {
    applyVisibleCount(count, getDisplayTemplate(layout.bgColor))
    updateLayout({ mainSections: count })
  }

  const changeTemplate = (next: 'classic'|'information'|'visual') => {
    const current = getDisplayTemplate(layout.bgColor)
    const count = next === 'information' ? 2 : next === 'visual' ? 3 : Math.min(3, Math.max(1, sections.length)) as 1|2|3
    if (next === current && count === layout.mainSections) return
    applyVisibleCount(count, next)
    updateLayout({ bgColor: withDisplayTemplate(layout.bgColor, next), mainSections: count })
  }

  const handleSectionUpdate = useCallback((updated: ScreenSection) => {
    setSections(prev => prev.map(s => s.id === updated.id ? updated : s))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/screens/${screen.id}/layout`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layout: { ...layout, footerShowBirthdays: layout.footerShowBirthdays ?? false }, sections: sections.map(s => ({ position: s.position, widthPct: s.widthPct })) }),
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
        setSections(data.sections.map((s: any): ScreenSection => ({
          id: s.id, screenId: s.screenId, position: s.position, widthPct: s.widthPct,
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
    finally { setSaving(false) }
  }

  return (
    <div className="flex flex-col gap-3 min-w-0 lg:h-[calc(100dvh-125px)] lg:overflow-hidden">
      <div className="flex items-center justify-between flex-wrap gap-3 bg-white border border-gray-200 rounded-xl px-3 py-2.5 shadow-sm">
        <div>
          <div className="flex flex-wrap items-center gap-3"><h1 className="text-lg font-bold text-gray-900">{screen.name}</h1>{screenSelector}</div>
          <p className="text-xs text-gray-400">{screen.orientation === 'LANDSCAPE' ? 'אופקי' : 'אנכי'} · <span className="text-blue-500">/screen/{screen.slug}</span></p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setSettingsVisible(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 text-gray-700">
            {settingsVisible ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
            {settingsVisible ? 'הסתר הגדרות' : 'הצג הגדרות'}
          </button>
          {isDirty && <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full">שינויים לא שמורים</span>}
          <a href={`/screen/${screen.slug}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 text-gray-700 transition-colors">
            <Eye className="w-3.5 h-3.5" />תצוגה ציבורית
          </a>

        </div>
      </div>
      <div className="flex flex-col lg:flex-row gap-3 min-w-0 min-h-0 lg:flex-1 items-start lg:items-stretch">
        {settingsVisible && <div className="w-full lg:w-[44%] xl:w-[46%] lg:max-w-[760px] shrink-0 flex flex-col rounded-xl border border-gray-200 bg-white shadow-sm min-w-0 lg:h-full lg:overflow-hidden">
          <div className="flex bg-gray-100 rounded-xl p-1.5 text-sm shrink-0 gap-1 m-3 mb-0">
            {(['header','main','footer','design'] as Tab[]).map(t => (
              <button type="button" key={t} aria-pressed={tab===t} onClick={() => setTab(t)}
                className={`flex-1 py-2.5 rounded-lg transition-colors ${tab===t?'bg-white text-gray-900 font-medium shadow-sm':'text-gray-500 hover:text-gray-700'}`}>
                {t==='header'?'כותרת':t==='main'?'ראשי':t==='footer'?'תחתית':'עיצוב'}
              </button>
            ))}
          </div>
          <div className="p-3 space-y-4 lg:flex-1 lg:min-h-0 lg:overflow-y-auto overscroll-contain">
          {tab==='header' && (
            <div className="space-y-3">
              <div className="bg-white border border-gray-100 rounded-xl px-3 py-2.5 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">כותרת עליונה</span>
                <Switch checked={layout.headerEnabled} onCheckedChange={v=>updateLayout({headerEnabled:v})}/>
              </div>
              <HeaderEditor layout={layout} onChange={updateLayout} schoolId={schoolId} logoUrl={logoUrl} onLogoChange={setLogoUrl} weatherCity={weatherCity} onWeatherCityChange={setWeatherCity}/>
            </div>
          )}
          {tab==='main' && (
            <div className="space-y-3">
              {getDisplayTemplate(layout.bgColor)==='classic' && <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                <div className="px-3 py-2.5 bg-gray-50 text-xs font-medium text-gray-500 border-b border-gray-100">מספר אזורי תוכן</div>
                <div className="p-3 flex gap-2">
                  {([1,2,3] as const).map(n=>(
                    // Icons follow the saved orientation: columns on landscape, rows on portrait.
                    <button type="button" key={n} onClick={()=>handleSectionCount(n)} aria-label={`${n} אזורים`} aria-pressed={layout.mainSections===n}
                      className={`flex-1 h-12 border rounded-lg flex items-center justify-center transition-colors ${stackedSections?'flex-col gap-0.5':'gap-1'} ${layout.mainSections===n?'border-blue-500 bg-blue-50':'border-gray-200 hover:border-gray-300'}`}>
                      {Array.from({length:n}).map((_,i)=>(
                        <span key={i} className={`block rounded-sm ${stackedSections?'w-4':'h-6'} ${layout.mainSections===n?'bg-blue-400':'bg-gray-300'}`}
                          style={stackedSections?{height:n===1?28:n===2?13:8}:{width:n===1?28:n===2?12:8}}/>
                      ))}
                    </button>
                  ))}
                </div>
              </div>}
              {getDisplayTemplate(layout.bgColor)!=='classic' && <p className="text-xs text-gray-500">מספר האזורים נקבע לפי הפריסה שבחרת בלשונית עיצוב.</p>}
              {isDirty && sections.some(s=>isTempId(s.id)) && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-700">
                  ⚠️ שמור את הפריסה תחילה לפני עריכת תוכן באזורים חדשים
                </div>
              )}
              {sections.slice(0,layout.mainSections).map((section,i)=>(
                <SectionEditor key={section.id} screenId={screen.id} section={section}
                  index={i} isTemp={isTempId(section.id)} onUpdate={handleSectionUpdate}/>
              ))}
            </div>
          )}
          {tab==='design' && (
            <div className="bg-white border border-gray-100 rounded-xl p-3 space-y-3">
              <div className="text-sm font-semibold text-gray-800">תבנית תצוגה</div>
               <p className="text-xs text-gray-500">כל מסך יכול לבחור תבנית. התוכן הקיים נשמר; אפשר להחליף את סוג התוכן בכל אזור בלשונית ראשי.</p>
               <div className="grid grid-cols-1 gap-2">
                 {DISPLAY_TEMPLATES.map(t=>(
                   <button type="button" key={t.id} onClick={()=>changeTemplate(t.id)}
                     aria-pressed={getDisplayTemplate(layout.bgColor)===t.id}
                     className={`text-right border rounded-xl px-3 py-2 ${getDisplayTemplate(layout.bgColor)===t.id?'border-blue-500 bg-blue-50':'border-gray-200 hover:bg-gray-50'}`}>
                     <span className="font-semibold text-sm block">{t.name}</span>
                     <span className="text-xs text-gray-500">{t.description}</span>
                   </button>
                 ))}
               </div>
               <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
                 <label htmlFor="screen-font" className="block font-semibold text-sm">גופן אחיד לכל המסך</label>
                 <select id="screen-font" className="w-full border rounded-lg p-2" value={layout.fontFamily || 'Heebo'} onChange={e=>updateLayout({fontFamily:e.target.value})}>
                   {SCREEN_FONTS.map(font=><option key={font} value={font}>{font}</option>)}
                 </select>
                 <p className="text-xs text-gray-500">משפיע על הכותרות, ההודעות, התאריך ושאר הטקסט במסך.</p>
               </div>
               {getDisplayTemplate(layout.bgColor) !== 'classic' && (
                 <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 space-y-2">
                   <p className="font-semibold">{getDisplayTemplate(layout.bgColor)==='information'?'שני אזורים: 70% ו־30%':'שלושה אזורים: 20%, 60%, 20%'}</p>
                   <p>בכל אזור אפשר לבחור כל סוג תוכן בלשונית ״ראשי״.</p>
                   {sections.some(s => isTempId(s.id)) && <p className="font-semibold">שמור תחילה את הפריסה כדי להפעיל את האזור החדש.</p>}
                   <button type="button" onClick={() => setTab('main')} className="rounded-md bg-blue-600 px-3 py-2 text-white">מעבר לעריכת האזורים</button>
                 </div>
               )}
               <div className="border-t pt-3 space-y-2">
                   <div className="text-sm font-semibold text-gray-800">סגנון רקע ופריסה</div>
                   <p className="text-xs text-gray-500">החלוקה לאזורי תוכן נשמרת. רק המראה החיצוני משתנה.</p>
                   <div className="grid grid-cols-2 gap-2">
                     {([['unified','רקע אחיד','ללא כרטיסיות ומסגרות חיצוניות'],['separated','אזורים נפרדים','רקע ומסגרת לכל אזור']] as const).map(([id,name,description])=>(
                       <button type="button" key={id} onClick={()=>updateLayout({bgColor:withDisplaySurface(layout.bgColor,id)})}
                         aria-pressed={getDisplaySurface(layout.bgColor)===id}
                         className={`rounded-xl border p-3 text-right ${getDisplaySurface(layout.bgColor)===id?'border-blue-500 bg-blue-50':'border-gray-200 hover:bg-gray-50'}`}>
                         <span className="block font-semibold text-sm">{name}</span>
                         <span className="block text-xs text-gray-500 mt-1">{description}</span>
                       </button>
                     ))}
                   </div>
                 </div>
               <div className="border-t pt-3 text-sm font-semibold text-gray-800">ערכות נושא מלאות</div>
              <p className="text-xs text-gray-500">בחר ערכה לעיצוב הרקע, הכותרות, הכרטיסים, הטקסט והמסגרות.</p>
              <div className="grid grid-cols-2 gap-2">
                {SCREEN_THEMES.map(t=>(
                  <button key={t.id} type="button" onClick={()=>updateLayout({bgColor:withDisplayTheme(layout.bgColor,`theme:${t.id}`)})}
                    aria-pressed={(getDisplayThemeValue(layout.bgColor)??'theme:classic')===`theme:${t.id}`}
                    className={`rounded-lg border p-1.5 text-right ${(getDisplayThemeValue(layout.bgColor)??'theme:classic')===`theme:${t.id}`?'border-blue-500 ring-2 ring-blue-200':'border-gray-200'}`}>
                    <div className="h-14 rounded-md p-1.5 flex flex-col gap-1" style={{background:t.bg}}>
                      <div className="h-2 rounded-sm" style={{background:t.header}}/>
                      <div className="flex flex-1 gap-1">
                        <div className="flex-1 rounded-sm" style={{background:t.panel,border:`1px solid ${t.border}`}}/>
                        <div className="flex-1 rounded-sm" style={{background:t.panel,border:`1px solid ${t.border}`}}/>
                      </div>
                      <div className="h-2 rounded-sm flex items-center px-1" style={{background:t.footer,borderTop:`1px solid ${t.border}`}}><span className="block h-1 w-5 rounded-full" style={{background:t.accent}}/></div>
                    </div>
                    <span className="block text-xs text-gray-700 mt-1">{t.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {tab==='footer' && (
            <div className="space-y-3">
              <div className="bg-white border border-gray-100 rounded-xl px-3 py-2.5 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">כותרת תחתונה</span>
                <Switch checked={layout.footerEnabled} onCheckedChange={v=>updateLayout({footerEnabled:v})}/>
              </div>
              <FooterEditor layout={layout} onChange={updateLayout}/>
            </div>
          )}
          </div>
          <div className="shrink-0 flex items-center justify-between gap-3 p-4 border-t border-gray-200 bg-white shadow-[0_-6px_18px_rgba(15,23,42,0.04)]">
            <span className="text-xs text-gray-500 min-w-0">{isDirty ? 'יש שינויים שטרם נשמרו' : 'כל השינויים בפריסה נשמרו'}</span>
            <button type="button" onClick={handleSave} disabled={!isDirty || saving}
              className="shrink-0 flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
              <Save className="w-4 h-4" />{saving ? 'שומר...' : 'שמור פריסה'}
            </button>
          </div>
        </div>}
        {previewEnlarged && <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setPreviewEnlarged(false)} aria-hidden="true"/>}
        {/* Enlarged: the same panel becomes a large overlay; fit and zoom keep working inside it. */}
        <div className={previewEnlarged
          ? 'fixed inset-3 sm:inset-6 z-50 flex flex-col rounded-2xl bg-white p-3 shadow-2xl'
          : 'flex-1 flex flex-col min-w-0 min-h-0 w-full lg:overflow-hidden'}
          role={previewEnlarged ? 'dialog' : undefined} aria-modal={previewEnlarged || undefined} aria-label={previewEnlarged ? 'תצוגה מקדימה מוגדלת' : undefined}>
          <div className="flex items-center justify-between flex-wrap mb-2 px-1 gap-2"><p className="text-sm font-semibold text-gray-700">תצוגה מקדימה חיה <span className="font-normal text-xs text-gray-400">· עדכון בזמן אמת</span></p>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400 me-1">{screen.orientation === "LANDSCAPE" ? "16:9" : "9:16"}</span>
              <button type="button" onClick={() => zoomBy(1 / 1.25)} title="התרחק (זום החוצה)" aria-label="התרחק" className="w-7 h-7 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-sm leading-none">−</button>
              <span className="w-12 text-center text-xs tabular-nums text-gray-600" aria-live="polite">{Math.round(previewScale * 100)}%</span>
              <button type="button" onClick={() => zoomBy(1.25)} title="התקרב (זום פנימה)" aria-label="התקרב" className="w-7 h-7 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-sm leading-none">+</button>
              <button type="button" onClick={() => setPreviewZoom('fit')} aria-pressed={previewZoom === 'fit'}
                className={`text-xs px-2.5 py-1 rounded-lg border ${previewZoom === 'fit' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>התאם לחלון</button>
              <SnapshotButton screenId={screen.id} dirty={isDirty} initialSnapshotAt={screen.snapshotAt} getStage={() => previewBoxRef.current?.querySelector<HTMLElement>('.tv-screen-stage') ?? null} />
              <button type="button" onClick={() => setPreviewEnlarged(v => !v)} className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 bg-white hover:bg-gray-50">{previewEnlarged ? 'סגור תצוגה מוגדלת' : 'הגדל תצוגה'}</button>
            </div>
          </div>
          <div ref={previewBoxRef} className={`relative bg-slate-100 border border-slate-200 rounded-xl overflow-hidden min-h-[260px] ${previewEnlarged ? 'flex-1 min-h-0' : 'h-[60vh] lg:h-auto lg:min-h-0 lg:flex-1'}`}>
            <ScreenPreview layout={layout} sections={sections} screen={screen} logoUrl={logoUrl} weatherCity={weatherCity} zoom={previewZoom} onScaleChange={setPreviewScale}/>
          </div>
        </div>
      </div>
    </div>
  )
}
