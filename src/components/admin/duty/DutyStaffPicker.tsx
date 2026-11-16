'use client'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, UserPlus, AlertTriangle, Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { validateAssignment, blocking, FIXED_ISSUES, staffName, type WeekContext, type Issue, type StaffKind } from '@/lib/duty/rules'

// Staff picker of one roster slot: search, everyone's problem for this slot shown before choosing
// (free people first, least loaded first), override with a written reason where the school allows
// it, and "הוסף מורה ידנית" for someone who is not in the staff list (with a duplicate check).

export type PickerStaff = { id: string; firstName: string; lastName: string; active: boolean; kind: StaffKind }
export type Slot = { date: string; periodId: string; locationId: string }
export type PickResult = { ok: boolean; error?: string; issues?: Issue[] }
type Duplicate = { id: string; name: string; kind: StaffKind; active: boolean; notes: string | null }

export type CreateStaffInput = { name: string; kind: StaffKind; notes: string | null; validFrom: string | null; validUntil: string | null; confirmDuplicate: boolean }
/** Creates a manual or temporary staff member (school-only, never synced); a same-name record comes back as duplicates. */
export async function createStaffRequest(input: CreateStaffInput): Promise<{ id?: string; duplicates?: Duplicate[]; error?: string }> {
  try {
    const r = await fetch('/api/duty/staff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ firstName: input.name, lastName: '', kind: input.kind, notes: input.notes, validFrom: input.validFrom, validUntil: input.validUntil, confirmDuplicate: input.confirmDuplicate }) })
    const j = await r.json().catch(() => ({}))
    if (r.ok) return { id: j.data.id as string }
    if (r.status === 409 && j.duplicates) return { duplicates: j.duplicates }
    return { error: j.error ?? 'השמירה נכשלה' }
  } catch { return { error: 'אין חיבור לשרת' } }
}

export const KIND_LABEL: Record<StaffKind, string> = { REGULAR: 'קבוע/ה', MANUAL: 'נוסף/ה ידנית', TEMPORARY: 'זמני/ת / חיצוני/ת' }

/** For a recurring duty: change only this date, or the template from this date on. */
export type PickerScope = { date: string; value: 'once' | 'future'; onChange: (v: 'once' | 'future') => void; onRemoveFuture?: () => void }

export default function DutyStaffPicker({ ctx, weekStart, slot, staff, ignoreAssignmentId, currentStaffId, allowOverride, canAddStaff, onPick, onCreateStaff, onClose, scope, title }: {
  ctx: WeekContext; weekStart: string; slot: Slot; staff: PickerStaff[]
  /** Replacing this assignment: it is ignored in the checks. */
  ignoreAssignmentId?: string; currentStaffId?: string
  allowOverride: boolean; canAddStaff: boolean
  onPick: (staffId: string, overrideReason?: string) => Promise<PickResult>
  onCreateStaff: (input: { name: string; kind: StaffKind; notes: string | null; validFrom: string | null; validUntil: string | null; confirmDuplicate: boolean }) => Promise<{ id?: string; duplicates?: Duplicate[]; error?: string }>
  onClose: () => void
  scope?: PickerScope
  title?: string
}) {
  const [q, setQ] = useState('')
  const [pending, setPending] = useState<{ staffId: string; issues: Issue[] } | null>(null)
  const [reason, setReason] = useState('')
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const list = useRef<HTMLUListElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  // Shown above the page (portal, fixed position) next to its cell, so the board's scroll container
  // never clips it: below the cell, or above when there is no room, always inside the window.
  const marker = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  useLayoutEffect(() => {
    const place = () => {
      const cell = marker.current?.closest('td') ?? marker.current?.parentElement
      if (!cell) return
      const r = cell.getBoundingClientRect(), h = root.current?.offsetHeight ?? 360, w = Math.min(300, innerWidth * 0.85)
      const below = r.bottom + 4, above = r.top - h - 4
      const top = below + h <= innerHeight - 8 || above < 8 ? Math.min(below, Math.max(8, innerHeight - h - 8)) : above
      const right = Math.min(Math.max(8, innerWidth - r.right), innerWidth - w - 8)
      setPos(p => p && p.top === top && p.right === right ? p : { top, right })
    }
    place()
    const t = setTimeout(place, 0)
    addEventListener('scroll', place, true); addEventListener('resize', place)
    return () => { clearTimeout(t); removeEventListener('scroll', place, true); removeEventListener('resize', place) }
  })

  useEffect(() => { search.current?.focus() }, [])
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) onClose() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [onClose])

  // Everyone's problem for this slot, computed once per opening (typing only filters the list).
  const checked = useMemo(() => {
    const load = new Map<string, number>()
    for (const a of ctx.assignments) if (a.id !== ignoreAssignmentId) load.set(a.staffId, (load.get(a.staffId) ?? 0) + 1)
    return staff.filter(s => s.active && s.id !== currentStaffId)
      .map(s => {
        const errors = blocking(validateAssignment(ctx, weekStart, { ...slot, staffId: s.id }, ignoreAssignmentId))
        return { s, name: staffName(s), lower: staffName(s).toLowerCase(), errors, fixed: errors.some(e => FIXED_ISSUES.includes(e.code)), load: load.get(s.id) ?? 0 }
      })
      .sort((a, b) => Number(a.errors.length > 0) - Number(b.errors.length > 0) || a.load - b.load || a.name.localeCompare(b.name, 'he'))
  }, [staff, ctx, weekStart, slot, ignoreAssignmentId, currentStaffId])
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    return term ? checked.filter(r => r.lower.includes(term)) : checked
  }, [checked, q])
  const selectable = (r: (typeof rows)[number]) => !r.fixed && (!r.errors.length || allowOverride)
  useEffect(() => { setActive(Math.max(0, rows.findIndex(r => !r.errors.length))) }, [rows])
  useEffect(() => { list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }) }, [active])
  const moveActive = (d: 1 | -1) => {
    for (let i = active + d; i >= 0 && i < rows.length; i += d) if (selectable(rows[i])) { setActive(i); return }
  }

  const pick = async (staffId: string, overrideReason?: string) => {
    setBusy(true); setError(null)
    const r = await onPick(staffId, overrideReason)
    setBusy(false)
    if (r.ok) return onClose()
    const errors = (r.issues ?? []).filter(i => i.severity === 'error')
    if (errors.length && !errors.some(e => FIXED_ISSUES.includes(e.code)) && allowOverride && !overrideReason) setPending({ staffId, issues: errors })
    else setError(r.error ?? 'השיבוץ נדחה')
  }
  const choose = (row: (typeof rows)[number]) => {
    if (row.fixed) return
    if (row.errors.length) { if (allowOverride) { setPending({ staffId: row.s.id, issues: row.errors }); setReason('') } return }
    void pick(row.s.id)
  }

  const host = typeof document === 'undefined' ? null : document.querySelector('.admin-ui') ?? document.body
  const panel = (
    <div ref={root} role="dialog" aria-label="בחירת איש צוות" dir="rtl"
      className="fixed z-50 w-[300px] max-w-[85vw] rounded-ui-lg border border-ui-border bg-ui-surface p-2 text-[13px] shadow-xl" style={{ top: pos?.top ?? -9999, right: pos?.right ?? 0, visibility: pos ? 'visible' : 'hidden' }}>
      {title && <p className="mb-1.5 text-[12px] font-semibold text-ui-ink-2">{title}</p>}
      {scope && !adding && (
        <div className="mb-2 grid gap-1" role="radiogroup" aria-label="היקף השינוי">
          <div className="grid grid-cols-2 gap-1 rounded-ui-sm bg-ui-subtle p-0.5">
            {(['once', 'future'] as const).map(v => (
              <button key={v} type="button" role="radio" aria-checked={scope.value === v} onClick={() => scope.onChange(v)}
                className={cn('ui-focus rounded-ui-sm px-1.5 py-1 text-[12px]', scope.value === v ? 'bg-ui-surface font-semibold text-ui-ink shadow-ui' : 'text-ui-muted')}>
                {v === 'once' ? `רק ב-${scope.date.slice(8)}.${scope.date.slice(5, 7)}` : 'מתאריך זה והלאה'}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-ui-muted">{scope.value === 'once' ? 'שינוי חד-פעמי: התבנית הקבועה לא משתנה.' : 'שינוי קבוע: התבנית משתנה מהתאריך הזה. שבועות קודמים לא משתנים.'}</p>
          {scope.value === 'future' && scope.onRemoveFuture && <button type="button" onClick={scope.onRemoveFuture} className="ui-focus justify-self-start text-[12px] text-red-700 hover:underline">הסרת השיבוץ הקבוע מתאריך זה</button>}
        </div>
      )}
      {adding ? <ManualAdd onCancel={() => setAdding(false)} onCreateStaff={onCreateStaff} onCreated={id => { setAdding(false); void pick(id) }} onUseExisting={id => { setAdding(false); void pick(id) }} /> : <>
        <div className="relative">
          <Search className="pointer-events-none absolute top-2 h-4 w-4 text-ui-muted" style={{ insetInlineStart: 8 }} aria-hidden="true" />
          <input ref={search} value={q} onChange={e => setQ(e.target.value)} placeholder="חיפוש לפי שם…" aria-label="חיפוש איש צוות"
            onKeyDown={e => {
              if (e.key === 'ArrowDown') { e.preventDefault(); moveActive(1) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); moveActive(-1) }
              else if (e.key === 'Enter') { const r = rows[active] && selectable(rows[active]) ? rows[active] : rows.find(x => !x.errors.length); if (r) { e.preventDefault(); choose(r) } }
            }}
            aria-activedescendant={rows[active] ? 'pick-' + rows[active].s.id : undefined} aria-controls="duty-pick-list"
            className="ui-focus h-8 w-full rounded-ui-sm border border-ui-border bg-ui-surface ps-8 pe-2" />
        </div>
        {pending ? (
          <div className="mt-2 grid gap-2 rounded-ui-sm border border-amber-300 bg-amber-50 p-2 text-amber-900">
            <p className="font-semibold">{staffName(staff.find(s => s.id === pending.staffId)!)} – לא לפי הכללים:</p>
            <ul className="list-disc ps-4">{pending.issues.map(i => <li key={i.code}>{i.message}</li>)}</ul>
            <label className="grid gap-1">סיבה לשיבוץ בכל זאת (תישמר בהיסטוריה)
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} maxLength={300} className="ui-focus rounded-ui-sm border border-amber-300 bg-white p-1" autoFocus /></label>
            <div className="flex gap-2">
              <Button size="sm" variant="primary" disabled={!reason.trim() || busy} onClick={() => pick(pending.staffId, reason.trim())}>שיבוץ בכל זאת</Button>
              <Button size="sm" variant="ghost" onClick={() => setPending(null)}>חזרה</Button>
            </div>
          </div>
        ) : (
          <ul ref={list} id="duty-pick-list" className="mt-2 max-h-64 overflow-y-auto" role="listbox" aria-label="אנשי צוות">
            {!rows.length && <li className="px-2 py-3 text-ui-muted">לא נמצאו אנשי צוות{q ? ' בשם הזה' : ''}</li>}
            {rows.map((row, i) => (
              <li key={row.s.id} id={'pick-' + row.s.id} role="option" aria-selected={i === active} data-active={i === active} aria-disabled={row.fixed || (!!row.errors.length && !allowOverride)}>
                {i > 0 && !!row.errors.length && !rows[i - 1].errors.length && <div className="my-1 border-t border-ui-border pt-1 text-[11px] text-ui-muted">לא פנויים לפי הכללים</div>}
                <button type="button" disabled={busy || row.fixed || (!!row.errors.length && !allowOverride)} onClick={() => choose(row)}
                  onMouseEnter={() => selectable(row) && setActive(i)}
                  className={cn('ui-focus flex w-full items-start justify-between gap-2 rounded-ui-sm px-2 py-1.5 text-start', row.errors.length ? 'opacity-70 hover:bg-amber-50' : 'hover:bg-ui-primary-soft', i === active && 'bg-ui-primary-soft ring-1 ring-ui-primary-line', row.fixed && 'cursor-not-allowed opacity-50')}>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{row.name}{row.s.kind !== 'REGULAR' && <span className="ms-1 rounded bg-ui-subtle px-1 text-[10px] font-normal text-ui-muted">{row.s.kind === 'MANUAL' ? 'ידני' : 'זמני'}</span>}</span>
                    {!!row.errors.length && <span className="flex items-start gap-1 text-[11px] text-amber-800"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />{row.errors[0].message}</span>}
                  </span>
                  <span className="shrink-0 text-[11px] text-ui-muted">{row.load} השבוע</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && <p role="alert" className="mt-2 rounded-ui-sm bg-red-50 px-2 py-1 text-red-800">{error}</p>}
        {canAddStaff && !pending && (
          <button type="button" onClick={() => setAdding(true)} className="ui-focus mt-2 flex w-full items-center gap-1.5 rounded-ui-sm border border-dashed border-ui-border px-2 py-1.5 text-ui-primary hover:bg-ui-primary-soft">
            <UserPlus className="h-4 w-4" aria-hidden="true" />הוסף מורה ידנית
          </button>
        )}
      </>}
    </div>
  )
  return <><span ref={marker} hidden />{host ? createPortal(panel, host) : null}</>
}

/** Someone not in the staff list: only the name is required. A same-name record is offered first. */
function ManualAdd({ onCancel, onCreateStaff, onCreated, onUseExisting }: {
  onCancel: () => void
  onCreateStaff: Parameters<typeof DutyStaffPicker>[0]['onCreateStaff']
  onCreated: (id: string) => void; onUseExisting: (id: string) => void
}) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<StaffKind>('MANUAL')
  const [notes, setNotes] = useState('')
  const [from, setFrom] = useState(''), [until, setUntil] = useState('')
  const [dups, setDups] = useState<Duplicate[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const save = async (confirmDuplicate: boolean) => {
    setBusy(true); setError(null)
    const r = await onCreateStaff({ name: name.trim(), kind, notes: notes.trim() || null, validFrom: kind === 'TEMPORARY' && from ? from : null, validUntil: kind === 'TEMPORARY' && until ? until : null, confirmDuplicate })
    setBusy(false)
    if (r.id) onCreated(r.id)
    else if (r.duplicates) setDups(r.duplicates)
    else setError(r.error ?? 'השמירה נכשלה')
  }
  if (dups) return (
    <div className="grid gap-2">
      <p className="font-semibold">כבר יש איש צוות בשם ״{name.trim()}״</p>
      {dups.map(d => (
        <div key={d.id} className="flex items-center justify-between gap-2 rounded-ui-sm bg-ui-subtle px-2 py-1">
          <span>{d.name} <span className="text-[11px] text-ui-muted">{KIND_LABEL[d.kind]}{!d.active ? ' · בארכיון' : ''}{d.notes ? ` · ${d.notes}` : ''}</span></span>
          {d.active && <Button size="sm" onClick={() => onUseExisting(d.id)} icon={<Check className="h-3.5 w-3.5" aria-hidden="true" />}>בחירה</Button>}
        </div>
      ))}
      <div className="flex gap-2">
        <Button size="sm" variant="primary" disabled={busy} onClick={() => save(true)}>זה אדם אחר – להוסיף</Button>
        <Button size="sm" variant="ghost" onClick={() => setDups(null)}>חזרה</Button>
      </div>
    </div>
  )
  return (
    <form className="grid gap-2" onSubmit={e => { e.preventDefault(); if (name.trim()) void save(false) }}>
      <p className="font-semibold">הוספת מורה ידנית</p>
      <label className="grid gap-1">שם מלא <span className="sr-only">(חובה)</span>
        <input autoFocus required maxLength={60} value={name} onChange={e => setName(e.target.value)} className="ui-focus h-8 rounded-ui-sm border border-ui-border px-2" /></label>
      <div className="flex gap-3" role="radiogroup" aria-label="סוג">
        <label className="flex items-center gap-1"><input type="radio" checked={kind === 'MANUAL'} onChange={() => setKind('MANUAL')} />צוות שלא ברשימה</label>
        <label className="flex items-center gap-1"><input type="radio" checked={kind === 'TEMPORARY'} onChange={() => setKind('TEMPORARY')} />זמני/ת / חיצוני/ת</label>
      </div>
      {kind === 'TEMPORARY' && (
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1 text-[12px]">מתאריך (לא חובה)<input type="date" value={from} onChange={e => setFrom(e.target.value)} className="ui-focus h-8 rounded-ui-sm border border-ui-border px-1" /></label>
          <label className="grid gap-1 text-[12px]">עד תאריך (לא חובה)<input type="date" value={until} onChange={e => setUntil(e.target.value)} className="ui-focus h-8 rounded-ui-sm border border-ui-border px-1" /></label>
        </div>
      )}
      <label className="grid gap-1 text-[12px]">הערה (לא חובה)<input maxLength={300} value={notes} onChange={e => setNotes(e.target.value)} placeholder="למשל: מדריך חיצוני – רובוטיקה" className="ui-focus h-8 rounded-ui-sm border border-ui-border px-2" /></label>
      {error && <p role="alert" className="rounded-ui-sm bg-red-50 px-2 py-1 text-red-800">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" variant="primary" type="submit" disabled={!name.trim() || busy}>הוספה ושיבוץ</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>ביטול</Button>
      </div>
      <p className="text-[11px] text-ui-muted">נשמר רק בלוח התורנויות של בית הספר, ואפשר לערוך אותו בלשונית ״צוות״ (כולל זמינות).</p>
    </form>
  )
}
