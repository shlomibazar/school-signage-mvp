'use client'
import { useId } from 'react'
import { Switch } from '@/components/ui/Switch'
import { EditorGroup } from './Collapsible'
import type { ScreenLayout } from '@/types'
import { footerBirthdayConfig, type BirthdayDisplayConfig } from '@/lib/birthdayDisplay'
import { BirthdayDisplayFields, BirthdayPreviewSummary } from './content-forms/BirthdayContentForm'
import { useBirthdayPreview } from './content-forms/useBirthdayPreview'

interface Props { layout: ScreenLayout; onChange: (p: Partial<ScreenLayout>) => void }

const HEIGHT_OPTIONS = [
  { value: 40, label: 'קטן (40px)' },
  { value: 48, label: 'רגיל (48px)' },
  { value: 60, label: 'גדול (60px)' },
  { value: 72, label: 'גדול מאוד (72px)' },
]

export default function FooterEditor({ layout, onChange }: Props) {
  const mode = layout.footerFeedMode ?? 'manual'
  const speed = layout.footerTickerSpeed ?? 'normal'
  const card = 'rounded-ui-lg border border-ui-border bg-ui-surface px-4 py-3'
  const pill = (on: boolean) => `ui-focus rounded-ui-sm border px-2 py-1.5 text-xs transition-colors ${on ? 'border-ui-primary bg-ui-primary-soft font-medium text-ui-primary-ink' : 'border-ui-border text-ui-ink-2 hover:bg-ui-subtle'}`
  const toggle = (key: keyof ScreenLayout, label: string) => (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-[13px] text-ui-ink">{label}</span>
      <Switch checked={!!layout[key]} onCheckedChange={v => onChange({ [key]: v })} aria-label={label} />
    </div>
  )
  return (
    <div className="grid gap-3">
      {/* The ticker text: what people change most often. */}
      <section className={card}>
        <label htmlFor="footer-ticker-text" className="block text-sm font-semibold text-ui-ink">הודעות בפס הגולל</label>
        <p id="footer-ticker-hint" className="mb-2 mt-0.5 text-xs text-ui-muted">
          {mode === 'rss' ? 'הפס מציג כרגע RSS בלבד, ולכן ההודעות האלה לא יוצגו. אפשר לשנות זאת ב״חדשות RSS בפס״.' : 'הטקסט גולל בתחתית המסך. אפשר להפריד בין הודעות בסימן ✦ או ברווח.'}
        </p>
        <textarea id="footer-ticker-text" rows={3} aria-describedby="footer-ticker-hint"
          value={layout.footerTicker ?? ''}
          onChange={e => onChange({ footerTicker: e.target.value || null })}
          placeholder="לדוגמה: מחר יום ספורט שכבתי ✦ הספרייה פתוחה בהפסקה הגדולה"
          className="ui-focus w-full resize-y rounded-ui-sm border border-ui-border-strong bg-ui-surface px-3 py-2 text-sm" />
        {/* Ticker speed: the whole ticker (birthdays, messages, RSS), on the TV and in the preview. */}
        <p className="mb-1.5 mt-3 text-xs font-medium text-ui-ink-2" id="footer-speed-label">מהירות גלילת הפס</p>
        <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-labelledby="footer-speed-label">
          {([['slow', 'איטית'], ['normal', 'רגילה'], ['fast', 'מהירה']] as const).map(([v, label]) => (
            <button key={v} type="button" role="radio" aria-checked={speed === v} onClick={() => onChange({ footerTickerSpeed: v })} className={pill(speed === v)}>{label}</button>
          ))}
        </div>
      </section>

      <FooterBirthdays layout={layout} onChange={onChange} />

      <EditorGroup title="חדשות RSS בפס" summary={mode === 'manual' ? 'כבוי — הודעות בית הספר בלבד' : mode === 'rss' ? 'RSS בלבד' : 'RSS והודעות בית הספר'}>
        <div className="space-y-2">
          <label className="block text-xs text-ui-ink-2" htmlFor="footer-feed-mode">תוכן הפס</label>
          <select id="footer-feed-mode" className="ui-focus h-9 w-full rounded-ui-sm border border-ui-border-strong bg-ui-surface px-2 text-sm" value={mode} onChange={e => onChange({ footerFeedMode: e.target.value as 'manual' | 'rss' | 'both' })}>
            <option value="manual">הודעות בית הספר בלבד</option><option value="rss">RSS בלבד</option><option value="both">שילוב RSS והודעות בית הספר</option>
          </select>
          {(mode === 'rss' || mode === 'both') && <>
            <label className="block text-xs text-ui-ink-2" htmlFor="footer-rss-url">כתובת פיד RSS</label>
            <input id="footer-rss-url" dir="ltr" type="url" placeholder="https://example.com/feed.xml" value={layout.footerRssUrl ?? ''} onChange={e => onChange({ footerRssUrl: e.target.value || null })} className="ui-focus h-9 w-full rounded-ui-sm border border-ui-border-strong bg-ui-surface px-2 text-xs" />
            <label className="block text-xs text-ui-ink-2">רענון בדקות
              <input type="number" min={5} max={60} value={layout.footerRssRefreshMinutes ?? 15} onChange={e => onChange({ footerRssRefreshMinutes: Math.max(5, Math.min(60, Number(e.target.value) || 5)) })} className="ui-focus mt-1 h-9 w-full rounded-ui-sm border border-ui-border-strong px-2" />
            </label>
            <p className="text-xs text-ui-muted">כל כותרות הפיד הזמינות יופיעו בגלילה.</p>
          </>}
          <p className="text-xs text-ui-muted">RSS באזור תוכן ממשיך לעבוד בנפרד, כרשימה באזור.</p>
        </div>
      </EditorGroup>

      <EditorGroup title="גודל ופרטים נוספים" summary={`גובה ${layout.footerHeight ?? 48}px${layout.footerShowClock ? ' · שעון' : ''}${layout.footerShowSchoolName ? ' · שם המסך' : ''}`}>
        <div className="space-y-3">
          <div>
            <p className="mb-1.5 text-xs text-ui-ink-2">גובה הכותרת התחתונה</p>
            <div className="grid grid-cols-2 gap-1.5">
              {HEIGHT_OPTIONS.map(opt => (
                <button key={opt.value} type="button" aria-pressed={(layout.footerHeight ?? 48) === opt.value} onClick={() => onChange({ footerHeight: opt.value })} className={pill((layout.footerHeight ?? 48) === opt.value)}>{opt.label}</button>
              ))}
            </div>
          </div>
          <div>
            {toggle('footerShowSchoolName', 'שם המסך')}
            {toggle('footerShowClock', 'שעון')}
          </div>
        </div>
      </EditorGroup>
    </div>
  )
}

