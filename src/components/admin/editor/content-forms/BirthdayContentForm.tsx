'use client'
import { useEffect, useId, useState } from 'react'
import { Info, AlertTriangle, Loader2, Users } from 'lucide-react'
import type { BirthdaySettings } from '@/types'
import { cn } from '@/lib/utils'
import {
  BIRTHDAY_AUDIENCES, BIRTHDAY_RANGES, birthdayHeading, normalizeBirthdayRegion, isLegacyBirthdayCard,
  type BirthdayRegionSettings, type BirthdayDisplayConfig,
} from '@/lib/birthdayDisplay'
import { useBirthdayPreview } from './useBirthdayPreview'

// "ימי הולדת" region: how birthdays are presented. The people themselves are managed only in the
// central registry (/admin/birthdays) — nothing about a person is typed here.
interface Props {
  screenId: string
  settings: BirthdaySettings
  onSettings: (s: BirthdaySettings) => void
}

export default function BirthdayContentForm({ screenId, settings, onSettings }: Props) {
  const value = normalizeBirthdayRegion(settings)
  const legacyName = isLegacyBirthdayCard(settings) ? (settings.personName ?? '').trim() : ''
  const legacy = isLegacyBirthdayCard(settings) && Object.keys(settings ?? {}).length > 0
  const set = (patch: Partial<BirthdayRegionSettings>) => onSettings({ ...value, ...patch })
  const preview = useBirthdayPreview(screenId, value)
  const id = useId()

  return (
    <div className="grid gap-4">
      {legacy && (
        <div role="status" className="flex gap-2 rounded-ui-sm border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>האזור הזה הוגדר בעבר ככרטיס ידני{legacyName ? ` (${legacyName})` : ''}. ימי ההולדת נלקחים עכשיו מהרשימה המרכזית: לאחר שמירה האזור יציג אותם לפי ההגדרות כאן, והכרטיס הידני יוסר.</p>
        </div>
      )}

      <BirthdayDisplayFields value={value} onChange={set} grades={preview.grades} idPrefix={id} />

      <div className="grid gap-1.5">
        <label htmlFor={`${id}-title`} className="text-[13px] font-semibold text-ui-ink-2">כותרת</label>
        <input id={`${id}-title`} type="text" maxLength={80} value={value.title} placeholder={birthdayHeading(value.period, preview.list?.today)}
          onChange={e => set({ title: e.target.value })}
          className="ui-focus h-10 w-full rounded-ui-sm border border-ui-border-strong bg-ui-surface px-3 text-sm text-ui-ink" />
        <p className="text-xs text-ui-muted">ריק = כותרת לפי טווח התאריכים.</p>
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-greeting`} className="text-[13px] font-semibold text-ui-ink-2">ברכה מתחת לכותרת</label>
        <input id={`${id}-greeting`} type="text" maxLength={120} value={value.greetingText} placeholder="לדוגמה: מזל טוב! 🎉"
          onChange={e => set({ greetingText: e.target.value })}
          className="ui-focus h-10 w-full rounded-ui-sm border border-ui-border-strong bg-ui-surface px-3 text-sm text-ui-ink" />
      </div>

      <BirthdayPreviewSummary preview={preview} />
    </div>
  )
}

/** Audience, date range, grades and name format — shared by the region form and the footer settings. */
export function BirthdayDisplayFields({ value, onChange, grades, idPrefix, compact = false }: {
  value: BirthdayDisplayConfig; onChange: (patch: Partial<BirthdayDisplayConfig>) => void
  grades: string[] | null; idPrefix: string; compact?: boolean
}) {
  const studentsShown = value.audience !== 'TEACHER'
  const toggleGrade = (g: string) => onChange({ grades: value.grades.includes(g) ? value.grades.filter(x => x !== g) : [...value.grades, g] })
  const label = compact ? 'text-xs font-medium text-ui-ink-2' : 'text-[13px] font-semibold text-ui-ink-2'
  return (
    <>
      <fieldset className="grid gap-1.5">
        <legend className={cn(label, 'mb-1.5')}>מי יוצג</legend>
        <div role="radiogroup" className="grid grid-cols-3 gap-1.5">
          {BIRTHDAY_AUDIENCES.map(a => (
            <button key={a.value} type="button" role="radio" aria-checked={value.audience === a.value} onClick={() => onChange({ audience: a.value })}
              className={cn('ui-focus min-h-9 rounded-ui-sm border px-2 py-1.5 text-xs font-medium transition-colors', value.audience === a.value ? 'border-ui-primary bg-ui-primary-soft text-ui-primary-ink' : 'border-ui-border bg-ui-surface text-ui-ink-2 hover:bg-ui-subtle')}>
              {a.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-1.5">
        <label htmlFor={`${idPrefix}-range`} className={label}>טווח תאריכים</label>
        <select id={`${idPrefix}-range`} value={value.period} onChange={e => onChange({ period: e.target.value as BirthdayDisplayConfig['period'] })}
          className="ui-focus h-10 w-full rounded-ui-sm border border-ui-border-strong bg-ui-surface px-3 text-sm text-ui-ink">
          {BIRTHDAY_RANGES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <p className="text-xs text-ui-muted">{BIRTHDAY_RANGES.find(r => r.value === value.period)?.hint}. מי שנולד ב־29 בפברואר מוצג ב־28 בפברואר בשנה שאינה מעוברת.</p>
      </div>

      {studentsShown && (
        <fieldset className="grid gap-1.5">
          <legend className={cn(label, 'mb-1.5')}>שכבות</legend>
          {grades === null ? (
            <p className="flex items-center gap-1.5 text-xs text-ui-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />טוען שכבות…</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              <button type="button" aria-pressed={!value.grades.length} onClick={() => onChange({ grades: [] })}
                className={cn('ui-focus h-8 rounded-full border px-3 text-xs font-medium', !value.grades.length ? 'border-ui-primary bg-ui-primary-soft text-ui-primary-ink' : 'border-ui-border text-ui-ink-2 hover:bg-ui-subtle')}>
                כל השכבות
              </button>
              {/* Grades saved earlier that no student has now still show, so they can be removed. */}
              {[...new Set([...grades, ...value.grades])].map(g => (
                <button key={g} type="button" aria-pressed={value.grades.includes(g)} onClick={() => toggleGrade(g)}
                  className={cn('ui-focus h-8 min-w-10 rounded-full border px-3 text-xs font-medium', value.grades.includes(g) ? 'border-ui-primary bg-ui-primary-soft text-ui-primary-ink' : 'border-ui-border text-ui-ink-2 hover:bg-ui-subtle')}>
                  {g}
                </button>
              ))}
              {!grades.length && !value.grades.length && <span className="self-center text-xs text-ui-muted">אין עדיין תלמידים עם שכבה ברשימה</span>}
            </div>
          )}
          {value.audience === 'ALL' && value.grades.length > 0 && (
            <p className="text-xs text-ui-muted">הסינון לפי שכבה חל על תלמידים בלבד. כל המורים שיום הולדתם בטווח יוצגו.</p>
          )}
        </fieldset>
      )}

      <div className="grid gap-1.5">
        <label htmlFor={`${idPrefix}-name`} className={label}>הצגת שם</label>
        <select id={`${idPrefix}-name`} value={value.nameFormat} onChange={e => onChange({ nameFormat: e.target.value === 'full' ? 'full' : 'first' })}
          className="ui-focus h-10 w-full rounded-ui-sm border border-ui-border-strong bg-ui-surface px-3 text-sm text-ui-ink">
          <option value="first">שם פרטי בלבד (מומלץ)</option>
          <option value="full">שם פרטי ושם משפחה</option>
        </select>
      </div>
    </>
  )
}

/** "כרגע יוצגו 3 ימי הולדת: …" — what the screen would show now with these settings. */
export function BirthdayPreviewSummary({ preview }: { preview: ReturnType<typeof useBirthdayPreview> }) {
  const { list, error, loading } = preview
  const total = list ? list.items.length + list.more : 0
  return (
    <div className="flex gap-2 rounded-ui-sm border border-ui-border bg-ui-subtle px-3 py-2.5 text-xs leading-relaxed text-ui-ink-2" aria-live="polite">
      {loading && !list ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-ui-muted" aria-hidden="true" /> : <Users className="mt-0.5 h-4 w-4 shrink-0 text-ui-muted" aria-hidden="true" />}
      <div className="min-w-0">
        {error ? <p className="text-ui-danger">{error}</p>
          : !list ? <p>בודק מי יוצג…</p>
          : total === 0 ? <p>כרגע אין ימי הולדת בטווח הזה. המסך יציג הודעה מתאימה במקום רשימה ריקה.</p>
          : <p>כרגע {total === 1 ? 'יוצג יום הולדת אחד' : `יוצגו ${total} ימי הולדת`}: <span className="text-ui-ink">{list.items.slice(0, 6).map(b => b.name).join(', ')}{total > 6 ? ' ועוד' : ''}</span></p>}
        <p className="mt-1 flex items-start gap-1 text-ui-muted"><Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />הרשומות עצמן מנוהלות במקום אחד: עמוד &quot;ימי הולדת&quot; (מנהלי בית הספר).</p>
      </div>
    </div>
  )
}
