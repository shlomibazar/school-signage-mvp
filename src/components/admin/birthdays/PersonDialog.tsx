'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Eye, EyeOff, Info, Loader2, Save } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { confirmDialog } from '@/components/ui/ConfirmHost'
import { type Role, type Detail, ROLE_LABEL, SOURCE_LABEL, GRADES, apiError } from './shared'

type Form = { firstName: string; lastName: string; birthDate: string; gender: '' | 'MALE' | 'FEMALE'; grade: string; parallel: string; externalId: string }
const EMPTY: Form = { firstName: '', lastName: '', birthDate: '', gender: '', grade: '', parallel: '', externalId: '' }
type Duplicate = { id: string; name: string; roles: Role[] }

// Add or edit one person (of the current tab's role). The identifier is optional, typed into a masked
// field, and never shown again: an existing one appears only as its last 3 characters ("•••123").
export default function PersonDialog({ mode, id, role, onClose, onSaved, onOpenExisting }: {
  mode: 'add' | 'edit'; id?: string; role: Role
  onClose: () => void; onSaved: () => void; onOpenExisting: (id: string) => void
}) {
  const [form, setForm] = useState<Form>(EMPTY)
  const [initial, setInitial] = useState<Form>(EMPTY)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(mode === 'edit')
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [duplicate, setDuplicate] = useState<Duplicate | null>(null)
  const [replaceId, setReplaceId] = useState(mode === 'add')
  const [removeId, setRemoveId] = useState(false)
  const [showId, setShowId] = useState(false)
  const busy = useRef(false)
  const student = role === 'STUDENT'

  useEffect(() => {
    if (mode !== 'edit' || !id) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/people/${encodeURIComponent(id)}`, { cache: 'no-store' })
        if (!res.ok) throw new Error((await apiError(res, 'טעינת הרשומה נכשלה')).message)
        const d = (await res.json()).data as Detail
        if (cancelled) return
        const r = d.roles.find(x => x.role === role)
        const f: Form = { firstName: d.firstName, lastName: d.lastName, birthDate: d.birthDate, gender: d.gender ?? '', grade: r?.grade ?? '', parallel: r?.parallel ? String(r.parallel) : '', externalId: '' }
        setDetail(d); setForm(f); setInitial(f)
      } catch (e) { if (!cancelled) setFormError(e instanceof Error ? e.message : 'טעינת הרשומה נכשלה') }
      finally { if (!cancelled) setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [mode, id, role])

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initial) || removeId, [form, initial, removeId])
  const set = (patch: Partial<Form>) => { setForm(f => ({ ...f, ...patch })); setErrors(e => { const n = { ...e }; for (const k of Object.keys(patch)) delete n[k]; return n }) }
  const classPreview = student && form.grade ? (form.parallel ? `${form.grade} ${form.parallel}` : form.grade) : ''
  const roleOfDetail = detail?.roles.find(r => r.role === role)

  async function requestClose() {
    if (saving) return
    if (dirty && !(await confirmDialog({ title: 'לסגור בלי לשמור?', body: 'השינויים בטופס יאבדו.', confirmLabel: 'סגירה בלי שמירה', cancelLabel: 'המשך עריכה' }))) return
    onClose()
  }

  async function save() {
    if (busy.current) return
    setFormError(null); setDuplicate(null)
    const local: Record<string, string> = {}
    if (!form.firstName.trim()) local.firstName = 'יש להזין שם פרטי'
    if (!form.lastName.trim()) local.lastName = 'יש להזין שם משפחה'
    if (!form.birthDate) local.birthDate = 'יש להזין תאריך לידה'
    if (Object.keys(local).length) { setErrors(local); return }
    busy.current = true; setSaving(true)
    const roleFields = student ? { grade: form.grade || null, parallel: form.parallel ? Number(form.parallel) : null } : {}
    const body = mode === 'add'
      ? { firstName: form.firstName, lastName: form.lastName, birthDate: form.birthDate, gender: form.gender || null, role, externalId: form.externalId.trim() || null, ...roleFields }
      : {
          firstName: form.firstName, lastName: form.lastName, birthDate: form.birthDate, gender: form.gender || null,
          ...(removeId ? { externalId: null } : form.externalId.trim() ? { externalId: form.externalId } : {}),
          role: { role, ...roleFields, active: roleOfDetail?.active ?? true },
        }
    try {
      const res = await fetch(mode === 'add' ? '/api/people' : `/api/people/${encodeURIComponent(id!)}`, {
        method: mode === 'add' ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!res.ok) {
        const { message, body: b } = await apiError(res, 'השמירה נכשלה. נסו שוב.')
        if (b.fieldErrors && typeof b.fieldErrors === 'object') setErrors(b.fieldErrors as Record<string, string>)
        if (b.code === 'DUPLICATE_IDENTITY' && b.existing) setDuplicate(b.existing as Duplicate)
        setFormError(message)
        return
      }
      toast.success(mode === 'add' ? 'הרשומה נוספה' : 'השינויים נשמרו')
      onSaved()
    } catch { setFormError('השמירה נכשלה. בדקו את החיבור ונסו שוב.') }
    finally { busy.current = false; setSaving(false) }
  }

  /** Adds this tab's role to the person who already has the identifier (instead of a duplicate). */
  async function addRoleToExisting() {
    if (!duplicate || busy.current) return
    busy.current = true; setSaving(true)
    try {
      const res = await fetch(`/api/people/${encodeURIComponent(duplicate.id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: { role, ...(student ? { grade: form.grade || null, parallel: form.parallel ? Number(form.parallel) : null } : {}), active: true } }),
      })
      if (!res.ok) { setFormError((await apiError(res, 'הוספת התפקיד נכשלה')).message); return }
      toast.success(`נוסף תפקיד ${ROLE_LABEL[role]} לרשומה הקיימת`)
      onSaved()
    } finally { busy.current = false; setSaving(false) }
  }

  const title = mode === 'add' ? `הוספת ${student ? 'תלמיד' : 'מורה'}` : 'עריכת רשומה'
  return (
    <Modal open title={title} onClose={() => void requestClose()} size="md"
      description={mode === 'edit' && detail ? `${detail.firstName} ${detail.lastName}` : undefined}>
      {loading ? (
        <div className="flex items-center justify-center gap-2 p-8 text-sm text-ui-muted"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />טוען…</div>
      ) : (
        <form className="grid gap-4" onSubmit={e => { e.preventDefault(); void save() }} noValidate>
          {detail && detail.dataSource !== 'MANUAL' && (
            <p className="flex gap-2 rounded-ui-sm border border-ui-border bg-ui-subtle px-3 py-2 text-xs text-ui-ink-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-ui-muted" aria-hidden="true" />
              הנתונים הגיעו מ{SOURCE_LABEL[detail.dataSource]}. ייבוא הבא ממקור זה עשוי לעדכן אותם שוב.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="שם פרטי" htmlFor="p-first" error={errors.firstName}>
              <Input id="p-first" data-autofocus value={form.firstName} maxLength={60} autoComplete="off" invalid={!!errors.firstName} onChange={e => set({ firstName: e.target.value })} />
            </Field>
            <Field label="שם משפחה" htmlFor="p-last" error={errors.lastName}>
              <Input id="p-last" value={form.lastName} maxLength={60} autoComplete="off" invalid={!!errors.lastName} onChange={e => set({ lastName: e.target.value })} />
            </Field>
            <Field label="תאריך לידה" htmlFor="p-birth" error={errors.birthDate}>
              <Input id="p-birth" type="date" dir="ltr" value={form.birthDate} min="1900-01-01" max={new Date().toISOString().slice(0, 10)} invalid={!!errors.birthDate} onChange={e => set({ birthDate: e.target.value })} />
            </Field>
            <Field label="מגדר" htmlFor="p-gender" error={errors.gender}>
              <Select id="p-gender" value={form.gender} onChange={e => set({ gender: e.target.value as Form['gender'] })}>
                <option value="">לא צוין</option><option value="FEMALE">נקבה</option><option value="MALE">זכר</option>
              </Select>
            </Field>
            {student && <>
              <Field label="שכבה" htmlFor="p-grade" error={errors.grade}>
                <Select id="p-grade" value={form.grade} onChange={e => set({ grade: e.target.value })}>
                  <option value="">לא צוינה</option>{GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                </Select>
              </Field>
              <Field label="מקבילה" htmlFor="p-parallel" error={errors.parallel} hint={classPreview ? `כיתה: ${classPreview}` : undefined}>
                <Input id="p-parallel" type="number" inputMode="numeric" min={1} max={99} dir="ltr" value={form.parallel} invalid={!!errors.parallel} onChange={e => set({ parallel: e.target.value })} />
              </Field>
            </>}
          </div>

          <div className="grid gap-1.5 rounded-ui-sm border border-ui-border p-3">
            <p className="text-[13px] font-semibold text-ui-ink-2">מספר זהות / מזהה (לא חובה)</p>
            {mode === 'edit' && detail?.hasIdentity && !replaceId ? (
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className={removeId ? 'text-ui-muted line-through' : 'text-ui-ink'} dir="ltr">•••{detail.identityHint}</span>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => { setReplaceId(true); setRemoveId(false) }}>החלפה</Button>
                  <Button size="sm" variant="ghost" onClick={() => setRemoveId(v => !v)}>{removeId ? 'ביטול ההסרה' : 'הסרה'}</Button>
                </div>
              </div>
            ) : (
              <div className="relative">
                <Input id="p-id" aria-label="מספר זהות או מזהה" type={showId ? 'text' : 'password'} dir="ltr" autoComplete="off" spellCheck={false} maxLength={20}
                  value={form.externalId} invalid={!!errors.externalId} onChange={e => set({ externalId: e.target.value })} className="pe-10" />
                <button type="button" onClick={() => setShowId(v => !v)} aria-label={showId ? 'הסתרת המזהה' : 'הצגת המזהה'}
                  className="ui-focus absolute end-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-ui-sm text-ui-muted hover:bg-ui-subtle">
                  {showId ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                </button>
              </div>
            )}
            <p className="text-xs text-ui-muted">משמש רק לזיהוי בייבוא, כדי שלא ייווצרו כפילויות. המזהה אינו נשמר כפי שהוא ואינו מוצג במסכים.</p>
            {errors.externalId && <p role="alert" className="text-xs text-ui-danger">{errors.externalId}</p>}
          </div>

          {formError && (
            <div role="alert" className="rounded-ui-sm border border-red-200 bg-ui-danger-soft px-3 py-2 text-[13px] text-ui-danger">
              <p>{formError}</p>
              {duplicate && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-ui-ink-2">
                  <span>הרשומה הקיימת: <b>{duplicate.name}</b> ({duplicate.roles.map(r => ROLE_LABEL[r]).join(', ')})</span>
                  {!duplicate.roles.includes(role)
                    ? <Button size="sm" onClick={() => void addRoleToExisting()} disabled={saving}>הוספה כ{ROLE_LABEL[role]} לרשומה הקיימת</Button>
                    : <Button size="sm" onClick={() => onOpenExisting(duplicate.id)}>פתיחת הרשומה הקיימת</Button>}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 border-t border-ui-border pt-3 sm:flex-row sm:justify-end">
            <Button onClick={() => void requestClose()} disabled={saving}>ביטול</Button>
            <Button type="submit" variant="primary" loading={saving} disabled={mode === 'edit' && !dirty} icon={<Save className="h-4 w-4" aria-hidden="true" />}>
              {saving ? 'שומר…' : mode === 'add' ? 'הוספה' : 'שמירת שינויים'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
