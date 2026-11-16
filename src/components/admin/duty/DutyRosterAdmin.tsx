'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { ChevronRight, ChevronLeft, Send, Copy, Sparkles, X, Plus, AlertTriangle, UserX, Trash2, Pencil, Archive } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Field, Input, Select, Checkbox } from '@/components/ui/Field'
import { Badge } from '@/components/ui/Display'
import { confirmDialog } from '@/components/ui/ConfirmHost'
import { cn } from '@/lib/utils'
import { weekStartOf, weekDates, addDays, weekdayOf, NO_SUBSTITUTE_LABEL, type DutyAccessLevel, type Issue, type StaffKind, type ScheduleMode } from '@/lib/duty/rules'
import { KIND_LABEL } from './DutyStaffPicker'
import DutyWeekBoard, { type BoardWeek, type SaveState } from './DutyWeekBoard'
import DutyTemplateEditor from './DutyTemplateEditor'

// Duty roster admin: weekly board (assign, remove, suggestions, copy, publish), absences and
// substitutions, and the setup lists. Every change is saved at once (explicit feedback per action);
// the server validates again and is the source of truth.

type Staff = { id: string; firstName: string; lastName: string; active: boolean; kind: StaffKind; validFrom: string | null; validUntil: string | null; maxPerDay: number | null; maxPerWeek: number | null; unavailable: { weekday: number; periodId: string | null }[]; notes: string | null; source: string }
type Location = { id: string; name: string; required: boolean; staffNeeded: number; active: boolean; sortOrder: number }
type Period = { id: string; name: string; startTime: string; endTime: string; weekdays: number[]; active: boolean; sortOrder: number }
type Settings = { schoolDays: number[]; maxPerDay: number | null; maxPerWeek: number | null; allowOverride: boolean; scheduleMode?: ScheduleMode }
type Setup = { staff: Staff[]; locations: Location[]; periods: Period[]; settings: Settings; access: DutyAccessLevel }
type Week = BoardWeek
type Suggestion = { staffId: string; name: string; reasons: string[] }

const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const shortDate = (d: string) => `${Number(d.slice(8, 10))}.${Number(d.slice(5, 7))}`
const fullName = (s?: { firstName: string; lastName: string }) => s ? `${s.firstName} ${s.lastName}` : '—'

async function api<T>(path: string, method = 'GET', body?: unknown): Promise<{ ok: boolean; data?: T; error?: string; issues?: Issue[] }> {
  try {
    const r = await fetch('/api/duty/' + path, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' })
    const j = await r.json().catch(() => ({}))
    return r.ok ? { ok: true, data: j.data } : { ok: false, error: j.error ?? 'הפעולה נכשלה', issues: j.issues }
  } catch { return { ok: false, error: 'אין חיבור לשרת' } }
}

const TABS = [['week', 'לוח שבועי'], ['template', 'תבנית קבועה'], ['absences', 'היעדרויות והחלפות'], ['staff', 'צוות'], ['locations', 'מקומות'], ['periods', 'הפסקות'], ['settings', 'הגדרות']] as const

export default function DutyRosterAdmin({ access, isSchoolAdmin }: { access: DutyAccessLevel; isSchoolAdmin: boolean }) {
  const canEdit = access === 'EDIT' || access === 'PUBLISH'
  const canPublish = access === 'PUBLISH'
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('week')
  const [setup, setSetup] = useState<Setup | null>(null)
  const [weekStart, setWeekStart] = useState(() => weekStartOf(todayLocal()))
  const [week, setWeek] = useState<Week | null>(null)
  const [stale, setStale] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  // Weeks already seen are shown at once (marked "מתעדכן…") while they reload; only the latest
  // request may update the board, so fast week switching never shows another week's data.
  const cache = useRef(new Map<string, Week>())
  const seq = useRef(0)
  const shown = useRef(weekStart)
  shown.current = weekStart

  const loadSetup = useCallback(async () => { const r = await api<Setup>('setup'); if (r.ok) setSetup(r.data!); else toast.error(r.error!) }, [])
  const fetchWeek = useCallback(async (ws: string) => {
    const my = ++seq.current
    const r = await api<Week>('week?start=' + ws)
    if (r.ok) cache.current.set(ws, r.data!)
    if (my !== seq.current || ws !== shown.current) return
    if (r.ok) setWeek(r.data!); else toast.error(r.error!)
    setStale(false)
    // Prefetch the next week (usually the next one looked at).
    const next = addDays(ws, 7)
    if (r.ok && !cache.current.has(next)) void api<Week>('week?start=' + next).then(n => { if (n.ok && !cache.current.has(next)) cache.current.set(next, n.data!) })
  }, [])
  /** After a change: other weeks may change too (templates), so the cache is cleared. */
  const loadWeek = useCallback(async () => { cache.current.clear(); await fetchWeek(shown.current) }, [fetchWeek])
  useEffect(() => { void loadSetup() }, [loadSetup])
  useEffect(() => {
    const cached = cache.current.get(weekStart)
    setWeek(cached ?? null); setStale(!!cached)
    void fetchWeek(weekStart)
  }, [weekStart, fetchWeek])
  useEffect(() => { if (saveState !== 'saved') return; const t = setTimeout(() => setSaveState('idle'), 2500); return () => clearTimeout(t) }, [saveState])

  const staffById = useMemo(() => new Map((setup?.staff ?? []).map(s => [s.id, s])), [setup])
  const reload = useCallback(async () => { await Promise.all([loadSetup(), loadWeek()]) }, [loadSetup, loadWeek])

  if (!setup) return <Card className="p-6 text-sm text-ui-muted">טוען…</Card>
  return (
    <div className="grid gap-4" dir="rtl">
      <div role="tablist" aria-label="תורנויות" className="flex flex-wrap gap-1 rounded-ui bg-ui-subtle p-1">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={cn('ui-focus rounded-ui-sm px-3 py-1.5 text-[13px]', tab === id ? 'bg-ui-surface font-semibold text-ui-ink shadow-ui' : 'text-ui-muted hover:text-ui-ink')}>{label}</button>
        ))}
      </div>
      {tab === 'week' && <DutyWeekBoard setup={setup} week={week} stale={stale} weekStart={weekStart} setWeekStart={setWeekStart} canEdit={canEdit} canPublish={canPublish} api={api} reloadWeek={loadWeek} reloadSetup={loadSetup} saveState={saveState} setSaveState={setSaveState} />}
      {tab === 'template' && <DutyTemplateEditor setup={setup} api={api} canEdit={canEdit} currentWeekStart={weekStart} onChanged={() => { void loadWeek() }} reloadSetup={loadSetup} />}
      {tab === 'absences' && <Absences setup={setup} week={week} weekStart={weekStart} setWeekStart={setWeekStart} staffById={staffById} canEdit={canEdit} reload={loadWeek} />}
      {tab === 'staff' && <StaffList setup={setup} canEdit={canEdit} reload={reload} />}
      {tab === 'locations' && <LocationList setup={setup} canEdit={canEdit} reload={reload} />}
      {tab === 'periods' && <PeriodList setup={setup} canEdit={canEdit} reload={reload} />}
      {tab === 'settings' && <><SettingsPanel setup={setup} canPublish={canPublish} isSchoolAdmin={isSchoolAdmin} reload={reload} /><CalendarPanel canEdit={canEdit} /></>}
    </div>
  )
}

