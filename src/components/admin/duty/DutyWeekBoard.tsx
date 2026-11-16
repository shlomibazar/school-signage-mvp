'use client'
import { memo, useCallback, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { ChevronRight, ChevronLeft, Send, Copy, X, UserX, Repeat, RotateCcw, CalendarOff, Loader2, Check, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Display'
import { confirmDialog } from '@/components/ui/ConfirmHost'
import { cn } from '@/lib/utils'
import { weekStartOf, weekDates, addDays, weekdayOf, staffName, type Issue, type StaffKind, type WeekContext, type ScheduleMode } from '@/lib/duty/rules'
import DutyStaffPicker, { createStaffRequest, type PickResult, type Slot as PickerSlot } from './DutyStaffPicker'

// The weekly board: one row per period × location, one column per school day. A duty shows where it
// comes from: the recurring template (🔁), a one-time change of it (dashed, with undo), or the week
// itself. Clicking a name replaces the person (for a recurring duty: only that date, or from that
// date on); × removes or cancels it; dragging moves it (onto a full slot: swap, after confirming).
// Changes show at once (optimistic) and are confirmed by the server; failures are shown and undone.

export type BoardStaff = { id: string; firstName: string; lastName: string; active: boolean; kind: StaffKind; validFrom: string | null; validUntil: string | null; maxPerDay: number | null; maxPerWeek: number | null; unavailable: { weekday: number; periodId: string | null }[] }
export type BoardSetup = { staff: BoardStaff[]; locations: { id: string; name: string; required: boolean; staffNeeded: number; active: boolean; sortOrder: number }[]; periods: { id: string; name: string; startTime: string; endTime: string; weekdays: number[]; active: boolean; sortOrder: number }[]; settings: WeekContext['settings'] }
export type BoardAssignment = { id: string; date: string; periodId: string; locationId: string; staffId: string; overrideReason: string | null; origin?: 'template' | 'override' | 'week'; entryId?: string | null }
export type BoardWeek = {
  weekStart: string; status: 'draft' | 'published' | 'changed'; publishedAt: string | null
  useTemplate: boolean; weekChoice: boolean | null; scheduleMode: ScheduleMode
  templates: { id: string; name: string; effectiveFrom: string; effectiveUntil: string | null }[]
  calendar: { date: string; kind: 'HOLIDAY' | 'NO_SCHOOL' | 'SPECIAL'; name: string }[]
  cancelled: { entryId: string; date: string; periodId: string; locationId: string; staffId: string }[]
  assignments: BoardAssignment[]
  gaps: { date: string; periodId: string; locationId: string; assigned: number; needed: number }[]
  absences: { id: string; staffId: string; date: string; periodId: string | null; reason: string | null; source: string }[]
  impacted: { assignmentId: string; substituteStaffId: string | null; substitutionId: string | null }[]
}
export type SaveState = 'idle' | 'saving' | 'saved' | 'error'
type Api = <T>(path: string, method?: string, body?: unknown) => Promise<{ ok: boolean; data?: T; error?: string; issues?: Issue[] }>

const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
const shortDate = (d: string) => `${Number(d.slice(8, 10))}.${Number(d.slice(5, 7))}`
const name = (s?: { firstName: string; lastName: string }) => s ? staffName(s) : '—'
const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

type Chip = BoardAssignment & { absent: boolean; pending?: boolean }
type CellOps = {
  open: (slot: PickerSlot, a?: Chip) => void
  remove: (a: Chip) => void
  revert: (entryId: string, date: string) => void
  dragStart: (id: string) => void
  drop: (slot: PickerSlot, id: string) => void
}

/** One board cell; memoized so a change in one slot does not re-render the whole board. */
const Cell = memo(function Cell({ slotKey, slot, chips, cancelled, gap, needed, canEdit, busy, isDropTarget, staffById, ops, children }: {
  slotKey: string; slot: PickerSlot; chips: Chip[]; cancelled: { entryId: string; staffId: string }[]; gap: boolean; needed: number
  canEdit: boolean; busy: boolean; isDropTarget: boolean; staffById: Map<string, BoardStaff>; ops: CellOps; children?: React.ReactNode
}) {
  return (
    <td data-slot={slotKey} className={cn('group relative px-1.5 py-1.5', gap && 'bg-red-50/60', isDropTarget && 'outline outline-2 outline-ui-primary')}
      onDragOver={canEdit ? e => { if (!e.dataTransfer.types.includes('text/plain')) return; e.preventDefault(); ops.dragStart('over:' + slotKey) } : undefined}
      onDrop={canEdit ? e => { const id = e.dataTransfer.getData('text/plain'); if (!id) return; e.preventDefault(); ops.drop(slot, id) } : undefined}>
      <div className="flex flex-col gap-1">
        {chips.map(a => {
          const person = staffById.get(a.staffId)
          const recurring = a.origin === 'template', once = a.origin === 'override'
          return (
            <span key={a.id} data-assignment={a.id} data-origin={a.origin ?? 'week'} draggable={canEdit && !busy && !a.pending}
              onDragStart={e => { e.dataTransfer.setData('text/plain', a.id); e.dataTransfer.effectAllowed = 'move'; ops.dragStart(a.id) }}
              onDragEnd={() => ops.dragStart('')}
              className={cn('group inline-flex items-center justify-between gap-1 rounded-ui-sm border px-1.5 py-0.5',
                a.absent ? 'border-amber-300 bg-amber-50' : once ? 'border-dashed border-amber-400 bg-amber-50/40' : 'border-ui-border bg-ui-surface',
                a.pending && 'animate-pulse opacity-60', canEdit && !a.pending && 'cursor-grab')}
              title={[recurring && 'שיבוץ קבוע (מהתבנית)', once && 'שינוי חד-פעמי לתאריך הזה', a.overrideReason && `חריגה מאושרת: ${a.overrideReason}`, a.absent && 'נעדר/ת – ראו ״היעדרויות והחלפות״', canEdit && 'לחיצה להחלפה, גרירה להעברה'].filter(Boolean).join('\n') || undefined}>
              <button type="button" disabled={!canEdit || busy || a.pending} onClick={() => ops.open(slot, a)} aria-label={`החלפת ${name(person)}`} className="ui-focus min-w-0 truncate rounded text-start disabled:cursor-default">
                {recurring && <Repeat className="me-1 inline h-3 w-3 text-ui-muted" aria-label="קבוע" />}
                {name(person)}
                {person && person.kind !== 'REGULAR' && <span className="ms-1 text-[10px] text-ui-muted">({person.kind === 'MANUAL' ? 'ידני' : 'זמני'})</span>}
                {person && !person.active && <span className="ms-1 text-[10px] text-ui-muted">(בארכיון)</span>}
                {once && <span className="ms-1 text-[10px] text-amber-700">חד-פעמי</span>}
                {a.overrideReason && ' *'}{a.absent && <UserX className="ms-1 inline h-3 w-3 text-amber-700" aria-label="נעדר/ת" />}
              </button>
              {canEdit && !a.pending && <span className="flex shrink-0 items-center">
                {once && a.entryId && <button type="button" aria-label="החזרה לשיבוץ הקבוע" title="ביטול השינוי החד-פעמי" disabled={busy} onClick={() => ops.revert(a.entryId!, a.date)} className="ui-focus rounded text-ui-muted hover:text-ui-primary"><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /></button>}
                <button type="button" aria-label={`${recurring ? 'ביטול בתאריך הזה של' : 'הסרת'} ${name(person)}`} disabled={busy} onClick={() => ops.remove(a)} className="ui-focus rounded text-ui-muted hover:text-ui-danger"><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
              </span>}
            </span>
          )
        })}
        {cancelled.map(c => (
          <span key={'c' + c.entryId} className="inline-flex items-center justify-between gap-1 rounded-ui-sm border border-dashed border-ui-border px-1.5 py-0.5 text-ui-muted" title="שיבוץ קבוע שבוטל בתאריך הזה">
            <span className="truncate line-through">{name(staffById.get(c.staffId))}</span>
            {canEdit && <button type="button" aria-label="החזרת השיבוץ הקבוע" disabled={busy} onClick={() => ops.revert(c.entryId, slot.date)} className="ui-focus rounded hover:text-ui-primary"><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /></button>}
          </span>
        ))}
        {canEdit && (gap
          ? <button type="button" disabled={busy} onClick={() => ops.open(slot)} className="ui-focus rounded-ui-sm border border-dashed border-red-300 px-1.5 py-0.5 text-start text-red-700 hover:bg-red-50">+ לא שובץ – שיבוץ</button>
          : <button type="button" disabled={busy} onClick={() => ops.open(slot)} aria-label="שיבוץ נוסף" className="ui-focus self-start rounded px-1 text-[12px] text-ui-muted opacity-0 hover:bg-ui-subtle focus-visible:opacity-100 group-hover:opacity-100">+ הוספה</button>)}
        {!canEdit && gap && <span className="text-red-700">לא שובץ</span>}
        {children}
      </div>
    </td>
  )
})

export default function DutyWeekBoard({ setup, week, stale, weekStart, setWeekStart, canEdit, canPublish, api, reloadWeek, reloadSetup, saveState, setSaveState }: {
  setup: BoardSetup; week: BoardWeek | null; stale: boolean; weekStart: string; setWeekStart: (w: string) => void
  canEdit: boolean; canPublish: boolean; api: Api
  reloadWeek: () => Promise<void>; reloadSetup: () => Promise<void>
  saveState: SaveState; setSaveState: (s: SaveState) => void
}) {
  const [picker, setPicker] = useState<{ slot: PickerSlot; a?: Chip } | null>(null)
  const [scope, setScope] = useState<'once' | 'future'>('once')
  const [dropKey, setDropKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Optimistic state until the server answers: added chips and hidden (removed) chips.
  const [pendingAdd, setPendingAdd] = useState<BoardAssignment[]>([])
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const dragId = useRef<string | null>(null)

  const staffById = useMemo(() => new Map(setup.staff.map(s => [s.id, s])), [setup.staff])
  const days = useMemo(() => weekDates(weekStart).filter(d => {
    const c = week?.calendar.find(x => x.date === d)
    return c ? true : setup.settings.schoolDays.includes(weekdayOf(d))
  }), [weekStart, week?.calendar, setup.settings.schoolDays])
  const periods = useMemo(() => setup.periods.filter(p => p.active), [setup.periods])
  const locations = useMemo(() => setup.locations.filter(l => l.active), [setup.locations])

  // Lookups computed once per week change (not per cell).
  const { bySlot, gapSet, cancelledBySlot } = useMemo(() => {
    const absent = new Set((week?.absences ?? []).map(a => `${a.staffId}|${a.date}|${a.periodId ?? '*'}`))
    const bySlot = new Map<string, Chip[]>()
    for (const a of [...(week?.assignments ?? []), ...pendingAdd.map(p => ({ ...p, pending: true }))]) {
      if (hidden.has(a.id)) continue
      const k = `${a.date}|${a.periodId}|${a.locationId}`
      const chip: Chip = { ...a, absent: absent.has(`${a.staffId}|${a.date}|*`) || absent.has(`${a.staffId}|${a.date}|${a.periodId}`) }
      bySlot.set(k, [...(bySlot.get(k) ?? []), chip])
    }
    const cancelledBySlot = new Map<string, { entryId: string; staffId: string }[]>()
    for (const c of week?.cancelled ?? []) { const k = `${c.date}|${c.periodId}|${c.locationId}`; cancelledBySlot.set(k, [...(cancelledBySlot.get(k) ?? []), c]) }
    return { bySlot, gapSet: new Set((week?.gaps ?? []).map(g => `${g.date}|${g.periodId}|${g.locationId}`)), cancelledBySlot }
  }, [week, pendingAdd, hidden])

  const ctx: WeekContext = useMemo(() => ({
    staff: setup.staff, periods: setup.periods, locations: setup.locations, settings: setup.settings, calendar: week?.calendar ?? [],
    assignments: (week?.assignments ?? []).map(a => ({ id: a.id, date: a.date, periodId: a.periodId, locationId: a.locationId, staffId: a.staffId, origin: a.origin, entryId: a.entryId })),
    absences: (week?.absences ?? []).map(a => ({ id: a.id, staffId: a.staffId, date: a.date, periodId: a.periodId })),
  }), [setup, week])

  /** Runs a change: saving state, server call, refresh; returns the result for the picker. */
  const run = useCallback(async (path: string, body: Record<string, unknown>, method = 'POST', undo?: () => void): Promise<PickResult> => {
    setBusy(true); setSaveState('saving')
    const r = await api<{ warnings?: Issue[]; copied?: number; skipped?: unknown[] }>(path, method, method === 'DELETE' ? undefined : body)
    if (r.ok) {
      r.data?.warnings?.forEach(w => toast(w.message, { icon: '⚠️' }))
      await reloadWeek()
      setSaveState('saved')
    } else { undo?.(); setSaveState('error') }
    setPendingAdd([]); setHidden(new Set())
    setBusy(false)
    return { ok: r.ok, error: r.error, issues: r.issues }
  }, [api, reloadWeek, setSaveState])

  // The cell handlers read the current week through a ref, so they stay the same object (cells do
  // not re-render because of them).
  const latest = useRef({ week, bySlot, locations: setup.locations, staffById, weekStart })
  latest.current = { week, bySlot, locations: setup.locations, staffById, weekStart }
  const ops: CellOps = useMemo(() => ({
    open: (slot, a) => { setScope('once'); setPicker({ slot, a }) },
    remove: async a => {
      if (a.origin === 'template') {
        // Cancelling a recurring duty on one date; the template stays (undo with ↺).
        setHidden(new Set([a.id]))
        const r = await run('assign?id=' + encodeURIComponent(a.id), {}, 'DELETE')
        if (r.ok) toast.success('בוטל בתאריך הזה בלבד. השיבוץ הקבוע נשאר.'); else toast.error(r.error ?? 'הביטול נכשל')
        return
      }
      setHidden(new Set([a.id]))
      const r = await run('assign?id=' + encodeURIComponent(a.id), {}, 'DELETE')
      if (r.ok) toast.success('השיבוץ הוסר'); else toast.error(r.error ?? 'ההסרה נכשלה')
    },
    revert: async (entryId, date) => {
      const r = await run('revert', { entryId, date })
      if (r.ok) toast.success('חזר לשיבוץ הקבוע'); else toast.error(r.error ?? 'הפעולה נכשלה')
    },
    dragStart: id => {
      if (id.startsWith('over:')) { const k = id.slice(5); setDropKey(prev => prev === k ? prev : k); return }
      dragId.current = id || null
      if (!id) setDropKey(null)
    },
    drop: async (slot, id) => {
      const { week, bySlot, locations, staffById, weekStart } = latest.current
      setDropKey(null); dragId.current = null
      const a = week?.assignments.find(x => x.id === id)
      if (!a || (a.date === slot.date && a.periodId === slot.periodId && a.locationId === slot.locationId)) return
      const k = `${slot.date}|${slot.periodId}|${slot.locationId}`
      const there = (bySlot.get(k) ?? []).filter(c => !c.pending)
      const cap = locations.find(l => l.id === slot.locationId)?.staffNeeded ?? 1
      if (there.length >= cap) {
        // A full slot: never overwrite silently — offer to swap the two people.
        const other = there[0]
        if (other.staffId === a.staffId) { toast.error('זה אותו איש צוות'); return }
        const ok = await confirmDialog({ title: 'להחליף בין השניים?', body: `המשבצת תפוסה. ${name(staffById.get(a.staffId))} ו${name(staffById.get(other.staffId))} יחליפו מקומות (שינוי לשבוע הזה בלבד).`, confirmLabel: 'החלפה' })
        if (!ok) return
        const r = await run('swap', { a: a.id, b: other.id, weekStart })
        if (r.ok) toast.success('הוחלפו'); else toast.error(r.error ?? 'ההחלפה נדחתה')
        return
      }
      setHidden(new Set([a.id])); setPendingAdd([{ ...a, id: 'pending', ...slot }])
      const r = await run('move', { id, weekStart, ...slot })
      if (r.ok) toast.success(a.origin === 'template' ? 'הועבר בתאריך הזה בלבד' : 'הועבר'); else toast.error(r.error ?? 'ההעברה נדחתה')
    },
  }), [run])

  const pick = useCallback(async (staffId: string, overrideReason?: string): Promise<PickResult> => {
    if (!picker) return { ok: false }
    const { slot, a } = picker
    if (a && (a.origin === 'template' || a.origin === 'override') && scope === 'future' && a.entryId) {
      const r = await run('change-future', { entryId: a.entryId, fromDate: slot.date, staffId, overrideReason: overrideReason ?? null })
      if (r.ok) toast.success('השיבוץ הקבוע עודכן מהתאריך הזה והלאה')
      return r
    }
    if (a) {
      setHidden(new Set([a.id])); setPendingAdd([{ ...a, id: 'pending', staffId }])
      const r = await run('move', { id: a.id, weekStart, staffId, overrideReason: overrideReason ?? null })
      if (r.ok) toast.success(a.origin === 'template' ? 'שונה בתאריך הזה בלבד' : 'הוחלף')
      return r
    }
    setPendingAdd([{ id: 'pending', ...slot, staffId, overrideReason: null, origin: 'week' }])
    const r = await run('assign', { weekStart, ...slot, staffId, overrideReason: overrideReason ?? null })
    if (r.ok) toast.success(overrideReason ? 'נשמר עם חריגה מאושרת' : 'נשמר')
    return r
  }, [picker, scope, run, weekStart])

  const removeFuture = useCallback(async () => {
    if (!picker?.a?.entryId) return
    const ok = await confirmDialog({ title: 'להסיר את השיבוץ הקבוע?', body: `החל מ-${shortDate(picker.slot.date)} השיבוץ לא יופיע יותר בתבנית. תאריכים קודמים לא משתנים.`, confirmLabel: 'הסרה מהתבנית' })
    if (!ok) return
    const r = await run('change-future', { entryId: picker.a.entryId, fromDate: picker.slot.date, staffId: null })
    if (r.ok) { toast.success('השיבוץ הוסר מהתבנית מהתאריך הזה'); setPicker(null) } else toast.error(r.error ?? 'הפעולה נכשלה')
  }, [picker, run])

  const publish = async () => {
    const gaps = week?.gaps.length ?? 0
    const ok = await confirmDialog({ title: 'לפרסם את לוח השבוע?', body: gaps ? `יש ${gaps} מקומות שלא שובצו. הם יוצגו במסכים כ"לא שובץ".` : 'המסכים יציגו את הלוח הזה.', confirmLabel: 'פרסום' })
    if (!ok) return
    const r = await run('publish', { weekStart })
    if (r.ok) toast.success('הלוח פורסם – המסכים יתעדכנו בתוך דקה'); else toast.error(r.error ?? 'הפרסום נכשל')
  }
  const copyNext = async () => {
    const to = addDays(weekStart, 7)
    setBusy(true); setSaveState('saving')
    let r = await api<{ copied: number; skipped: { date: string; staffName: string; reason: string }[] }>('copy', 'POST', { from: weekStart, to })
    if (!r.ok && r.error?.includes('כבר יש שיבוצים')) {
      if (await confirmDialog({ title: 'להחליף את השבוע הבא?', body: 'בשבוע הבא כבר יש שיבוצים. ההעתקה תחליף אותם בטיוטה של השבוע הבא, והוא יתוכנן בנפרד (לא לפי התבנית).', confirmLabel: 'החלפה' }))
        r = await api('copy', 'POST', { from: weekStart, to, replace: true })
      else { setBusy(false); setSaveState('idle'); return }
    }
    setBusy(false); setSaveState(r.ok ? 'saved' : 'error')
    if (!r.ok) { toast.error(r.error!); return }
    const skipped = r.data!.skipped
    toast.success(`הועתקו ${r.data!.copied} שיבוצים לשבוע הבא${skipped.length ? `. דולגו ${skipped.length}: ${skipped.slice(0, 3).map(s => `${s.staffName} (${s.reason})`).join('; ')}${skipped.length > 3 ? '…' : ''}` : ''}`, { duration: skipped.length ? 8000 : 4000 })
    await reloadWeek()
  }
  const setFollow = async (useTemplate: boolean) => {
    const ok = await confirmDialog(useTemplate
      ? { title: 'לחזור לתבנית הקבועה בשבוע הזה?', body: 'השיבוצים שנקבעו לשבוע הזה בלבד והשינויים החד-פעמיים שלו יימחקו מהטיוטה, והשבוע יוצג לפי התבנית. לוח שכבר פורסם לא משתנה עד הפרסום הבא.', confirmLabel: 'חזרה לתבנית' }
      : { title: 'לתכנן את השבוע הזה בנפרד?', body: 'השיבוצים הנוכחיים של השבוע יישמרו כשיבוצים של השבוע הזה בלבד. שינויים בתבנית לא ישפיעו עליו יותר.', confirmLabel: 'תכנון נפרד' })
    if (!ok) return
    const r = await run('week-template', { weekStart, useTemplate })
    if (!r.ok) toast.error(r.error ?? 'הפעולה נכשלה')
  }
  const applyTemplate = async (templateId: string) => {
    const has = (week?.assignments.length ?? 0) > 0
    if (has && !(await confirmDialog({ title: 'להעתיק את התבנית לשבוע?', body: 'השיבוצים הקיימים בשבוע הזה יוחלפו בשיבוצי התבנית (כשיבוצים של השבוע בלבד).', confirmLabel: 'העתקה' }))) return
    const r = await run('apply-template', { weekStart, templateId, replace: has })
    if (!r.ok) toast.error(r.error ?? 'ההעתקה נכשלה'); else toast.success('התבנית הועתקה לשבוע')
  }

  if (!periods.length || !locations.length) return <Card className="p-6 text-sm text-ui-muted">כדי לבנות לוח צריך להגדיר לפחות הפסקה אחת (לשונית ״הפסקות״) ומקום אחד (לשונית ״מקומות״), ולהוסיף צוות.</Card>
  const status = week?.status ?? 'draft'
  const isThisWeek = weekStart === weekStartOf(todayLocal())
  const pickerKey = picker && `${picker.slot.date}|${picker.slot.periodId}|${picker.slot.locationId}`
  const recurringPick = picker?.a && (picker.a.origin === 'template' || picker.a.origin === 'override') && !!picker.a.entryId

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ui-border px-4 py-3">
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" aria-label="השבוע הקודם" onClick={() => setWeekStart(addDays(weekStart, -7))} icon={<ChevronRight className="h-4 w-4" aria-hidden="true" />} />
          <span className="min-w-[9rem] text-center text-sm font-semibold tabular-nums" aria-live="polite">{shortDate(weekStart)}–{shortDate(addDays(weekStart, 6))}</span>
          <Button size="sm" variant="ghost" aria-label="השבוע הבא" onClick={() => setWeekStart(addDays(weekStart, 7))} icon={<ChevronLeft className="h-4 w-4" aria-hidden="true" />} />
          {isThisWeek ? <Badge tone="primary">השבוע הנוכחי</Badge> : <Button size="sm" variant="ghost" onClick={() => setWeekStart(weekStartOf(todayLocal()))}>חזרה לשבוע הנוכחי</Button>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs" aria-live="polite">
            {saveState === 'saving' || stale ? <><Loader2 className="h-3.5 w-3.5 animate-spin text-ui-muted" aria-hidden="true" /><span className="text-ui-muted">{stale ? 'מתעדכן…' : 'שומר…'}</span></>
              : saveState === 'saved' ? <><Check className="h-3.5 w-3.5 text-ui-success" aria-hidden="true" /><span className="text-ui-muted">נשמר</span></>
              : saveState === 'error' ? <><AlertCircle className="h-3.5 w-3.5 text-red-600" aria-hidden="true" /><span className="text-red-700">השמירה נכשלה – השינוי בוטל</span></> : null}
          </span>
          <Badge tone={status === 'published' ? 'success' : status === 'changed' ? 'warning' : 'neutral'} dot>
            {status === 'published' ? 'פורסם' : status === 'changed' ? 'יש שינויים שלא פורסמו' : 'טיוטה – לא פורסם'}
          </Badge>
          {!!week?.gaps.length && <Badge tone="danger">{week.gaps.length} ללא שיבוץ</Badge>}
          {canEdit && <Button size="sm" onClick={copyNext} disabled={busy || !week} icon={<Copy className="h-4 w-4" aria-hidden="true" />}>העתקה לשבוע הבא</Button>}
          {canPublish && <Button size="sm" variant="primary" onClick={publish} disabled={busy || !week || status === 'published'} icon={<Send className="h-4 w-4" aria-hidden="true" />}>{status === 'changed' ? 'פרסום השינויים' : 'פרסום'}</Button>}
        </div>
      </div>
      {week && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ui-border bg-ui-subtle/60 px-4 py-2 text-[13px]">
          {week.useTemplate ? (
            <span className="flex items-center gap-1.5"><Repeat className="h-4 w-4 text-ui-primary" aria-hidden="true" />
              {week.templates.length ? <>השבוע לפי התבנית הקבועה <b>{week.templates.map(t => t.name).join(' / ')}</b>. שינוי במשבצת חל רק על אותו תאריך, אלא אם בוחרים ״מתאריך זה והלאה״.</> : <>השבוע אמור לפעול לפי תבנית קבועה, אבל אין תבנית בתוקף בתאריכים האלה (לשונית ״תבנית קבועה״).</>}
            </span>
          ) : (
            <span>השבוע מתוכנן בנפרד{week.scheduleMode !== 'WEEKLY' ? ' (לא לפי התבנית הקבועה)' : ''}. שינויים כאן חלים רק על השבוע הזה.</span>
          )}
          {canEdit && <span className="flex flex-wrap gap-1.5">
            {week.useTemplate && week.templates.length > 0 && <Button size="sm" variant="ghost" disabled={busy} onClick={() => setFollow(false)}>תכנון השבוע בנפרד</Button>}
            {!week.useTemplate && week.scheduleMode !== 'WEEKLY' && <Button size="sm" variant="ghost" disabled={busy} onClick={() => setFollow(true)} icon={<Repeat className="h-3.5 w-3.5" aria-hidden="true" />}>חזרה לתבנית</Button>}
            {!week.useTemplate && week.templates.length > 0 && week.templates.map(t => <Button key={t.id} size="sm" variant="ghost" disabled={busy} onClick={() => applyTemplate(t.id)}>העתקת התבנית ״{t.name}״ לשבוע</Button>)}
          </span>}
        </div>
      )}
      {!week ? <div className="flex items-center gap-2 p-6 text-sm text-ui-muted" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />טוען את השבוע…</div> : (
        <div className={cn('overflow-x-auto transition-opacity', stale && 'opacity-70')}>
          <table className="w-full min-w-[760px] border-collapse text-[13px]">
            <thead>
              <tr className="bg-ui-subtle text-ui-ink-2">
                <th className="sticky right-0 z-10 bg-ui-subtle px-3 py-2 text-start font-semibold">הפסקה / מקום</th>
                {days.map(d => {
                  const c = week.calendar.find(x => x.date === d)
                  return <th key={d} className={cn('px-2 py-2 text-start font-semibold', d === todayLocal() && 'bg-ui-primary-soft')}>{DAYS[weekdayOf(d)]} <span className="font-normal text-ui-muted">{shortDate(d)}</span>
                    {c && <span className={cn('mt-0.5 flex items-center gap-1 text-[11px] font-normal', c.kind === 'SPECIAL' ? 'text-ui-primary' : 'text-amber-700')}><CalendarOff className="h-3 w-3" aria-hidden="true" />{c.name}</span>}</th>
                })}
              </tr>
            </thead>
            <tbody>
              {periods.map(p => locations.map((l, li) => (
                <tr key={p.id + l.id} className={cn('border-t border-ui-border align-top', li === 0 && 'border-t-2 border-t-ui-border-strong')}>
                  <th scope="row" className="sticky right-0 z-10 max-w-[180px] bg-ui-surface px-3 py-2 text-start font-normal">
                    {li === 0 && <div className="font-semibold text-ui-ink">{p.name} <span className="font-normal text-ui-muted" dir="ltr">{p.startTime}–{p.endTime}</span></div>}
                    <div className="text-ui-ink-2">{l.name}{l.staffNeeded > 1 ? ` (${l.staffNeeded})` : ''}{!l.required && <span className="text-ui-muted"> · רשות</span>}</div>
                  </th>
                  {days.map(d => {
                    const c = week.calendar.find(x => x.date === d)
                    const runs = c ? c.kind === 'SPECIAL' : p.weekdays.includes(weekdayOf(d))
                    if (!runs) return <td key={d} className="bg-ui-subtle/50 px-2 py-2 text-ui-faint" aria-label={c ? c.name : 'אין הפסקה ביום הזה'}>{c ? '' : '—'}</td>
                    const key = `${d}|${p.id}|${l.id}`
                    return (
                      <Cell key={d} slotKey={key} slot={{ date: d, periodId: p.id, locationId: l.id }} chips={bySlot.get(key) ?? EMPTY} cancelled={cancelledBySlot.get(key) ?? EMPTY_C}
                        gap={gapSet.has(key)} needed={l.staffNeeded} canEdit={canEdit} busy={busy} isDropTarget={dropKey === key} staffById={staffById} ops={ops}>
                        {pickerKey === key && picker && (
                          <DutyStaffPicker ctx={ctx} weekStart={weekStart} slot={picker.slot} staff={setup.staff} ignoreAssignmentId={picker.a?.id} currentStaffId={picker.a?.staffId}
                            allowOverride={setup.settings.allowOverride} canAddStaff={canEdit} onPick={pick} onClose={() => setPicker(null)}
                            title={picker.a ? `החלפת ${name(staffById.get(picker.a.staffId))}` : undefined}
                            scope={recurringPick ? { date: picker.slot.date, value: scope, onChange: setScope, onRemoveFuture: removeFuture } : undefined}
                            onCreateStaff={async input => { const r = await createStaffRequest(input); if (r.id) await reloadSetup(); return r }} />
                        )}
                      </Cell>
                    )
                  })}
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      )}
      <p className="px-4 py-2 text-xs text-ui-muted">
        <Repeat className="inline h-3 w-3" aria-hidden="true" /> = שיבוץ קבוע מהתבנית · מסגרת מקווקוות = שינוי חד-פעמי (↺ מחזיר) · * = חריגה מאושרת. לחיצה על שם מחליפה אותו, גרירה מעבירה (למשבצת תפוסה – החלפה). כל שינוי נשמר מיד בטיוטה; המסכים מציגים רק לוח שפורסם.
      </p>
    </Card>
  )
}
const EMPTY: Chip[] = []
const EMPTY_C: { entryId: string; staffId: string }[] = []