// The birthday segment of the ticker: people from the central registry, by audience, range and grade.
// Independent of birthday regions; shown before the school's messages and RSS headlines, never
// replacing them, and left out entirely when nobody has a birthday in the range.
function FooterBirthdays({ layout, onChange }: Props) {
  const id = useId()
  const on = !!layout.footerShowBirthdays
  const config = footerBirthdayConfig(layout)
  const preview = useBirthdayPreview(on ? layout.screenId : null, config)
  const patch = (p: Partial<BirthdayDisplayConfig>) => onChange({
    ...(p.audience ? { footerBirthdayAudience: p.audience } : {}), ...(p.period ? { footerBirthdayPeriod: p.period } : {}),
    ...(p.grades ? { footerBirthdayGrades: p.grades } : {}), ...(p.nameFormat ? { footerBirthdayNameFormat: p.nameFormat } : {}),
  })
  return (
    <section className="rounded-ui-lg border border-ui-border bg-ui-surface px-4 py-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span id={`${id}-label`} className="text-sm font-semibold text-gray-800">🎂 ימי הולדת בפס התחתון</span>
        <Switch checked={on} onCheckedChange={v => onChange({ footerShowBirthdays: v })} aria-label="ימי הולדת בפס התחתון" />
      </div>
      <p className="text-xs text-gray-500">שמות מהרשימה המרכזית יגללו בתחילת הפס, ואחריהם הודעות בית הספר וה־RSS כרגיל. כשאין ימי הולדת בטווח — הפס מציג רק את התוכן הרגיל.</p>
      {on && <>
        <BirthdayDisplayFields value={config} onChange={patch} grades={preview.grades} idPrefix={id} compact />
        <BirthdayPreviewSummary preview={preview} />
      </>}
    </section>
  )
}
