'use client'
import { useState } from 'react'
import { ChevronDown, Palette, LayoutTemplate, PaintBucket, Type } from 'lucide-react'
import { SCREEN_FONTS } from '@/lib/screenFont'
import { SCREEN_THEMES, CURATED_THEMES } from '@/lib/screenThemes'
import { DISPLAY_TEMPLATES, type DisplayTemplate, getDisplayTemplate, getDisplayThemeValue, withDisplayTheme, getDisplaySurface, withDisplaySurface } from '@/lib/displayTemplates'
import type { ScreenLayout } from '@/types'
import { cn } from '@/lib/utils'

type Template = DisplayTemplate

// The "עיצוב" tab: the existing design controls, grouped. Every control writes the same layout
// fields as before (bgColor encodes template, theme and surface; fontFamily; mainSections).
export default function DesignPanel({ layout, onChange, stacked, onTemplate, onSectionCount, onGoToContent }: {
  layout: ScreenLayout
  onChange: (patch: Partial<ScreenLayout>) => void
  stacked: boolean
  onTemplate: (t: Template) => void
  onSectionCount: (n: 1 | 2 | 3) => void
  onGoToContent: () => void
}) {
  const template = getDisplayTemplate(layout.bgColor)
  const themeValue = getDisplayThemeValue(layout.bgColor) ?? 'theme:classic'
  const theme = SCREEN_THEMES.find(t => `theme:${t.id}` === themeValue)
  const surface = getDisplaySurface(layout.bgColor)
  const templateInfo = DISPLAY_TEMPLATES.find(t => t.id === template)

  return (
    <div className="grid gap-3">
      <Group icon={Palette} title="ערכת נושא" summary={theme?.name} defaultOpen>
        <p className="mb-2 text-xs text-ui-muted">צבעים, טיפוגרפיה, כותרות, כרטיסים וצבעי הסטטוסים — לכל המסך.</p>
        {theme?.legacy && (
          <div className="mb-2 rounded-ui-sm border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            המסך משתמש בערכה קודמת: <b>{theme.name}</b>. היא נשארת כמו שהיא עד שתבחרו אחת מהערכות החדשות.
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {CURATED_THEMES.map(t => {
            const on = themeValue === `theme:${t.id}`
            return (
              <button key={t.id} type="button" onClick={() => onChange({ bgColor: withDisplayTheme(layout.bgColor, `theme:${t.id}`) })} aria-pressed={on}
                className={cn('ui-focus rounded-ui-sm border p-1.5 text-right transition-colors', on ? 'border-ui-primary ring-2 ring-ui-primary-line' : 'border-ui-border hover:border-ui-border-strong')}>
                <div className="flex h-16 flex-col gap-1 rounded-md p-1.5" style={{ background: t.bg }}>
                  <div className="flex h-2.5 items-center justify-between rounded-sm px-1" style={{ background: t.header }}><span className="block h-1 w-4 rounded-full" style={{ background: t.accent }} /><span className="block h-1 w-2 rounded-full" style={{ background: t.header === t.bg ? t.text : '#ffffff', opacity: .7 }} /></div>
                  <div className="flex flex-1 gap-1">
                    <div className="flex flex-[7] flex-col justify-center gap-0.5 rounded-sm px-1" style={{ background: t.panel, border: `1px solid ${t.border}` }}>
                      <span className="block h-0.5 w-2/3 rounded-full" style={{ background: t.text, opacity: .55 }} /><span className="block h-0.5 w-1/2 rounded-full" style={{ background: t.tokens?.cancel }} /><span className="block h-0.5 w-3/5 rounded-full" style={{ background: t.tokens?.room }} />
                    </div>
                    <div className="flex flex-[3] flex-col gap-1"><div className="flex-1 rounded-sm" style={{ background: t.accent }} /><div className="flex-1 rounded-sm" style={{ background: t.panel, border: `1px solid ${t.border}` }} /></div>
                  </div>
                  <div className="h-2 rounded-sm" style={{ background: t.footer, border: `1px solid ${t.border}` }} />
                </div>
                <span className="mt-1 block truncate text-xs text-ui-ink-2">{t.name}</span>
              </button>
            )
          })}
        </div>
      </Group>

      <Group icon={LayoutTemplate} title="מבנה המסך ואזורים" summary={`${templateInfo?.name ?? ''} · ${layout.mainSections} ${layout.mainSections === 1 ? 'אזור' : 'אזורים'}`}>
        <div className="grid gap-2">
          {DISPLAY_TEMPLATES.map(t => (
            <button type="button" key={t.id} onClick={() => onTemplate(t.id)} aria-pressed={template === t.id}
              className={cn('ui-focus rounded-ui-sm border px-3 py-2 text-right transition-colors', template === t.id ? 'border-ui-primary bg-ui-primary-soft' : 'border-ui-border hover:bg-ui-subtle')}>
              <span className="block text-sm font-semibold text-ui-ink">{t.name}</span>
              <span className="text-xs text-ui-muted">{t.description}</span>
            </button>
          ))}
        </div>
        {template === 'classic' ? (
          <div className="mt-3">
            <p className="mb-2 text-[13px] font-semibold text-ui-ink-2">מספר אזורי תוכן</p>
            <div className="flex gap-2" role="group" aria-label="מספר אזורי תוכן">
              {([1, 2, 3] as const).map(n => (
                // Icons follow the saved orientation: columns on landscape, rows on portrait.
                <button type="button" key={n} onClick={() => onSectionCount(n)} aria-label={`${n} אזורים`} aria-pressed={layout.mainSections === n}
                  className={cn('ui-focus flex h-12 flex-1 items-center justify-center rounded-ui-sm border transition-colors', stacked ? 'flex-col gap-0.5' : 'gap-1',
                    layout.mainSections === n ? 'border-ui-primary bg-ui-primary-soft' : 'border-ui-border hover:border-ui-border-strong')}>
                  {Array.from({ length: n }).map((_, i) => (
                    <span key={i} className={cn('block rounded-sm', stacked ? 'w-4' : 'h-6', layout.mainSections === n ? 'bg-ui-primary' : 'bg-slate-300')}
                      style={stacked ? { height: n === 1 ? 28 : n === 2 ? 13 : 8 } : { width: n === 1 ? 28 : n === 2 ? 12 : 8 }} />
                  ))}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-ui-muted">הסתרת אזור לא מוחקת את התוכן שלו; הוא יחזור אם תגדילו שוב את מספר האזורים.</p>
          </div>
        ) : (
          <p className="mt-3 text-xs text-ui-muted">{template === 'information' ? 'שני אזורים: 70% ו־30%.' : template === 'split' ? 'שלושה אזורים: אזור 1 ראשי (70%), אזורים 2 ו־3 זה מעל זה בעמודה של 30%.' : 'שלושה אזורים: 20%, 60%, 20%.'} מספר האזורים נקבע לפי התבנית.</p>
        )}
        <button type="button" onClick={onGoToContent} className="ui-focus mt-3 rounded text-[13px] font-medium text-ui-primary hover:underline">מעבר לתוכן האזורים</button>
      </Group>

      <Group icon={PaintBucket} title="צבעים ורקע" summary={surface === 'unified' ? 'רקע אחיד' : 'אזורים נפרדים'}>
        <p className="mb-2 text-xs text-ui-muted">החלוקה לאזורים נשמרת; משתנה רק המראה. הצבעים עצמם נקבעים בערכת הנושא.</p>
        <div className="grid grid-cols-2 gap-2">
          {([['unified', 'רקע אחיד', 'ללא כרטיסיות ומסגרות'], ['separated', 'אזורים נפרדים', 'רקע ומסגרת לכל אזור']] as const).map(([id, name, description]) => (
            <button type="button" key={id} onClick={() => onChange({ bgColor: withDisplaySurface(layout.bgColor, id) })} aria-pressed={surface === id}
              className={cn('ui-focus rounded-ui-sm border p-3 text-right transition-colors', surface === id ? 'border-ui-primary bg-ui-primary-soft' : 'border-ui-border hover:bg-ui-subtle')}>
              <span className="block text-sm font-semibold text-ui-ink">{name}</span>
              <span className="mt-1 block text-xs text-ui-muted">{description}</span>
            </button>
          ))}
        </div>
      </Group>

      <Group icon={Type} title="טיפוגרפיה" summary={layout.fontFamily || 'Heebo'}>
        <label htmlFor="screen-font" className="mb-1.5 block text-[13px] font-semibold text-ui-ink-2">גופן אחיד לכל המסך</label>
        <select id="screen-font" className="ui-focus h-10 w-full rounded-ui-sm border border-ui-border-strong bg-ui-surface px-3 text-sm" value={layout.fontFamily || 'Heebo'} onChange={e => onChange({ fontFamily: e.target.value })}>
          {SCREEN_FONTS.map(font => <option key={font} value={font}>{font}</option>)}
        </select>
        <p className="mt-1.5 text-xs text-ui-muted">משפיע על הכותרות, ההודעות, התאריך ושאר הטקסט. גודל ועובי הכותרת הראשית נקבעים בלשונית ״כותרת עליונה״.</p>
      </Group>
    </div>
  )
}

function Group({ icon: Icon, title, summary, defaultOpen = false, children }: {
  icon: React.ComponentType<{ className?: string }>; title: string; summary?: string; defaultOpen?: boolean; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="rounded-ui-lg border border-ui-border bg-ui-surface">
      <h3>
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
          className="ui-focus flex w-full items-center gap-3 rounded-ui-lg px-4 py-3 text-right hover:bg-ui-subtle">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-ui-sm bg-ui-subtle text-ui-ink-2"><Icon className="h-4 w-4" aria-hidden="true" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ui-ink">{title}</span>
            {summary && <span className="block truncate text-xs text-ui-muted">{summary}</span>}
          </span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-ui-muted transition-transform', open && 'rotate-180')} aria-hidden="true" />
        </button>
      </h3>
      {open && <div className="border-t border-ui-border px-4 py-3">{children}</div>}
    </section>
  )
}
