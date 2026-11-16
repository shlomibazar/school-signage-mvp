'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Plus, Trash2, X, Repeat, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Field, Input, Checkbox } from '@/components/ui/Field'
import { Badge } from '@/components/ui/Display'
import { confirmDialog } from '@/components/ui/ConfirmHost'
import { cn } from '@/lib/utils'
import { addDays, staffName, type Issue, type TemplateRule, type WeekContext } from '@/lib/duty/rules'
import DutyStaffPicker, { createStaffRequest, type PickResult, type Slot } from './DutyStaffPicker'
import type { BoardSetup } from './DutyWeekBoard'

// The recurring weekly template ("תבנית קבועה"): versions with effective dates, each a grid of
// weekday × period × location. Editing a version changes every week it covers that follows the
// template (published rosters stay as published until republished). A change from a specific date
// on is made from the weekly board ("מתאריך זה והלאה"), which starts a new version on that date.

type Api = <T>(path: string, method?: string, body?: unknown) => Promise<{ ok: boolean; data?: T; error?: string; issues?: Issue[] }>
const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
const REF = '2000-01-02' // a Sunday: weekdays become dates of a reference week for the shared rules
const fmt = (d: string | null) => d ? d.split('-').reverse().join('.') : ''

export default function DutyTemplateEditor({ setup, api, canEdit, currentWeekStart, onChanged, reloadSetup }: { setup: BoardSetup; api: Api; canEdit: boolean; currentWeekStart: string; onChanged: () => void; reloadSetup: () => Promise<void> }) {
  const [templates, setTemplates] = useState<TemplateRule[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [picker, setPicker] = useState<{ slot: Slot; weekday: number; entryId?: string; staffId?: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const r = await api<TemplateRule[]>('templates')
    if (!r.ok) { toast.error(r.error!); return }
    setTemplates(r.data!)
    setSelected(s => s && r.data!.some(t => t.id === s) ? s : r.data!.find(t => !t.effectiveUntil || t.effectiveUntil >= currentWeekStart)?.id ?? r.data![0]?.id ?? null)
  }, [api, currentWeekStart])
  useEffect(() => { void load() }, [load])

  const t = templates?.find(x => x.id === selected) ?? null
  const days = setup.settings.schoolDays.slice().sort()
  const periods = setup.periods.filter(p => p.active), locations = setup.locations.filter(l => l.active)
  const staffById = useMemo(() => new Map(setup.staff.map(s => [s.id, s])), [setup.staff])
  // The template as a week of the shared rules (no dates, absences or temporary validity here).
  const ctx: WeekContext = useMemo(() => ({
    ...setup, staff: setup.staff.map(s => ({ ...s, validFrom: null, validUntil: null })), absences: [], calendar: [],
    assignments: (t?.entries ?? []).map(e => ({ id: e.id, date: addDays(REF, e.weekday), periodId: e.periodId, locationId: e.locationId, staffId: e.staffId })),
  }), [setup, t])

  const after = async (r: { ok: boolean; error?: string }, msg: string) => { if (r.ok) { toast.success(msg); await load(); onChanged() } else toast.error(r.error ?? 'הפעולה נכשלה') }
  const pick = async (staffId: string, overrideReason?: string): Promise<PickResult> => {
    if (!t || !picker) return { ok: false }
    setBusy(true)
    const r = await api('template-entry', 'POST', { templateId: t.id, weekday: picker.weekday, periodId: picker.slot.periodId, locationId: picker.slot.locationId, staffId, replaceEntryId: picker.entryId, overrideReason: overrideReason ?? null })
    setBusy(false)
    if (r.ok) await after(r, 'השיבוץ הקבוע נשמר')
    return { ok: r.ok, error: r.error, issues: r.issues }
  }
  const remove = async (entryId: string) => { setBusy(true); await after(await api('template-entry?id=' + entryId, 'DELETE'), 'הוסר מהתבנית'); setBusy(false) }
  const del = async () => {
    if (!t || !(await confirmDialog({ title: `למחוק את התבנית "${t.name}"?`, body: 'שבועות שפורסמו לא משתנים. שבועות שלא פורסמו ופעלו לפי התבנית יישארו בלי שיבוצים קבועים.', confirmLabel: 'מחיקה' }))) return
    await after(await api('template?id=' + t.id, 'DELETE'), 'התבנית נמחקה')
  }

  if (!templates) return <Card className="flex items-center gap-2 p-6 text-sm text-ui-muted"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />טוען…</Card>
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader title="תבנית קבועה" description="שיבוץ שבועי שחוזר בכל שבוע בתקופת התוקף. שינוי לתאריך אחד נעשה בלוח השבועי ולא משנה את התבנית." actions={canEdit && <Button size="sm" variant="primary" onClick={() => setCreating(v => !v)} icon={<Plus className="h-4 w-4" aria-hidden="true" />}>תבנית חדשה</Button>} />
        <CardBody className="grid gap-3">
          {creating && <CreateTemplate api={api} currentWeekStart={currentWeekStart} onDone={async id => { setCreating(false); await load(); if (id) setSelected(id); onChanged() }} />}
          {!templates.length && !creating && <p className="text-sm text-ui-muted">אין עדיין תבנית קבועה. אפשר ליצור אחת ריקה, או מתוך השבוע הנוכחי.</p>}
          {templates.length > 0 && (
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="גרסאות התבנית">
              {templates.map(x => (
                <button key={x.id} type="button" role="tab" aria-selected={x.id === selected} onClick={() => setSelected(x.id)}
                  className={cn('ui-focus rounded-ui-sm border px-2.5 py-1 text-[13px]', x.id === selected ? 'border-ui-primary bg-ui-primary-soft font-semibold text-ui-primary-ink' : 'border-ui-border text-ui-ink-2')}>
                  {x.name} <span className="text-ui-muted">{fmt(x.effectiveFrom)}–{x.effectiveUntil ? fmt(x.effectiveUntil) : 'והלאה'}</span>
                </button>
              ))}
            </div>
          )}
          {t && canEdit && <TemplateDates key={t.id} t={t} api={api} onDone={async () => { await load(); onChanged() }} onDelete={del} />}
        </CardBody>
      </Card>
      {t && (
        <Card>
          <div className="flex items-center justify-between gap-2 border-b border-ui-border px-4 py-2 text-[13px]">
            <span className="flex items-center gap-1.5"><Repeat className="h-4 w-4 text-ui-primary" aria-hidden="true" />{t.entries.length} שיבוצים קבועים · בתוקף {fmt(t.effectiveFrom)}–{t.effectiveUntil ? fmt(t.effectiveUntil) : 'והלאה'}</span>
            {busy && <span className="flex items-center gap-1 text-xs text-ui-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />שומר…</span>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-[13px]">
              <thead><tr className="bg-ui-subtle text-ui-ink-2"><th className="sticky right-0 z-10 bg-ui-subtle px-3 py-2 text-start font-semibold">הפסקה / מקום</th>{days.map(d => <th key={d} className="px-2 py-2 text-start font-semibold">{DAYS[d]}</th>)}</tr></thead>
              <tbody>
                {periods.map(p => locations.map((l, li) => (
                  <tr key={p.id + l.id} className={cn('border-t border-ui-border align-top', li === 0 && 'border-t-2 border-t-ui-border-strong')}>
                    <th scope="row" className="sticky right-0 z-10 max-w-[180px] bg-ui-surface px-3 py-2 text-start font-normal">
                      {li === 0 && <div className="font-semibold text-ui-ink">{p.name} <span className="font-normal text-ui-muted" dir="ltr">{p.startTime}–{p.endTime}</span></div>}
                      <div className="text-ui-ink-2">{l.name}</div>
                    </th>
                    {days.map(d => {
                      if (!p.weekdays.includes(d)) return <td key={d} className="bg-ui-subtle/50 px-2 py-2 text-ui-faint">—</td>
                      const here = t.entries.filter(e => e.weekday === d && e.periodId === p.id && e.locationId === l.id)
                      const slot = { date: addDays(REF, d), periodId: p.id, locationId: l.id }
                      const open = picker && picker.weekday === d && picker.slot.periodId === p.id && picker.slot.locationId === l.id
                      return (
                        <td key={d} data-tslot={`${d}|${p.id}|${l.id}`} className={cn('relative px-1.5 py-1.5', !here.length && l.required && 'bg-red-50/40')}>
                          <div className="flex flex-col gap-1">
                            {here.map(e => (
                              <span key={e.id} data-entry={e.id} className="inline-flex items-center justify-between gap-1 rounded-ui-sm border border-ui-border bg-ui-surface px-1.5 py-0.5">
                                <button type="button" disabled={!canEdit || busy} onClick={() => setPicker({ slot, weekday: d, entryId: e.id, staffId: e.staffId })} className="ui-focus min-w-0 truncate rounded text-start">{staffById.get(e.staffId) ? staffName(staffById.get(e.staffId)!) : '—'}</button>
                                {canEdit && <button type="button" aria-label="הסרה מהתבנית" disabled={busy} onClick={() => remove(e.id)} className="ui-focus rounded text-ui-muted hover:text-ui-danger"><X className="h-3.5 w-3.5" aria-hidden="true" /></button>}
                              </span>
                            ))}
                            {canEdit && <button type="button" disabled={busy} onClick={() => setPicker({ slot, weekday: d })} className={cn('ui-focus self-start rounded px-1 text-[12px]', here.length ? 'text-ui-muted opacity-60 hover:opacity-100' : 'text-red-700')}>{here.length ? '+ הוספה' : '+ שיבוץ קבוע'}</button>}
                            {open && <DutyStaffPicker ctx={ctx} weekStart={REF} slot={picker.slot} staff={setup.staff} ignoreAssignmentId={picker.entryId} currentStaffId={picker.staffId}
                              allowOverride={setup.settings.allowOverride} canAddStaff={canEdit} onPick={pick} onClose={() => setPicker(null)} title={`יום ${DAYS[d]} – שיבוץ קבוע`}
                              onCreateStaff={async input => { const r = await createStaffRequest(input); if (r.id) await reloadSetup(); return r }} />}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2 text-xs text-ui-muted">שינוי כאן חל על כל השבועות בתוקף התבנית שפועלים לפיה. לשינוי מתאריך מסוים והלאה: בלוח השבועי, לחיצה על השם ← ״מתאריך זה והלאה״. לוחות שכבר פורסמו לא משתנים עד הפרסום הבא.</p>
        </Card>
      )}
    </div>
  )
}

function CreateTemplate({ api, currentWeekStart, onDone }: { api: Api; currentWeekStart: string; onDone: (id?: string) => void }) {
  const [f, setF] = useState({ name: 'שיבוץ קבוע', effectiveFrom: currentWeekStart, effectiveUntil: '', fromWeek: true })
  const save = async () => {
    const r = await api<{ id: string }>('template', 'POST', { name: f.name, effectiveFrom: f.effectiveFrom, effectiveUntil: f.effectiveUntil || null, fromWeekStart: f.fromWeek ? currentWeekStart : null })
    if (!r.ok) { toast.error(r.error!); return }
    toast.success('התבנית נוצרה'); onDone(r.data!.id)
  }
  return (
    <form className="grid gap-2 rounded-ui-sm bg-ui-subtle p-3" onSubmit={e => { e.preventDefault(); void save() }}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Field label="שם" htmlFor="tp-n"><Input id="tp-n" value={f.name} maxLength={80} onChange={e => setF({ ...f, name: e.target.value })} required /></Field>
        <Field label="בתוקף מתאריך" htmlFor="tp-f"><Input id="tp-f" type="date" value={f.effectiveFrom} onChange={e => setF({ ...f, effectiveFrom: e.target.value })} required /></Field>
        <Field label="עד תאריך (לא חובה)" htmlFor="tp-u"><Input id="tp-u" type="date" value={f.effectiveUntil} onChange={e => setF({ ...f, effectiveUntil: e.target.value })} /></Field>
      </div>
      <Checkbox label="להתחיל מהשיבוצים של השבוע המוצג בלוח" checked={f.fromWeek} onChange={e => setF({ ...f, fromWeek: e.target.checked })} />
      <div className="flex gap-2"><Button type="submit" variant="primary">יצירה</Button><Button variant="ghost" onClick={() => onDone()}>ביטול</Button></div>
    </form>
  )
}

function TemplateDates({ t, api, onDone, onDelete }: { t: TemplateRule; api: Api; onDone: () => void; onDelete: () => void }) {
  const [f, setF] = useState({ name: t.name, effectiveFrom: t.effectiveFrom, effectiveUntil: t.effectiveUntil ?? '' })
  const dirty = f.name !== t.name || f.effectiveFrom !== t.effectiveFrom || f.effectiveUntil !== (t.effectiveUntil ?? '')
  const save = async () => {
    const r = await api('template', 'PATCH', { id: t.id, name: f.name, effectiveFrom: f.effectiveFrom, effectiveUntil: f.effectiveUntil || null })
    if (r.ok) { toast.success('נשמר'); onDone() } else toast.error(r.error!)
  }
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label="שם" htmlFor={`td-n-${t.id}`}><Input id={`td-n-${t.id}`} value={f.name} maxLength={80} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="מתאריך" htmlFor={`td-f-${t.id}`}><Input id={`td-f-${t.id}`} type="date" value={f.effectiveFrom} onChange={e => setF({ ...f, effectiveFrom: e.target.value })} /></Field>
      <Field label="עד תאריך" htmlFor={`td-u-${t.id}`}><Input id={`td-u-${t.id}`} type="date" value={f.effectiveUntil} onChange={e => setF({ ...f, effectiveUntil: e.target.value })} /></Field>
      <Button size="sm" variant="primary" disabled={!dirty} onClick={save}>שמירת תוקף</Button>
      <Button size="sm" variant="danger-outline" onClick={onDelete} icon={<Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}>מחיקת התבנית</Button>
      {t.effectiveUntil && <Badge>מסתיימת ב-{fmt(t.effectiveUntil)}</Badge>}
    </div>
  )
}
