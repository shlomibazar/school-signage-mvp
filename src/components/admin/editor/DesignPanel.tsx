'use client'
import { Palette, LayoutTemplate, PaintBucket, Type, Check } from 'lucide-react'
import { EditorGroup as Group } from './Collapsible'
import { SCREEN_FONTS } from '@/lib/screenFont'
import { SCREEN_THEMES, CURATED_THEMES } from '@/lib/screenThemes'
import { DISPLAY_TEMPLATES, TEMPLATE_SECTION_COUNT, type DisplayTemplate, getDisplayTemplate, getDisplayThemeValue, withDisplayTheme, getDisplaySurface, withDisplaySurface, regionRects } from '@/lib/displayTemplates'
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
        <div className="grid grid-cols-2 gap-2">
          {DISPLAY_TEMPLATES.map(t => {
            const on = template === t.id
            const count = t.id === 'classic' ? (on ? layout.mainSections : 3) : TEMPLATE_SECTION_COUNT[t.id]
            return (
              <button type="button" key={t.id} onClick={() => onTemplate(t.id)} aria-pressed={on}
                className={cn('ui-focus relative flex flex-col gap-2 rounded-ui-sm border p-2 text-right transition-colors', on ? 'border-ui-primary bg-ui-primary-soft ring-2 ring-ui-primary-line' : 'border-ui-border hover:bg-ui-subtle')}>
                {on && <span className="absolute left-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-ui-primary text-white"><Check className="h-3 w-3" aria-hidden="true" /></span>}
                <LayoutDiagram template={t.id} count={count} stacked={stacked} active={on} />
                <span>
                  <span className="block text-[13px] font-semibold text-ui-ink">{t.name}</span>
                  <span className="block text-xs leading-snug text-ui-muted">{t.description}</span>
                </span>
              </button>
            )
          })}
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
          <p className="mt-3 text-xs text-ui-muted">{template === 'information' ? 'שני אזורים: אזור 1 (70%) מימין ואזור 2 (30%) משמאל.' : template === 'split' ? 'שלושה אזורים: אזור 1 (70%) מימין, אזורים 2 ו־3 זה מעל זה בעמודה של 30% משמאל.' : 'שלושה אזורים: אזור 1 (20%) מימין, אזור 2 (60%) במרכז ואזור 3 (20%) משמאל.'} מספר האזורים נקבע לפי התבנית.</p>
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

// A miniature of the screen with the regions where the TV really draws them. The SVG uses its own
// left-to-right coordinates (x = distance from the physical left edge, direction: ltr); SVG geometry
// is never mirrored by the RTL page.
function LayoutDiagram({ template, count, stacked, active }: { template: Template; count: number; stacked: boolean; active: boolean }) {
  const W = stacked ? 54 : 96, H = stacked ? 96 : 54
  const head = 6, foot = 4, gap = 1.6
  const area = { x: 2, y: head + 1.5, w: W - 4, h: H - head - foot - 3 }
  const rects = regionRects(template, count, stacked)
  const fill = active ? '#2563eb' : '#94a3b8', band = active ? '#bfd3fb' : '#dbe3ec'
  return (
    <svg viewBox={'0 0 ' + W + ' ' + H} className={cn('rounded-md', stacked ? 'mx-auto h-24 w-auto' : 'h-auto w-full')} role="img"
      aria-label={'תרשים: ' + rects.map(r => 'אזור ' + r.n).join(', ')} style={{ direction: 'ltr' }}>
      <rect x="0" y="0" width={W} height={H} rx="3" fill={active ? '#eef4ff' : '#f1f5f9'} stroke={active ? '#2563eb' : '#cbd5e1'} strokeWidth="0.8" />
      <rect x="2" y="1.5" width={W - 4} height={head - 1} rx="1" fill={band} />
      <rect x="2" y={H - foot - 0.5} width={W - 4} height={foot - 1} rx="1" fill={band} />
      {rects.map(r => {
        const x = area.x + r.x / 100 * area.w + gap / 2, y = area.y + r.y / 100 * area.h + gap / 2
        const w = r.w / 100 * area.w - gap, h = r.h / 100 * area.h - gap
        return (
          <g key={r.n}>
            <rect x={x} y={y} width={w} height={h} rx="1.6" fill={fill} opacity={r.n === 1 ? 1 : 0.78} />
            <text x={x + w / 2} y={y + h / 2} textAnchor="middle" dominantBaseline="central" fontSize={Math.min(9, h * 0.6, w * 0.7)} fontWeight="700" fill="#ffffff">{r.n}</text>
          </g>
        )
      })}
    </svg>
  )
}