// ── Weekly board ────────────────────────────────────────────────────────────────

function WeekNav({ weekStart, setWeekStart }: { weekStart: string; setWeekStart: (w: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="ghost" aria-label="השבוע הקודם" onClick={() => setWeekStart(addDays(weekStart, -7))} icon={<ChevronRight className="h-4 w-4" aria-hidden="true" />} />
      <span className="min-w-[9rem] text-center text-sm font-semibold tabular-nums">{shortDate(weekStart)}–{shortDate(addDays(weekStart, 6))}</span>
      <Button size="sm" variant="ghost" aria-label="השבוע הבא" onClick={() => setWeekStart(addDays(weekStart, 7))} icon={<ChevronLeft className="h-4 w-4" aria-hidden="true" />} />
      <Button size="sm" variant="ghost" onClick={() => setWeekStart(weekStartOf(todayLocal()))}>השבוע</Button>
    </div>
  )
}

// ── Absences and substitutions ──────────────────────────────────────────────────

function Absences({ setup, week, weekStart, setWeekStart, staffById, canEdit, reload }: {
  setup: Setup; week: Week | null; weekStart: string; setWeekStart: (w: string) => void; staffById: Map<string, Staff>; canEdit: boolean; reload: () => Promise<void>
}) {
  const [form, setForm] = useState({ staffId: '', date: todayLocal(), periodId: '', reason: '' })
  const [suggest, setSuggest] = useState<{ assignmentId: string; list: Suggestion[] } | null>(null)
  const periodName = (id: string | null) => id ? setup.periods.find(p => p.id === id)?.name ?? '' : 'כל היום'
  const save = async () => {
    const r = await api('absence', 'POST', { staffId: form.staffId, date: form.date, periodId: form.periodId || null, reason: form.reason || null })
    if (!r.ok) { toast.error(r.error!); return }
    toast.success('ההיעדרות נשמרה'); setForm(f => ({ ...f, staffId: '', reason: '' }))
    if (weekStartOf(form.date) !== weekStart) setWeekStart(weekStartOf(form.date)); else await reload()
  }
  const findSubs = async (a: Week['assignments'][number]) => {
    const r = await api<Suggestion[]>(`suggest?start=${weekStart}&date=${a.date}&periodId=${a.periodId}&locationId=${a.locationId}&exclude=${a.staffId}`)
    if (r.ok) setSuggest({ assignmentId: a.id, list: r.data! }); else toast.error(r.error!)
  }
  const approve = async (assignmentId: string, substituteStaffId: string) => {
    const r = await api('substitution', 'POST', { assignmentId, substituteStaffId })
    if (!r.ok) { toast.error(r.error!); return }
    toast.success('המחליף/ה אושר/ה'); setSuggest(null); await reload()
  }
  const impacted = (week?.impacted ?? []).map(i => ({ ...i, a: week!.assignments.find(a => a.id === i.assignmentId)! })).filter(i => i.a)
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="היעדרות חדשה" description="תורנויות של איש הצוות באותו זמן יסומנו כדורשות מחליף." />
        <CardBody className="grid gap-3">
          <Field label="איש צוות" htmlFor="abs-staff"><Select id="abs-staff" value={form.staffId} disabled={!canEdit} onChange={e => setForm({ ...form, staffId: e.target.value })}><option value="">בחירה…</option>{setup.staff.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{fullName(s)}</option>)}</Select></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="תאריך" htmlFor="abs-date"><Input id="abs-date" type="date" value={form.date} disabled={!canEdit} onChange={e => setForm({ ...form, date: e.target.value })} /></Field>
            <Field label="מתי" htmlFor="abs-period"><Select id="abs-period" value={form.periodId} disabled={!canEdit} onChange={e => setForm({ ...form, periodId: e.target.value })}><option value="">כל היום</option>{setup.periods.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          </div>
          <Field label="סיבה (לא חובה)" htmlFor="abs-reason"><Input id="abs-reason" value={form.reason} maxLength={200} disabled={!canEdit} onChange={e => setForm({ ...form, reason: e.target.value })} /></Field>
          {canEdit && <Button variant="primary" onClick={save} disabled={!form.staffId || !form.date} icon={<Plus className="h-4 w-4" aria-hidden="true" />}>שמירת היעדרות</Button>}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="תורנויות שדורשות מחליף" actions={<WeekNav weekStart={weekStart} setWeekStart={setWeekStart} />} />
        <CardBody className="grid gap-2">
          {!impacted.length && <p className="text-sm text-ui-muted">אין תורנויות שנפגעו מהיעדרויות בשבוע הזה.</p>}
          {impacted.map(({ a, substituteStaffId }) => (
            <div key={a.id} className="rounded-ui-sm border border-ui-border p-2.5 text-[13px]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span><b>{fullName(staffById.get(a.staffId))}</b> · {DAYS[weekdayOf(a.date)]} {shortDate(a.date)} · {periodName(a.periodId)} · {setup.locations.find(l => l.id === a.locationId)?.name}</span>
                {substituteStaffId ? <Badge tone="success">מחליף/ה: {fullName(staffById.get(substituteStaffId))}</Badge> : <Badge tone="danger">{NO_SUBSTITUTE_LABEL}</Badge>}
              </div>
              {canEdit && <Button size="sm" variant="ghost" className="mt-1" onClick={() => findSubs(a)} icon={<Sparkles className="h-4 w-4" aria-hidden="true" />}>{substituteStaffId ? 'החלפת מחליף/ה' : 'הצעת מחליף/ה'}</Button>}
              {suggest?.assignmentId === a.id && (
                <div className="mt-1 grid gap-1">
                  {!suggest.list.length && <p className="text-ui-muted">אין מחליף/ה פנוי/ה שמתאים/ה לכללים</p>}
                  {suggest.list.map(s => (
                    <div key={s.staffId} className="flex items-center justify-between gap-2 rounded bg-ui-subtle px-2 py-1">
                      <span><b>{s.name}</b> <span className="text-[11px] text-ui-muted">{s.reasons.join(' · ')}</span></span>
                      <Button size="sm" onClick={() => approve(a.id, s.staffId)}>אישור</Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {!!week?.absences.length && (
            <div className="mt-2 border-t border-ui-border pt-2">
              <p className="mb-1 text-xs font-semibold text-ui-ink-2">היעדרויות השבוע</p>
              {week.absences.map(a => (
                <div key={a.id} className="flex items-center justify-between py-0.5 text-[13px]">
                  <span>{fullName(staffById.get(a.staffId))} · {DAYS[weekdayOf(a.date)]} {shortDate(a.date)} · {periodName(a.periodId)}{a.reason ? ` · ${a.reason}` : ''}</span>
                  {canEdit && <button type="button" aria-label="מחיקת ההיעדרות" onClick={async () => { const r = await api('absence?id=' + a.id, 'DELETE'); if (!r.ok) toast.error(r.error!); await reload() }} className="ui-focus rounded p-1 text-ui-muted hover:text-ui-danger"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>}
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  )
}

// ── Setup lists ─────────────────────────────────────────────────────────────────

const intOrNull = (v: string) => v.trim() === '' ? null : Math.max(0, Math.min(50, Math.round(Number(v)) || 0))

async function removeRecord(kind: string, id: string, reload: () => Promise<void>) {
  if (!(await confirmDialog({ title: 'להסיר?', body: 'רשומה שכבר שובצה בלוח תסומן כלא פעילה (ההיסטוריה נשמרת). אחרת היא תימחק.', confirmLabel: 'הסרה' }))) return
  const r = await api<{ deactivated: boolean }>(`${kind}?id=${id}`, 'DELETE')
  if (!r.ok) toast.error(r.error!); else toast.success(r.data?.deactivated ? 'סומן כלא פעיל' : 'נמחק')
  await reload()
}
async function patch(kind: string, body: Record<string, unknown>, reload: () => Promise<void>) {
  const r = await api(kind, 'PATCH', body); if (!r.ok) toast.error(r.error!); await reload()
}

const fmtDate = (d: string | null) => d ? d.split('-').reverse().join('.') : ''

function StaffList({ setup, canEdit, reload }: { setup: Setup; canEdit: boolean; reload: () => Promise<void> }) {
  const empty = { name: '', kind: 'REGULAR' as StaffKind, maxPerDay: '', maxPerWeek: '', validFrom: '', validUntil: '', notes: '' }
  const [f, setF] = useState(empty)
  const [dups, setDups] = useState<{ id: string; name: string; kind: StaffKind; active: boolean }[] | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [filter, setFilter] = useState<'active' | 'archived'>('active')
  const add = async (confirmDuplicate = false) => {
    const temp = f.kind === 'TEMPORARY'
    const r = await fetch('/api/duty/staff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      firstName: f.name.trim(), lastName: '', kind: f.kind, notes: f.notes.trim() || null, maxPerDay: intOrNull(f.maxPerDay), maxPerWeek: intOrNull(f.maxPerWeek),
      validFrom: temp && f.validFrom ? f.validFrom : null, validUntil: temp && f.validUntil ? f.validUntil : null, confirmDuplicate }) }).catch(() => null)
    const j = await r?.json().catch(() => ({}))
    if (r?.status === 409 && j?.duplicates) { setDups(j.duplicates); return }
    if (!r?.ok) { toast.error(j?.error ?? 'השמירה נכשלה'); return }
    toast.success('נוסף/ה לצוות'); setF(empty); setDups(null); await reload()
  }
  const shown = setup.staff.filter(s => filter === 'active' ? s.active : !s.active)
  return (
    <Card>
      <CardHeader title="צוות" description="כל מי שאפשר לשבץ. ״נוסף/ה ידנית״ ו״זמני/ת״ קיימים רק בלוח התורנויות של בית הספר. מגבלה אישית גוברת על מגבלת בית הספר." />
      <CardBody className="grid gap-3">
        {canEdit && (
          <form className="grid gap-2 rounded-ui-sm bg-ui-subtle p-3" onSubmit={e => { e.preventDefault(); if (f.name.trim()) void add() }}>
            <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-5">
              <Field label="שם מלא" htmlFor="st-n" className="col-span-2"><Input id="st-n" value={f.name} onChange={e => { setF({ ...f, name: e.target.value }); setDups(null) }} required maxLength={60} /></Field>
              <Field label="סוג" htmlFor="st-k"><Select id="st-k" value={f.kind} onChange={e => setF({ ...f, kind: e.target.value as StaffKind })}>{(Object.keys(KIND_LABEL) as StaffKind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</Select></Field>
              <Field label="מקס׳ ביום" htmlFor="st-d"><Input id="st-d" type="number" min={0} max={50} value={f.maxPerDay} onChange={e => setF({ ...f, maxPerDay: e.target.value })} /></Field>
              <Field label="מקס׳ בשבוע" htmlFor="st-w"><Input id="st-w" type="number" min={0} max={50} value={f.maxPerWeek} onChange={e => setF({ ...f, maxPerWeek: e.target.value })} /></Field>
            </div>
            {f.kind === 'TEMPORARY' && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Field label="מתאריך (לא חובה)" htmlFor="st-from"><Input id="st-from" type="date" value={f.validFrom} onChange={e => setF({ ...f, validFrom: e.target.value })} /></Field>
                <Field label="עד תאריך (לא חובה)" htmlFor="st-until"><Input id="st-until" type="date" value={f.validUntil} onChange={e => setF({ ...f, validUntil: e.target.value })} /></Field>
              </div>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <Field label="הערה (לא חובה)" htmlFor="st-notes" className="min-w-[200px] flex-1"><Input id="st-notes" value={f.notes} maxLength={300} onChange={e => setF({ ...f, notes: e.target.value })} /></Field>
              <Button type="submit" variant="primary" icon={<Plus className="h-4 w-4" aria-hidden="true" />}>הוספה</Button>
            </div>
            {dups && (
              <div role="alert" className="grid gap-1 rounded-ui-sm border border-amber-300 bg-amber-50 p-2 text-[13px] text-amber-900">
                <p className="font-semibold">כבר יש איש צוות בשם הזה:</p>
                {dups.map(d => <p key={d.id}>{d.name} · {KIND_LABEL[d.kind]}{d.active ? '' : ' · בארכיון'}</p>)}
                <div className="flex gap-2"><Button size="sm" onClick={() => add(true)}>זה אדם אחר – להוסיף</Button><Button size="sm" variant="ghost" onClick={() => setDups(null)}>ביטול</Button></div>
              </div>
            )}
          </form>
        )}
        <div className="flex gap-1 text-[13px]" role="tablist" aria-label="סינון צוות">
          {(['active', 'archived'] as const).map(k => (
            <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={cn('ui-focus rounded-ui-sm px-2 py-1', filter === k ? 'bg-ui-primary-soft font-semibold text-ui-primary-ink' : 'text-ui-muted')}>
              {k === 'active' ? `פעילים (${setup.staff.filter(s => s.active).length})` : `ארכיון (${setup.staff.filter(s => !s.active).length})`}
            </button>
          ))}
        </div>
        <ul className="divide-y divide-ui-border">
          {!shown.length && <li className="py-3 text-sm text-ui-muted">{filter === 'active' ? 'עדיין אין אנשי צוות.' : 'הארכיון ריק.'}</li>}
          {shown.map(s => editing === s.id ? <StaffEditor key={s.id} staff={s} onDone={async () => { setEditing(null); await reload() }} /> : (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[13px]">
              <span className="min-w-0">
                <span className="font-semibold">{fullName(s)}</span>
                {s.kind !== 'REGULAR' && <Badge tone={s.kind === 'TEMPORARY' ? 'warning' : 'primary'} className="ms-2">{KIND_LABEL[s.kind]}</Badge>}
                {s.source === 'SMARTSCHOOL' && <Badge className="ms-2">SmartSchool</Badge>}
                {(s.validFrom || s.validUntil) && <span className="ms-2 text-ui-muted">{s.validFrom ? `מ-${fmtDate(s.validFrom)} ` : ''}{s.validUntil ? `עד ${fmtDate(s.validUntil)}` : ''}</span>}
                {s.notes && <span className="ms-2 text-ui-muted">· {s.notes}</span>}
              </span>
              <span className="flex flex-wrap items-center gap-1 text-ui-muted">
                <span className="me-1">ביום: {s.maxPerDay ?? '—'} · בשבוע: {s.maxPerWeek ?? '—'}{s.unavailable.length ? ` · ${s.unavailable.length} זמנים לא זמינים` : ''}</span>
                {canEdit && s.active && <UnavailableEditor staff={s} periods={setup.periods} reload={reload} />}
                {canEdit && <Button size="sm" variant="ghost" onClick={() => setEditing(s.id)} icon={<Pencil className="h-3.5 w-3.5" aria-hidden="true" />}>עריכה</Button>}
                {canEdit && <Button size="sm" variant="ghost" onClick={() => patch('staff', { id: s.id, active: !s.active }, reload)} icon={<Archive className="h-3.5 w-3.5" aria-hidden="true" />}>{s.active ? 'העברה לארכיון' : 'החזרה מהארכיון'}</Button>}
                {canEdit && <button type="button" aria-label={`מחיקת ${fullName(s)}`} title="מחיקה (מי שכבר שובץ יועבר לארכיון)" onClick={() => removeRecord('staff', s.id, reload)} className="ui-focus rounded p-1 hover:text-ui-danger"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>}
              </span>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  )
}

/** Inline edit of one staff member (name, kind, dates, limits, notes). */
function StaffEditor({ staff, onDone }: { staff: Staff; onDone: () => Promise<void> }) {
  const [f, setF] = useState({ name: fullName(staff), kind: staff.kind, validFrom: staff.validFrom ?? '', validUntil: staff.validUntil ?? '', maxPerDay: staff.maxPerDay?.toString() ?? '', maxPerWeek: staff.maxPerWeek?.toString() ?? '', notes: staff.notes ?? '' })
  const save = async () => {
    const r = await api('staff', 'PATCH', { id: staff.id, firstName: f.name.trim(), lastName: '', kind: f.kind, notes: f.notes.trim() || null,
      validFrom: f.validFrom || null, validUntil: f.validUntil || null, maxPerDay: intOrNull(f.maxPerDay), maxPerWeek: intOrNull(f.maxPerWeek) })
    if (!r.ok) { toast.error(r.error!); return }
    toast.success('נשמר'); await onDone()
  }
  return (
    <li className="grid gap-2 rounded-ui-sm bg-ui-subtle p-2 text-[13px]">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label="שם מלא" htmlFor={`ed-n-${staff.id}`} className="col-span-2"><Input id={`ed-n-${staff.id}`} value={f.name} maxLength={60} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="סוג" htmlFor={`ed-k-${staff.id}`}><Select id={`ed-k-${staff.id}`} value={f.kind} onChange={e => setF({ ...f, kind: e.target.value as StaffKind })}>{(Object.keys(KIND_LABEL) as StaffKind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</Select></Field>
        <Field label="הערה" htmlFor={`ed-o-${staff.id}`}><Input id={`ed-o-${staff.id}`} value={f.notes} maxLength={300} onChange={e => setF({ ...f, notes: e.target.value })} /></Field>
        <Field label="מתאריך" htmlFor={`ed-f-${staff.id}`}><Input id={`ed-f-${staff.id}`} type="date" value={f.validFrom} onChange={e => setF({ ...f, validFrom: e.target.value })} /></Field>
        <Field label="עד תאריך" htmlFor={`ed-u-${staff.id}`}><Input id={`ed-u-${staff.id}`} type="date" value={f.validUntil} onChange={e => setF({ ...f, validUntil: e.target.value })} /></Field>
        <Field label="מקס׳ ביום" htmlFor={`ed-d-${staff.id}`}><Input id={`ed-d-${staff.id}`} type="number" min={0} max={50} value={f.maxPerDay} onChange={e => setF({ ...f, maxPerDay: e.target.value })} /></Field>
        <Field label="מקס׳ בשבוע" htmlFor={`ed-w-${staff.id}`}><Input id={`ed-w-${staff.id}`} type="number" min={0} max={50} value={f.maxPerWeek} onChange={e => setF({ ...f, maxPerWeek: e.target.value })} /></Field>
      </div>
      <div className="flex gap-2"><Button size="sm" variant="primary" disabled={!f.name.trim()} onClick={save}>שמירה</Button><Button size="sm" variant="ghost" onClick={() => void onDone()}>ביטול</Button></div>
      <p className="text-[11px] text-ui-muted">שינוי השם לא משנה לוחות שכבר פורסמו (הם שומרים את השם שהיה). שיבוצים קיימים מחוץ לתאריכים נשמרים; שיבוצים חדשים מחוץ להם נחסמים.</p>
    </li>
  )
}

/** Unavailable times of one staff member: a whole weekday, or one period on a weekday. */
function UnavailableEditor({ staff, periods, reload }: { staff: Staff; periods: Period[]; reload: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [day, setDay] = useState('0'), [period, setPeriod] = useState('')
  const save = (list: Staff['unavailable']) => patch('staff', { id: staff.id, unavailable: list }, reload)
  if (!open) return <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>זמינות</Button>
  return (
    <span className="flex flex-wrap items-center gap-1 rounded-ui-sm bg-ui-subtle p-1">
      {staff.unavailable.map((u, i) => (
        <Badge key={i}>{DAYS[u.weekday]}{u.periodId ? ` · ${periods.find(p => p.id === u.periodId)?.name ?? ''}` : ''}
          <button type="button" aria-label="הסרה" className="ms-1" onClick={() => save(staff.unavailable.filter((_, j) => j !== i))}>×</button></Badge>
      ))}
      <select aria-label="יום" value={day} onChange={e => setDay(e.target.value)} className="h-7 rounded border border-ui-border text-[12px]">{DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}</select>
      <select aria-label="הפסקה" value={period} onChange={e => setPeriod(e.target.value)} className="h-7 rounded border border-ui-border text-[12px]"><option value="">כל היום</option>{periods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <Button size="sm" onClick={() => save([...staff.unavailable, { weekday: Number(day), periodId: period || null }])}>הוספה</Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>סגירה</Button>
    </span>
  )
}

function LocationList({ setup, canEdit, reload }: { setup: Setup; canEdit: boolean; reload: () => Promise<void> }) {
  const [f, setF] = useState({ name: '', staffNeeded: '1', required: true })
  const add = async () => {
    const r = await api('location', 'POST', { name: f.name, staffNeeded: Math.max(1, Number(f.staffNeeded) || 1), required: f.required, sortOrder: setup.locations.length })
    if (!r.ok) { toast.error(r.error!); return }
    setF({ name: '', staffNeeded: '1', required: true }); await reload()
  }
  return (
    <Card>
      <CardHeader title="מקומות ואזורים" description="מקום חובה שלא שובץ יופיע כ״לא שובץ״ בלוח ובמסך." />
      <CardBody className="grid gap-3">
        {canEdit && (
          <form className="grid grid-cols-2 items-end gap-2 sm:grid-cols-4" onSubmit={e => { e.preventDefault(); void add() }}>
            <Field label="שם המקום" htmlFor="lo-n"><Input id="lo-n" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required maxLength={80} /></Field>
            <Field label="אנשי צוות נדרשים" htmlFor="lo-c"><Input id="lo-c" type="number" min={1} max={10} value={f.staffNeeded} onChange={e => setF({ ...f, staffNeeded: e.target.value })} /></Field>
            <Checkbox label="חובה לשבץ" checked={f.required} onChange={e => setF({ ...f, required: e.target.checked })} />
            <Button type="submit" variant="primary" icon={<Plus className="h-4 w-4" aria-hidden="true" />}>הוספה</Button>
          </form>
        )}
        <ul className="divide-y divide-ui-border">
          {!setup.locations.length && <li className="py-3 text-sm text-ui-muted">עדיין אין מקומות.</li>}
          {setup.locations.map(l => (
            <li key={l.id} className={cn('flex items-center justify-between gap-2 py-2 text-[13px]', !l.active && 'opacity-60')}>
              <span className="font-semibold">{l.name}{!l.active && ' (לא פעיל)'}</span>
              <span className="flex items-center gap-2 text-ui-muted">
                {l.staffNeeded} נדרשים · {l.required ? 'חובה' : 'רשות'}
                {canEdit && <Button size="sm" variant="ghost" onClick={() => patch('location', { id: l.id, active: !l.active }, reload)}>{l.active ? 'השבתה' : 'הפעלה'}</Button>}
                {canEdit && <button type="button" aria-label={`הסרת ${l.name}`} onClick={() => removeRecord('location', l.id, reload)} className="ui-focus rounded p-1 hover:text-ui-danger"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>}
              </span>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  )
}

function DayPicker({ value, onChange, days = [0, 1, 2, 3, 4, 5, 6] }: { value: number[]; onChange: (v: number[]) => void; days?: number[] }) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="ימים">
      {days.map(d => (
        <button key={d} type="button" aria-pressed={value.includes(d)} onClick={() => onChange(value.includes(d) ? value.filter(x => x !== d) : [...value, d].sort())}
          className={cn('ui-focus rounded-ui-sm border px-2 py-1 text-[12px]', value.includes(d) ? 'border-ui-primary bg-ui-primary-soft font-semibold text-ui-primary-ink' : 'border-ui-border text-ui-muted')}>{DAYS[d]}</button>
      ))}
    </div>
  )
}

function PeriodList({ setup, canEdit, reload }: { setup: Setup; canEdit: boolean; reload: () => Promise<void> }) {
  const [f, setF] = useState({ name: '', startTime: '10:00', endTime: '10:20', weekdays: setup.settings.schoolDays })
  const add = async () => {
    const r = await api('period', 'POST', { ...f, sortOrder: setup.periods.length })
    if (!r.ok) { toast.error(r.error!); return }
    setF({ ...f, name: '' }); await reload()
  }
  return (
    <Card>
      <CardHeader title="הפסקות ושעות תורנות" description="לכל הפסקה: שעות לפי שעון בית הספר, וימים שבהם היא מתקיימת." />
      <CardBody className="grid gap-3">
        {canEdit && (
          <form className="grid gap-2" onSubmit={e => { e.preventDefault(); void add() }}>
            <div className="grid grid-cols-3 items-end gap-2">
              <Field label="שם" htmlFor="pe-n"><Input id="pe-n" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required maxLength={80} placeholder="הפסקה ראשונה" /></Field>
              <Field label="מ־" htmlFor="pe-s"><Input id="pe-s" type="time" value={f.startTime} onChange={e => setF({ ...f, startTime: e.target.value })} required /></Field>
              <Field label="עד" htmlFor="pe-e"><Input id="pe-e" type="time" value={f.endTime} onChange={e => setF({ ...f, endTime: e.target.value })} required /></Field>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2"><DayPicker value={f.weekdays} onChange={weekdays => setF({ ...f, weekdays })} /><Button type="submit" variant="primary" icon={<Plus className="h-4 w-4" aria-hidden="true" />}>הוספה</Button></div>
          </form>
        )}
        <ul className="divide-y divide-ui-border">
          {!setup.periods.length && <li className="py-3 text-sm text-ui-muted">עדיין אין הפסקות.</li>}
          {setup.periods.map(p => (
            <li key={p.id} className={cn('flex flex-wrap items-center justify-between gap-2 py-2 text-[13px]', !p.active && 'opacity-60')}>
              <span><b>{p.name}</b> <span dir="ltr" className="text-ui-muted">{p.startTime}–{p.endTime}</span>{!p.active && ' (לא פעילה)'}</span>
              <span className="flex flex-wrap items-center gap-2">
                <DayPicker value={p.weekdays} onChange={weekdays => canEdit && patch('period', { id: p.id, weekdays }, reload)} />
                {canEdit && <Button size="sm" variant="ghost" onClick={() => patch('period', { id: p.id, active: !p.active }, reload)}>{p.active ? 'השבתה' : 'הפעלה'}</Button>}
                {canEdit && <button type="button" aria-label={`הסרת ${p.name}`} onClick={() => removeRecord('period', p.id, reload)} className="ui-focus rounded p-1 hover:text-ui-danger"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>}
              </span>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  )
}

// ── Settings and access ─────────────────────────────────────────────────────────

type UserAccess = { id: string; name: string; email: string; role: string; dutyAccess: DutyAccessLevel }
const ACCESS_LABEL: Record<DutyAccessLevel, string> = { NONE: 'ללא גישה', VIEW: 'צפייה', EDIT: 'עריכת טיוטה', PUBLISH: 'עריכה ופרסום' }

const MODES: { id: ScheduleMode; label: string; hint: string }[] = [
  { id: 'WEEKLY', label: 'תכנון שבועי', hint: 'כל שבוע מתוכנן בנפרד: מאפס, בהעתקת השבוע הקודם או בהעתקת תבנית שמורה.' },
  { id: 'RECURRING', label: 'תבנית קבועה', hint: 'שיבוץ קבוע חוזר בכל שבוע אוטומטית. שינויים לתאריך אחד או מתאריך מסוים והלאה.' },
  { id: 'HYBRID', label: 'משולב', hint: 'התבנית היא הבסיס, וכל שבוע אפשר לשנות בחופשיות (חד-פעמי, הוספה, ביטול, או תכנון השבוע בנפרד).' },
]

/** Calendar exceptions: holidays and no-school days (no duties), special school days (duties). */
function CalendarPanel({ canEdit }: { canEdit: boolean }) {
  const today = todayLocal()
  const [days, setDays] = useState<{ id: string; date: string; kind: 'HOLIDAY' | 'NO_SCHOOL' | 'SPECIAL'; name: string }[] | null>(null)
  const [f, setF] = useState({ date: today, kind: 'HOLIDAY' as 'HOLIDAY' | 'NO_SCHOOL' | 'SPECIAL', name: '' })
  const load = useCallback(async () => { const r = await api<NonNullable<typeof days>>(`calendar?from=${addDays(today, -30)}&to=${addDays(today, 400)}`); if (r.ok) setDays(r.data!) }, [today])
  useEffect(() => { void load() }, [load])
  const add = async () => {
    const r = await api('calendar', 'POST', f)
    if (!r.ok) { toast.error(r.error!); return }
    toast.success('נשמר'); setF({ ...f, name: '' }); await load()
  }
  const KIND = { HOLIDAY: 'חג / חופשה', NO_SCHOOL: 'אין לימודים', SPECIAL: 'יום לימודים מיוחד' }
  return (
    <Card>
      <CardHeader title="לוח שנה" description="ימים בלי תורנויות (חג, חופשה, אין לימודים) וימי לימודים מיוחדים. כל השאר לפי ימי הלימודים הרגילים." />
      <CardBody className="grid gap-3">
        {canEdit && (
          <form className="grid grid-cols-2 items-end gap-2 sm:grid-cols-4" onSubmit={e => { e.preventDefault(); if (f.name.trim()) void add() }}>
            <Field label="תאריך" htmlFor="cal-d"><Input id="cal-d" type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} required /></Field>
            <Field label="סוג" htmlFor="cal-k"><Select id="cal-k" value={f.kind} onChange={e => setF({ ...f, kind: e.target.value as typeof f.kind })}>{(Object.keys(KIND) as (keyof typeof KIND)[]).map(k => <option key={k} value={k}>{KIND[k]}</option>)}</Select></Field>
            <Field label="שם" htmlFor="cal-n"><Input id="cal-n" value={f.name} maxLength={60} placeholder="למשל: חנוכה" onChange={e => setF({ ...f, name: e.target.value })} required /></Field>
            <Button type="submit" variant="primary" icon={<Plus className="h-4 w-4" aria-hidden="true" />}>הוספה</Button>
          </form>
        )}
        {!days ? <p className="text-sm text-ui-muted">טוען…</p> : !days.length ? <p className="text-sm text-ui-muted">אין חריגים בלוח השנה.</p> : (
          <ul className="divide-y divide-ui-border text-[13px]">
            {days.map(d => (
              <li key={d.id} className="flex items-center justify-between py-1.5">
                <span><b>{fmtDate(d.date)}</b> · {d.name} <Badge tone={d.kind === 'SPECIAL' ? 'primary' : 'warning'} className="ms-1">{KIND[d.kind]}</Badge></span>
                {canEdit && <button type="button" aria-label={`מחיקת ${d.name}`} onClick={async () => { const r = await api('calendar?id=' + d.id, 'DELETE'); if (!r.ok) toast.error(r.error!); await load() }} className="ui-focus rounded p-1 text-ui-muted hover:text-ui-danger"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}

function SettingsPanel({ setup, canPublish, isSchoolAdmin, reload }: { setup: Setup; canPublish: boolean; isSchoolAdmin: boolean; reload: () => Promise<void> }) {
  const [s, setS] = useState({ ...setup.settings, scheduleMode: setup.settings.scheduleMode ?? 'WEEKLY', maxPerDay: setup.settings.maxPerDay?.toString() ?? '', maxPerWeek: setup.settings.maxPerWeek?.toString() ?? '' })
  const [users, setUsers] = useState<UserAccess[] | null>(null)
  useEffect(() => { if (isSchoolAdmin) void api<UserAccess[]>('access').then(r => { if (r.ok) setUsers(r.data!) }) }, [isSchoolAdmin])
  const save = async () => {
    const r = await api('settings', 'POST', { schoolDays: s.schoolDays, maxPerDay: intOrNull(s.maxPerDay), maxPerWeek: intOrNull(s.maxPerWeek), allowOverride: s.allowOverride, scheduleMode: s.scheduleMode })
    if (r.ok) { toast.success('ההגדרות נשמרו'); await reload() } else toast.error(r.error!)
  }
  const setAccess = async (userId: string, dutyAccess: DutyAccessLevel) => {
    const r = await api('access', 'POST', { userId, dutyAccess })
    if (!r.ok) { toast.error(r.error!); return }
    setUsers(u => u?.map(x => x.id === userId ? { ...x, dutyAccess } : x) ?? null); toast.success('ההרשאה עודכנה')
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="כללי בית הספר" description="מגבלות אופציונליות: שדה ריק = אין מגבלה." />
        <CardBody className="grid gap-3">
          <fieldset className="grid gap-1.5" disabled={!canPublish}>
            <legend className="mb-1 text-[13px] font-semibold text-ui-ink-2">איך בית הספר מתכנן תורנויות</legend>
            {MODES.map(m => (
              <label key={m.id} className={cn('flex cursor-pointer gap-2 rounded-ui-sm border p-2 text-[13px]', s.scheduleMode === m.id ? 'border-ui-primary bg-ui-primary-soft' : 'border-ui-border')}>
                <input type="radio" name="schedule-mode" checked={s.scheduleMode === m.id} onChange={() => setS({ ...s, scheduleMode: m.id })} className="mt-0.5" />
                <span><b>{m.label}</b><span className="block text-ui-muted">{m.hint}</span></span>
              </label>
            ))}
            <p className="text-[11px] text-ui-muted">אפשר לשנות בכל עת. לוחות שפורסמו לא משתנים, ושבוע שנבחר לו אופן תכנון משלו נשאר כך.</p>
          </fieldset>
          <Field label="ימי לימודים" htmlFor="set-days"><DayPicker value={s.schoolDays} onChange={schoolDays => setS({ ...s, schoolDays })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="מקסימום תורנויות ביום לאדם" htmlFor="set-d"><Input id="set-d" type="number" min={0} max={50} value={s.maxPerDay} disabled={!canPublish} onChange={e => setS({ ...s, maxPerDay: e.target.value })} /></Field>
            <Field label="מקסימום תורנויות בשבוע לאדם" htmlFor="set-w"><Input id="set-w" type="number" min={0} max={50} value={s.maxPerWeek} disabled={!canPublish} onChange={e => setS({ ...s, maxPerWeek: e.target.value })} /></Field>
          </div>
          <Checkbox label="לאפשר חריגה מהכללים עם סיבה כתובה" description="החריגה נשמרת עם הסיבה ושם המאשר/ת." checked={s.allowOverride} disabled={!canPublish} onChange={e => setS({ ...s, allowOverride: e.target.checked })} />
          {canPublish ? <Button variant="primary" onClick={save}>שמירת ההגדרות</Button> : <p className="text-xs text-ui-muted">רק בעלי הרשאת פרסום יכולים לשנות את הכללים.</p>}
        </CardBody>
      </Card>
      {isSchoolAdmin && (
        <Card>
          <CardHeader title="הרשאות ללוח התורנויות" description="נפרדות מהרשאות המסכים. מנהלי בית הספר תמיד יכולים לערוך ולפרסם." />
          <CardBody>
            {!users ? <p className="text-sm text-ui-muted">טוען…</p> : (
              <ul className="divide-y divide-ui-border">
                {users.map(u => (
                  <li key={u.id} className="flex items-center justify-between gap-2 py-2 text-[13px]">
                    <span><b>{u.name}</b> <span className="text-ui-muted">{u.email}</span></span>
                    {u.role === 'SCHOOL_ADMIN' || u.role === 'SUPER_ADMIN'
                      ? <Badge tone="primary">מנהל/ת – עריכה ופרסום</Badge>
                      : <select aria-label={`הרשאה ל${u.name}`} value={u.dutyAccess} onChange={e => setAccess(u.id, e.target.value as DutyAccessLevel)} className="ui-focus h-8 rounded-ui-sm border border-ui-border bg-ui-surface px-2 text-[13px]">
                          {(Object.keys(ACCESS_LABEL) as DutyAccessLevel[]).map(k => <option key={k} value={k}>{ACCESS_LABEL[k]}</option>)}
                        </select>}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 flex items-start gap-1 text-xs text-ui-muted"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />עורכי הודעות אינם מקבלים גישה ללוח התורנויות אוטומטית.</p>
          </CardBody>
        </Card>
      )}
    </div>
  )
}
