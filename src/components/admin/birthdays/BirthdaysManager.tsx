'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Plus, Search, Pencil, Power, ChevronRight, ChevronLeft, GraduationCap, Users, Cake, AlertCircle, Loader2, FileSpreadsheet } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Badge, EmptyState } from '@/components/ui/Display'
import { Input, Select } from '@/components/ui/Field'
import { confirmDialog } from '@/components/ui/ConfirmHost'
import { cn } from '@/lib/utils'
import PersonDialog from './PersonDialog'
import { type Role, type ListItem, SOURCE_LABEL, birthdayLabel, apiError } from './shared'

type Status = 'active' | 'inactive' | 'all'
type Data = { items: ListItem[]; total: number; page: number; pageSize: number; facets: { grades: string[]; classes: string[] } }
const PAGE_SIZE = 25
// Narrow phones: three filters side by side, so less padding and a smaller font than the default.
const FILTER = 'ps-2 pe-6 text-[13px] sm:w-36 sm:ps-3 sm:pe-8 sm:text-sm'

// The management list: one role at a time, searched and filtered on the server, a page at a time.
// The table shows only what an admin needs to find someone (name, class, birthday day and month,
// status); identifiers appear only as their last 3 characters, and only in the edit dialog.
export default function BirthdaysManager() {
  const [role, setRole] = useState<Role>('STUDENT')
  const [status, setStatus] = useState<Status>('active')
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [grade, setGrade] = useState('')
  const [className, setClassName] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<{ mode: 'add' } | { mode: 'edit'; id: string } | null>(null)
  const request = useRef(0)

  // Search waits for a short pause in typing.
  useEffect(() => { const t = setTimeout(() => { setQuery(q.trim()); setPage(1) }, 300); return () => clearTimeout(t) }, [q])

  const load = useCallback(async () => {
    const n = ++request.current
    setLoading(true); setError(null)
    const params = new URLSearchParams({ role, status, page: String(page), pageSize: String(PAGE_SIZE) })
    if (query) params.set('q', query)
    if (role === 'STUDENT' && grade) params.set('grade', grade)
    if (role === 'STUDENT' && className) params.set('className', className)
    try {
      const res = await fetch(`/api/people?${params}`, { cache: 'no-store' })
      if (!res.ok) throw new Error((await apiError(res, 'טעינת הרשימה נכשלה')).message)
      const d = await res.json() as Data
      if (n === request.current) setData(d)
    } catch (e) {
      if (n === request.current) setError(e instanceof Error ? e.message : 'טעינת הרשימה נכשלה')
    } finally { if (n === request.current) setLoading(false) }
  }, [role, status, page, query, grade, className])
  useEffect(() => { void load() }, [load])

  function switchRole(next: Role) {
    if (next === role) return
    setRole(next); setPage(1); setGrade(''); setClassName('')
  }

  async function toggleActive(p: ListItem) {
    const patch = async (active: boolean) => {
      const res = await fetch(`/api/people/${encodeURIComponent(p.id)}/active`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active }) })
      if (!res.ok) throw new Error((await apiError(res, 'עדכון הסטטוס נכשל')).message)
    }
    if (p.active) {
      const ok = await confirmDialog({
        title: 'להשבית את הרשומה?',
        body: <>
          <p>הרשומה של <b>{p.firstName} {p.lastName}</b> לא תופיע ברשימות ימי ההולדת במסכים.</p>
          <p className="mt-2">הרשומה לא נמחקת ואפשר להפעיל אותה שוב בכל עת.</p>
        </>,
        confirmLabel: 'השבתה',
        action: () => patch(false),
      })
      if (!ok) return
      toast.success('הרשומה הושבתה')
    } else {
      try { await patch(true); toast.success('הרשומה הופעלה') }
      catch (e) { toast.error(e instanceof Error ? e.message : 'עדכון הסטטוס נכשל'); return }
    }
    void load()
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  const students = role === 'STUDENT'
  const filtered = !!(query || grade || className || status !== 'active')

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="סוג רשומות" className="inline-flex rounded-ui bg-ui-subtle p-1"
          onKeyDown={e => { if (['ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); const next = role === 'STUDENT' ? 'TEACHER' : 'STUDENT'; switchRole(next); document.getElementById(`people-tab-${next}`)?.focus() } }}>
          {(['STUDENT', 'TEACHER'] as const).map(r => {
            const Icon = r === 'STUDENT' ? GraduationCap : Users
            const on = role === r
            return (
              <button key={r} id={`people-tab-${r}`} type="button" role="tab" aria-selected={on} aria-controls="people-panel" tabIndex={on ? 0 : -1} onClick={() => switchRole(r)}
                className={cn('ui-focus inline-flex h-9 items-center gap-1.5 rounded-ui-sm px-4 text-sm transition-colors', on ? 'bg-ui-surface font-semibold text-ui-ink shadow-ui' : 'text-ui-muted hover:text-ui-ink')}>
                <Icon className="h-4 w-4" aria-hidden="true" />{r === 'STUDENT' ? 'תלמידים' : 'מורים'}
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/admin/birthdays/import" icon={<FileSpreadsheet className="h-4 w-4" aria-hidden="true" />}>ייבוא מאקסל</ButtonLink>
          <Button variant="primary" icon={<Plus className="h-4 w-4" aria-hidden="true" />} onClick={() => setDialog({ mode: 'add' })}>
            הוספת {students ? 'תלמיד' : 'מורה'}
          </Button>
        </div>
      </div>

      <Card id="people-panel" role="tabpanel" aria-labelledby={`people-tab-${role}`} className="overflow-hidden">
        <div className="grid grid-cols-3 gap-2 border-b border-ui-border p-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center">
          <div className="relative col-span-3 sm:col-span-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ui-faint" aria-hidden="true" />
            <Input value={q} onChange={e => setQ(e.target.value)} maxLength={60} placeholder="חיפוש לפי שם" aria-label="חיפוש לפי שם" className="ps-9" />
          </div>
          <Select value={status} onChange={e => { setStatus(e.target.value as Status); setPage(1) }} aria-label="סטטוס" className={FILTER}>
            <option value="active">פעילים</option><option value="inactive">לא פעילים</option><option value="all">הכול</option>
          </Select>
          {students && <>
            <Select value={grade} onChange={e => { setGrade(e.target.value); setClassName(''); setPage(1) }} aria-label="שכבה" className={FILTER}>
              <option value="">שכבה</option>
              {data?.facets.grades.map(g => <option key={g} value={g}>שכבה {g}</option>)}
            </Select>
            <Select value={className} onChange={e => { setClassName(e.target.value); setPage(1) }} aria-label="כיתה" className={FILTER}>
              <option value="">כיתה</option>
              {data?.facets.classes.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
          </>}
        </div>

        <div aria-live="polite" aria-busy={loading}>
          {error ? (
            <div role="alert" className="flex items-center justify-between gap-3 p-5 text-sm text-ui-danger">
              <span className="inline-flex items-center gap-2"><AlertCircle className="h-4 w-4" aria-hidden="true" />{error}</span>
              <Button size="sm" onClick={() => void load()}>ניסיון חוזר</Button>
            </div>
          ) : !data ? (
            <div className="flex items-center justify-center gap-2 p-10 text-sm text-ui-muted"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />טוען…</div>
          ) : data.items.length === 0 ? (
            <EmptyState icon={<Cake className="h-6 w-6" />} title={filtered ? 'לא נמצאו רשומות' : `עדיין אין ${students ? 'תלמידים' : 'מורים'} ברשימה`}
              description={filtered ? 'נסו לשנות את החיפוש או המסננים.' : 'אפשר להוסיף רשומות ידנית או לייבא רשימה מקובץ Excel.'} />
          ) : (
            <>
              {/* Desktop: table */}
              <table className={cn('hidden w-full text-sm sm:table', loading && 'opacity-60')}>
                <thead className="bg-ui-subtle text-right text-xs text-ui-muted">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-medium">שם</th>
                    {students && <th scope="col" className="px-4 py-2.5 font-medium">כיתה</th>}
                    <th scope="col" className="px-4 py-2.5 font-medium">יום הולדת</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">מקור</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">סטטוס</th>
                    <th scope="col" className="px-4 py-2.5"><span className="sr-only">פעולות</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ui-border">
                  {data.items.map(p => (
                    <tr key={p.id} className={cn(!p.active && 'text-ui-muted')}>
                      <td className="px-4 py-2.5 font-medium text-ui-ink">{p.firstName} {p.lastName}{p.otherRole && <span className="ms-2 text-xs font-normal text-ui-muted">(גם {students ? 'מורה' : 'תלמיד/ה'})</span>}</td>
                      {students && <td className="px-4 py-2.5">{p.className ?? '—'}</td>}
                      <td className="px-4 py-2.5">{birthdayLabel(p.birthDay, p.birthMonth)}</td>
                      <td className="px-4 py-2.5 text-ui-muted">{SOURCE_LABEL[p.dataSource]}</td>
                      <td className="px-4 py-2.5"><Badge tone={p.active ? 'success' : 'neutral'} dot>{p.active ? 'פעיל' : 'לא פעיל'}</Badge></td>
                      <td className="px-4 py-2 text-left">
                        <div className="inline-flex gap-1">
                          <Button size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" aria-hidden="true" />} onClick={() => setDialog({ mode: 'edit', id: p.id })} aria-label={`עריכת ${p.firstName} ${p.lastName}`}>עריכה</Button>
                          <Button size="sm" variant="ghost" icon={<Power className="h-3.5 w-3.5" aria-hidden="true" />} onClick={() => void toggleActive(p)} aria-label={`${p.active ? 'השבתת' : 'הפעלת'} ${p.firstName} ${p.lastName}`}>{p.active ? 'השבתה' : 'הפעלה'}</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Mobile: cards */}
              <ul className={cn('divide-y divide-ui-border sm:hidden', loading && 'opacity-60')}>
                {data.items.map(p => (
                  <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className={cn('truncate text-sm font-semibold', p.active ? 'text-ui-ink' : 'text-ui-muted')}>{p.firstName} {p.lastName}</p>
                      <p className="mt-0.5 text-xs text-ui-muted">{[students ? p.className : null, birthdayLabel(p.birthDay, p.birthMonth), p.active ? null : 'לא פעיל'].filter(Boolean).join(' · ')}</p>
                    </div>
                    <Button size="sm" variant="ghost" className="h-10 w-10 px-0" onClick={() => setDialog({ mode: 'edit', id: p.id })} aria-label={`עריכת ${p.firstName} ${p.lastName}`}><Pencil className="h-4 w-4" aria-hidden="true" /></Button>
                    <Button size="sm" variant="ghost" className="h-10 w-10 px-0" onClick={() => void toggleActive(p)} aria-label={`${p.active ? 'השבתת' : 'הפעלת'} ${p.firstName} ${p.lastName}`}><Power className="h-4 w-4" aria-hidden="true" /></Button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {data && data.total > 0 && (
          <div className="flex items-center justify-between gap-3 border-t border-ui-border px-4 py-2.5 text-xs text-ui-muted">
            <span>{data.total} {students ? 'תלמידים' : 'מורים'}{pages > 1 && ` · עמוד ${data.page} מתוך ${pages}`}</span>
            {pages > 1 && (
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" disabled={page <= 1 || loading} onClick={() => setPage(p => p - 1)} icon={<ChevronRight className="h-4 w-4" aria-hidden="true" />}>הקודם</Button>
                <Button size="sm" variant="ghost" disabled={page >= pages || loading} onClick={() => setPage(p => p + 1)}>הבא<ChevronLeft className="h-4 w-4" aria-hidden="true" /></Button>
              </div>
            )}
          </div>
        )}
      </Card>

      {dialog && <PersonDialog key={dialog.mode === 'edit' ? dialog.id : `add-${role}`} mode={dialog.mode} id={dialog.mode === 'edit' ? dialog.id : undefined} role={role}
        onClose={() => setDialog(null)} onSaved={() => { setDialog(null); void load() }} onOpenExisting={id => setDialog({ mode: 'edit', id })} />}
    </div>
  )
}

