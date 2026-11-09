'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Settings2 } from 'lucide-react'
import { Switch } from '@/components/ui/Switch'
import { EditorGroup } from './Collapsible'
import { confirmLeaveEditor } from '@/lib/unsavedChanges'
import { weatherCityName } from '@/lib/screenSettings'
import type { ScreenLayout, DateType } from '@/types'

// The school's logo and weather city are shared by all screens and edited in the school settings
// (/admin/settings#school); here they are shown read-only. Whether a screen shows them is a layout
// setting (headerShowLogo / headerShowWeather) and stays here.
interface Props { layout: ScreenLayout; onChange: (p: Partial<ScreenLayout>) => void; weatherCity?: string | null; logoUrl?: string | null }

const HEIGHT_OPTIONS = [
  { value: 60,  label: 'קטן (60px)' },
  { value: 80,  label: 'רגיל (80px)' },
  { value: 100, label: 'גדול (100px)' },
  { value: 120, label: 'גדול מאוד (120px)' },
]

const DATE_TYPE_OPTIONS: { value: DateType; label: string; example: string }[] = [
  { value: 'HEBREW',     label: 'עברי בלבד',       example: '15 בסיוון התשפ"ה' },
  { value: 'GREGORIAN',  label: 'לועזי בלבד',       example: 'יום שלישי, 15 ביוני' },
  { value: 'BOTH',       label: 'שניהם',            example: 'לועזי + עברי' },
]

