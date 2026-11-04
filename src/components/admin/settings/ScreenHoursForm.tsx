'use client'
import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Clock } from 'lucide-react'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Field, Input, Select } from '@/components/ui/Field'
import { Switch } from '@/components/ui/Switch'
import SaveBar, { type SaveStatus } from './SaveBar'
import type { ScreenSchedule } from '@/lib/screenSchedule'
import { STANDBY_LABELS, WEEK_DAYS, sameSchedule, timezoneLabel, validateSchedule } from '@/lib/screenSettings'
import { useUnsavedChanges } from '@/lib/useUnsavedChanges'
import { cn } from '@/lib/utils'

// Operating hours of one screen (PATCH /api/screens/[id]/schedule, SCHOOL_ADMIN and up).
// The schedule rules are the existing ones; this form only edits the stored values.
export default function ScreenHoursForm({ screenId, initial, timezone, canEdit }: {
  screenId: string; initial: ScreenSchedule; timezone: string; canEdit: boolean
}) {
  const [saved, setSaved] = useState(initial)
  const [value, setValue] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<SaveStatus>(null)
  const [showErrors, setShowErrors] = useState(false)
  const busy = useRef(false)
  const dirty = !sameSchedule(value, saved)
  const errors = validateSchedule(value)
  const visibleErrors = showErrors ? errors : { days: errors.days }
  useUnsavedChanges(`settings:hours:${screenId}`, dirty)

  const change = (patch: Partial<ScreenSchedule>) => { setStatus(null); setValue(v => ({ ...v, ...patch })) }
  const toggleDay = (d: number) => { setStatus(null); setValue(v => ({ ...v, days: v.days.includes(d) ? v.days.filter(x => x !== d) : [...v.days, d].sort((a, b) => a - b) })) }

  async function save() {
    if (busy.current || !dirty || !canEdit) return
    setShowErrors(true)
    if (Object.keys(errors).length) return
    busy.current = true; setSaving(true); setStatus(null)
    try {
      const r = await fetch(`/api/screens/${encodeURIComponent(screenId)}/schedule`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value),
      })
      if (!r.ok) throw new Error(r.status === 403 ? 'אין לך הרשאה לשנות את שעות הפעילות' : r.status === 404 ? 'המסך לא נמצא' : r.status === 400 ? 'בדקו את השעות והימים שנבחרו' : 'שמירת שעות הפעילות נכשלה. נסו שוב בעוד רגע.')
      setSaved(value); setShowErrors(false)
      setStatus({ kind: 'success', text: 'נשמר. מסך פתוח יתעדכן בבדיקת העדכונים הבאה.' })
      toast.success('שעות הפעילות נשמרו')
    } catch (e) {
      setStatus({ kind: 'error', text: e instanceof Error ? e.message : 'שמירת שעות הפעילות נכשלה' })
    } finally { busy.current = false; setSaving(false) }
  }

  const off = !canEdit || saving
  return (
    <Card id="hours" className="scroll-mt-20">
      <CardHeader title="שעות פעילות" description={<span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden="true" />לפי {timezoneLabel(timezone)}</span>}
        actions={<div className="flex items-center gap-2 text-[13px] text-ui-ink-2"><span aria-hidden="true">{value.enabled ? 'פעיל' : 'כבוי'}</span>
          <Switch checked={value.enabled} disabled={off} onCheckedChange={v => change({ enabled: v })} aria-label="הגבלת שעות פעילות" /></div>} />
      <CardBody className="grid gap-4">
        {!value.enabled
          ? <p className="text-sm text-ui-muted">המסך מציג תוכן בכל שעות היממה.</p>
          : <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="שעת התחלה" htmlFor={`start-${screenId}`} error={visibleErrors.startTime}>
                <Input id={`start-${screenId}`} type="time" dir="ltr" value={value.startTime} disabled={off} invalid={!!visibleErrors.startTime} onChange={e => change({ startTime: e.target.value })} />
              </Field>
              <Field label="שעת סיום" htmlFor={`end-${screenId}`} error={visibleErrors.endTime}>
                <Input id={`end-${screenId}`} type="time" dir="ltr" value={value.endTime} disabled={off} invalid={!!visibleErrors.endTime} onChange={e => change({ endTime: e.target.value })} />
              </Field>
            </div>
            <fieldset className="grid gap-1.5">
              <legend className="mb-1.5 text-[13px] font-semibold text-ui-ink-2">ימי פעילות</legend>
              <div className="grid grid-cols-7 gap-1.5 sm:flex sm:flex-wrap">
                {WEEK_DAYS.map((label, d) => {
                  const on = value.days.includes(d)
                  return <button key={d} type="button" disabled={off} aria-pressed={on} onClick={() => toggleDay(d)}
                    className={cn('ui-focus h-11 min-w-0 rounded-ui-sm border px-1 sm:h-10 sm:min-w-11 sm:px-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                      on ? 'border-ui-primary bg-ui-primary-soft text-ui-primary-ink' : 'border-ui-border-strong bg-ui-surface text-ui-muted hover:bg-ui-subtle')}>{label}</button>
                })}
              </div>
              {visibleErrors.days && <p role="alert" className="text-xs text-ui-danger">{visibleErrors.days}</p>}
            </fieldset>
            <Field label="מחוץ לשעות הפעילות" htmlFor={`standby-${screenId}`} hint="שעת סיום מוקדמת משעת ההתחלה ממשיכה ליום הבא. שעות זהות = יום מלא.">
              <Select id={`standby-${screenId}`} value={value.standbyMode} disabled={off} onChange={e => change({ standbyMode: e.target.value as ScreenSchedule['standbyMode'] })}>
                {(Object.keys(STANDBY_LABELS) as ScreenSchedule['standbyMode'][]).map(k => <option key={k} value={k}>{STANDBY_LABELS[k]}</option>)}
              </Select>
            </Field>
          </>}
      </CardBody>
      {canEdit && <SaveBar label="שמירת שעות פעילות" dirty={dirty} saving={saving} status={status} onSave={save}
        onReset={() => { setValue(saved); setStatus(null); setShowErrors(false) }} />}
    </Card>
  )
}