export default function HeaderEditor({ layout, onChange, logoUrl, weatherCity }: Props) {
  const router = useRouter()
  const maxTitle = Math.min(64, Math.floor((layout.headerHeight ?? 80) * 0.6))
  const titleSize = Math.min(layout.headerTitleFontSize ?? 26, maxTitle)
  const toggle = (key: keyof ScreenLayout, label: string, hint?: string) => (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="min-w-0"><span className="block text-[13px] text-ui-ink">{label}</span>{hint && <span className="block text-xs text-ui-muted">{hint}</span>}</span>
      <Switch checked={!!layout[key]} onCheckedChange={v => onChange({ [key]: v })} aria-label={label} />
    </div>
  )
  const card = 'rounded-ui-lg border border-ui-border bg-ui-surface px-4 py-3'
  const pill = (on: boolean) => `ui-focus rounded-ui-sm border px-2 py-1.5 text-xs transition-colors ${on ? 'border-ui-primary bg-ui-primary-soft font-medium text-ui-primary-ink' : 'border-ui-border text-ui-ink-2 hover:bg-ui-subtle'}`
  return (
    <div className="grid gap-3">
      {/* The most visible text of the header: first. */}
      <section className={card}>
        <label htmlFor="header-screen-title" className="block text-sm font-semibold text-ui-ink">כותרת המסך</label>
        <p id="header-screen-title-hint" className="mb-2 mt-0.5 text-xs text-ui-muted">טקסט בולט במרכז הכותרת העליונה, למשל ״ברוכים הבאים״ או הודעה קצרה. כשהשדה ריק לא מוצגת כותרת במרכז.</p>
        <input id="header-screen-title" type="text" aria-describedby="header-screen-title-hint"
          value={layout.headerScrollText ?? ''}
          onChange={e => onChange({ headerScrollText: e.target.value || null })}
          placeholder="לדוגמה: ברוכים הבאים לתיכון"
          className="ui-focus h-10 w-full rounded-ui-sm border border-ui-border-strong bg-ui-surface px-3 text-sm" />
      </section>

      <section className={card}>
        <h3 className="mb-1 text-sm font-semibold text-ui-ink">מה מוצג בכותרת</h3>
        <div className="divide-y divide-ui-border">
          <div className="pb-1">
            <p className="pt-1 text-xs font-medium text-ui-muted">שם המסך ולוגו</p>
            {toggle('headerShowTitle', 'שם המסך')}
            {toggle('headerShowLogo', 'לוגו בית הספר')}
          </div>
          <div className="py-1">
            <p className="pt-2 text-xs font-medium text-ui-muted">שעון ותאריכים</p>
            {toggle('headerShowClock', 'שעון')}
            {toggle('headerShowDate', 'תאריך')}
            {layout.headerShowDate && (
              <div className="grid grid-cols-3 gap-1.5 pb-1.5" role="group" aria-label="סוג תאריך">
                {DATE_TYPE_OPTIONS.map(opt => (
                  <button key={opt.value} type="button" title={opt.example} aria-pressed={(layout.headerDateType ?? 'BOTH') === opt.value}
                    onClick={() => onChange({ headerDateType: opt.value })} className={pill((layout.headerDateType ?? 'BOTH') === opt.value)}>{opt.label}</button>
                ))}
              </div>
            )}
            {toggle('headerShowParasha', 'פרשת השבוע', 'ליד התאריך')}
          </div>
          <div className="pt-1">
            <p className="pt-2 text-xs font-medium text-ui-muted">מידע נוסף</p>
            {toggle('headerShowWeather', 'מזג אוויר')}
          </div>
        </div>
      </section>

      <EditorGroup title="גודל ועיצוב הכותרת" summary={`גובה ${layout.headerHeight ?? 80}px · כותרת ${titleSize}px`}>
        <div className="space-y-3">
          <div>
            <p className="mb-1.5 text-xs text-ui-ink-2">גובה הכותרת</p>
            <div className="grid grid-cols-2 gap-1.5">
              {HEIGHT_OPTIONS.map(opt => (
                <button key={opt.value} type="button" aria-pressed={(layout.headerHeight ?? 80) === opt.value}
                  onClick={() => onChange({ headerHeight: opt.value, headerTitleFontSize: Math.min(layout.headerTitleFontSize ?? 26, Math.min(64, Math.floor(opt.value * 0.6))) })}
                  className={pill((layout.headerHeight ?? 80) === opt.value)}>{opt.label}</button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs text-ui-ink-2">גודל כותרת המסך: {titleSize}px</span>
            <input type="range" min={14} max={maxTitle} step={1} value={titleSize} onChange={e => onChange({ headerTitleFontSize: Number(e.target.value) })} className="w-full" />
          </label>
          <div>
            <p className="mb-1.5 text-xs text-ui-ink-2">עובי כותרת המסך</p>
            <div className="grid grid-cols-3 gap-1.5">
              {[{ value: 400, label: 'רגיל' }, { value: 600, label: 'בינוני' }, { value: 700, label: 'מודגש' }].map(opt => (
                <button type="button" key={opt.value} aria-pressed={(layout.headerTitleFontWeight ?? 700) === opt.value}
                  onClick={() => onChange({ headerTitleFontWeight: opt.value })} className={pill((layout.headerTitleFontWeight ?? 700) === opt.value)}>{opt.label}</button>
              ))}
            </div>
          </div>
        </div>
      </EditorGroup>

      <EditorGroup title="פרטי בית הספר" summary="לוגו ועיר למזג האוויר · משותפים לכל המסכים">
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-ui-muted">לוגו</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logoUrl ? <img src={logoUrl} alt="לוגו בית הספר" className="h-8 w-auto max-w-[96px] object-contain" /> : <span className="text-ui-muted">לא הוגדר</span>}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-ui-muted">עיר למזג האוויר</span>
            <span className="truncate text-ui-ink-2">{weatherCityName(weatherCity) || 'ברירת המחדל של המערכת'}</span>
          </div>
          <Link href="/admin/settings#school"
            onClick={e => { e.preventDefault(); void confirmLeaveEditor('יש שינויים שלא נשמרו בעורך. לעבור להגדרות בית הספר ולבטל אותם?').then(ok => { if (ok) router.push('/admin/settings#school') }) }}
            className="inline-flex items-center gap-1 font-medium text-ui-primary hover:underline">
            <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />ניהול בהגדרות בית הספר
          </Link>
        </div>
      </EditorGroup>
    </div>
  )
}
