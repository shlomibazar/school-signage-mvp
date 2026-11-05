'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { FileSpreadsheet, Upload, Check, AlertCircle, AlertTriangle, Info, GraduationCap, Users, ArrowRight, Loader2 } from 'lucide-react'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Badge, type BadgeTone } from '@/components/ui/Display'
import { Select } from '@/components/ui/Field'
import { confirmDialog } from '@/components/ui/ConfirmHost'
import { cn } from '@/lib/utils'
import { apiError } from './shared'

type Kind = 'STUDENT' | 'TEACHER'
type Field = 'externalId' | 'firstName' | 'lastName' | 'birthDate' | 'gender' | 'grade' | 'parallel' | 'className'
type Mapping = Partial<Record<Field, number | null>>
type SheetInfo = { index: number; name: string; headerRow: number; headers: { index: number; label: string }[]; mapping: Mapping; dataRows: number; truncated: boolean }
type Status = 'NEW' | 'UPDATE' | 'UNCHANGED' | 'DUPLICATE' | 'ERROR' | 'SKIPPED'
type Issue = { level: 'error' | 'warning'; field?: string; message: string }
type PreviewRow = { line: number; name: string; className: string | null; birthDate: string | null; idHint: string | null; status: Status; statusLabel: string; issues: Issue[]; notes: string[] }
type Preview = { importId: string; kind: Kind; sheetName: string; fileName: string; expiresAt: string; summary: Record<Status, number>; rows: PreviewRow[]; recentSameFile: boolean }
type Result = { created: number; updated: number; unchanged: number; skipped: number; duplicates: number; invalid: number; failed: number }

const FIELDS: Record<Kind, { field: Field; label: string; required: boolean }[]> = {
  TEACHER: [
    { field: 'externalId', label: 'ת.ז / מזהה', required: true }, { field: 'firstName', label: 'שם פרטי', required: true },
    { field: 'lastName', label: 'שם משפחה', required: true }, { field: 'birthDate', label: 'תאריך לידה', required: true }, { field: 'gender', label: 'מגדר', required: false },
  ],
  STUDENT: [],
}
FIELDS.STUDENT = [...FIELDS.TEACHER, { field: 'grade', label: 'שכבה', required: false }, { field: 'parallel', label: 'מקבילה', required: false }, { field: 'className', label: 'כיתה', required: false }]

const STATUS_ORDER: Status[] = ['NEW', 'UPDATE', 'UNCHANGED', 'SKIPPED', 'DUPLICATE', 'ERROR']
const STATUS_TONE: Record<Status, BadgeTone> = { NEW: 'success', UPDATE: 'primary', UNCHANGED: 'neutral', SKIPPED: 'warning', DUPLICATE: 'warning', ERROR: 'danger' }
const STATUS_LABEL: Record<Status, string> = { NEW: 'חדש', UPDATE: 'לעדכון', UNCHANGED: 'ללא שינוי', DUPLICATE: 'כפילות בקובץ', ERROR: 'שגיאה', SKIPPED: 'דילוג בגלל עדיפות מקור' }
const colName = (i: number) => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26) } return s }
const PAGE = 50
// File and sheet names keep their own direction inside Hebrew text ("שם.xlsx" stays readable).
const isolate = (s: string) => `\u2068${s}\u2069`

// Import of students or teachers from an .xlsx file, in steps: upload → columns → preview → result.
// The file stays in the browser and is sent again for the preview; nothing is saved before the admin
// confirms, and the confirmation sends only the import id (the server applies its own stored plan).
export default function ImportWizard() {
  const [step, setStep] = useState<'upload' | 'map' | 'preview' | 'done'>('upload')
  const [kind, setKind] = useState<Kind | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [sheets, setSheets] = useState<SheetInfo[]>([])
  const [sheetIndex, setSheetIndex] = useState(0)
  const [mapping, setMapping] = useState<Mapping>({})
  const [preview, setPreview] = useState<Preview | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [filter, setFilter] = useState<Status | 'ALL' | 'ISSUES'>('ALL')
  const [page, setPage] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const inFlight = useRef(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => { heading.current?.focus() }, [step])
  // Leaving with a preview that was not applied: the browser asks (the stored preview then expires).
  useEffect(() => {
    if (step !== 'preview') return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [step])

  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError(null); setNotice(null)
    try { return await fn() }
    catch (e) { setError(e instanceof Error ? e.message : 'הפעולה נכשלה. נסו שוב.') }
    finally { inFlight.current = false; setBusy(false) }
  }

  const form = (extra: Record<string, string> = {}) => {
    const f = new FormData()
    f.append('file', file!); f.append('kind', kind!)
    for (const [k, v] of Object.entries(extra)) f.append(k, v)
    return f
  }

  const inspect = () => run(async () => {
    const res = await fetch('/api/people/import/inspect', { method: 'POST', body: form() })
    if (!res.ok) throw new Error((await apiError(res, 'קריאת הקובץ נכשלה')).message)
    const data = (await res.json()).data as { sheets: SheetInfo[] }
    const first = data.sheets.find(s => s.headerRow >= 0) ?? data.sheets[0]
    setSheets(data.sheets); setSheetIndex(first.index); setMapping(first.mapping); setStep('map')
  })

  const sheet = sheets.find(s => s.index === sheetIndex)
  const fields = kind ? FIELDS[kind] : []
  const missing = fields.filter(f => f.required && (mapping[f.field] === undefined || mapping[f.field] === null))
  const usedTwice = useMemo(() => {
    const vals = Object.values(mapping).filter((v): v is number => typeof v === 'number')
    return vals.length !== new Set(vals).size
  }, [mapping])

  const makePreview = () => run(async () => {
    const res = await fetch('/api/people/import', { method: 'POST', body: form({ sheet: String(sheetIndex), mapping: JSON.stringify(mapping) }) })
    if (!res.ok) throw new Error((await apiError(res, 'יצירת התצוגה המקדימה נכשלה')).message)
    setPreview((await res.json()).data as Preview); setFilter('ALL'); setPage(0); setStep('preview')
  })

  async function cancel() {
    if (preview) await fetch(`/api/people/import/${encodeURIComponent(preview.importId)}`, { method: 'DELETE' }).catch(() => {})
    setPreview(null); setStep('map')
  }

  const importable = preview ? preview.summary.NEW + preview.summary.UPDATE : 0
  async function apply() {
    if (!preview || !importable) return
    const ok = await confirmDialog({
      title: 'לבצע את הייבוא?',
      body: <>
        <p>{[preview.summary.NEW ? `${preview.summary.NEW} רשומות חדשות יתווספו` : '', preview.summary.UPDATE ? `${preview.summary.UPDATE} רשומות קיימות יעודכנו` : ''].filter(Boolean).join(' ו־')}.</p>
        <p className="mt-2">שורות עם שגיאה, כפילות או ללא שינוי לא ייובאו. רשומות שאינן בקובץ לא יימחקו ולא יושבתו.</p>
      </>,
      confirmLabel: 'ביצוע הייבוא', tone: 'primary',
    })
    if (!ok) return
    await run(async () => {
      const res = await fetch(`/api/people/import/${encodeURIComponent(preview.importId)}/apply`, { method: 'POST' })
      if (!res.ok) {
        const { message, body } = await apiError(res, 'הייבוא נכשל. לא בוצע שום שינוי.')
        if (body.code === 'PLAN_CHANGED' && body.preview) { setPreview(body.preview as Preview); setFilter('ALL'); setPage(0); setNotice(message); return }
        if (res.status === 410) { setPreview(null); setStep('upload') }
        throw new Error(message)
      }
      setResult((await res.json()).data as Result); setStep('done'); toast.success('הייבוא הושלם')
    })
  }

  function reset() {
    setStep('upload'); setFile(null); setSheets([]); setMapping({}); setPreview(null); setResult(null); setError(null); setNotice(null)
    if (fileInput.current) fileInput.current.value = ''
  }

  const rows = useMemo(() => {
    if (!preview) return []
    if (filter === 'ALL') return preview.rows
    if (filter === 'ISSUES') return preview.rows.filter(r => r.issues.length || r.notes.length)
    return preview.rows.filter(r => r.status === filter)
  }, [preview, filter])
  const pageRows = rows.slice(page * PAGE, page * PAGE + PAGE)
  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const STEPS = ['קובץ', 'עמודות', 'תצוגה מקדימה', 'סיום']
  const stepIndex = { upload: 0, map: 1, preview: 2, done: 3 }[step]

  return (
    <div className="grid gap-4">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]" aria-label="שלבי הייבוא">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2" aria-current={i === stepIndex ? 'step' : undefined}>
            <span className={cn('grid h-6 w-6 place-items-center rounded-full text-xs font-bold', i < stepIndex ? 'bg-ui-success text-white' : i === stepIndex ? 'bg-ui-primary text-white' : 'bg-ui-subtle text-ui-muted')}>
              {i < stepIndex ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : i + 1}
            </span>
            <span className={i === stepIndex ? 'font-semibold text-ui-ink' : 'text-ui-muted'}>{s}</span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-ui-border" aria-hidden="true" />}
          </li>
        ))}
      </ol>

      {error && <div role="alert" className="flex items-start gap-2 rounded-ui-sm border border-red-200 bg-ui-danger-soft px-4 py-3 text-[13px] text-ui-danger"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{error}</div>}
      {notice && <div role="status" className="flex items-start gap-2 rounded-ui-sm border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800"><Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{notice}</div>}

      {step === 'upload' && (
        <Card>
          <CardHeader title={<span ref={heading} tabIndex={-1} className="outline-none">בחירת קובץ</span>} description="קובץ Excel בפורמט xlsx, עד 5MB ועד 3000 שורות" />
          <CardBody className="grid gap-5">
            <fieldset>
              <legend className="mb-2 text-[13px] font-semibold text-ui-ink-2">סוג הרשימה</legend>
              <div role="radiogroup" aria-label="סוג הרשימה" className="grid grid-cols-2 gap-2 sm:max-w-md">
                {([['STUDENT', 'תלמידים', GraduationCap], ['TEACHER', 'מורים', Users]] as const).map(([k, label, Icon]) => (
                  <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
                    className={cn('ui-focus flex items-center gap-2 rounded-ui-sm border px-3 py-3 text-sm font-medium transition-colors', kind === k ? 'border-ui-primary bg-ui-primary-soft text-ui-primary-ink' : 'border-ui-border hover:bg-ui-subtle')}>
                    <Icon className="h-4 w-4" aria-hidden="true" />{label}
                  </button>
                ))}
              </div>
            </fieldset>
            <div>
              <p className="mb-2 text-[13px] font-semibold text-ui-ink-2">קובץ</p>
              <input ref={fileInput} id="import-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only"
                onChange={e => { setFile(e.target.files?.[0] ?? null); setError(null) }} />
              <label htmlFor="import-file" className="ui-focus flex cursor-pointer flex-col items-center gap-2 rounded-ui-lg border-2 border-dashed border-ui-border-strong bg-ui-subtle px-4 py-8 text-center hover:bg-ui-surface"
                tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.current?.click() } }}>
                <FileSpreadsheet className="h-8 w-8 text-ui-muted" aria-hidden="true" />
                {file ? <span className="text-sm font-medium text-ui-ink" dir="auto">{file.name}</span> : <span className="text-sm text-ui-ink-2">לחצו לבחירת קובץ xlsx</span>}
                <span className="text-xs text-ui-muted">הקובץ נקרא בשרת ואינו נשמר</span>
              </label>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <ButtonLink href="/admin/birthdays" variant="ghost">ביטול</ButtonLink>
              <Button variant="primary" onClick={() => void inspect()} disabled={!kind || !file} loading={busy} icon={<Upload className="h-4 w-4" aria-hidden="true" />}>המשך</Button>
            </div>
          </CardBody>
        </Card>
      )}

      {step === 'map' && sheet && kind && (
        <Card>
          <CardHeader title={<span ref={heading} tabIndex={-1} className="outline-none">התאמת עמודות</span>} description={`${kind === 'STUDENT' ? 'תלמידים' : 'מורים'} · ${isolate(file?.name ?? '')}`} />
          <CardBody className="grid gap-4">
            {sheets.length > 1 && (
              <label className="grid gap-1.5 sm:max-w-xs">
                <span className="text-[13px] font-semibold text-ui-ink-2">גיליון</span>
                <Select value={sheetIndex} onChange={e => { const s = sheets[Number(e.target.value)]; setSheetIndex(s.index); setMapping(s.mapping) }}>
                  {sheets.map(s => <option key={s.index} value={s.index}>{s.name}{s.headerRow < 0 ? ' (ללא כותרות)' : ` (${s.dataRows} שורות)`}</option>)}
                </Select>
              </label>
            )}
            {sheet.headerRow < 0 ? (
              <p role="alert" className="text-[13px] text-ui-danger">לא נמצאה בגיליון הזה שורת כותרות (למשל ״שם פרטי״, ״שם משפחה״, ״תאריך לידה״). בחרו גיליון אחר או הוסיפו כותרות בקובץ.</p>
            ) : (
              <>
                <p className="text-[13px] text-ui-muted">שורת הכותרות: {sheet.headerRow + 1} · {sheet.dataRows} שורות נתונים. העמודות זוהו לפי שמות הכותרות; אפשר לתקן.</p>
                <div className="divide-y divide-ui-border rounded-ui-sm border border-ui-border">
                  {fields.map(f => {
                    const value = mapping[f.field]
                    const set = typeof value === 'number'
                    return (
                      <div key={f.field} className="grid grid-cols-1 gap-2 px-3 py-2.5 sm:grid-cols-[1fr_16rem] sm:items-center">
                        <label htmlFor={`map-${f.field}`} className="flex items-center gap-2 text-sm text-ui-ink">
                          {set ? <Check className="h-4 w-4 text-ui-success" aria-hidden="true" /> : f.required ? <AlertCircle className="h-4 w-4 text-ui-danger" aria-hidden="true" /> : <span className="h-4 w-4" aria-hidden="true" />}
                          {f.label}
                          <span className={cn('text-xs', f.required ? 'text-ui-danger' : 'text-ui-muted')}>{f.required ? 'חובה' : 'לא חובה'}</span>
                        </label>
                        <Select id={`map-${f.field}`} value={set ? value : ''} invalid={f.required && !set}
                          onChange={e => setMapping(m => ({ ...m, [f.field]: e.target.value === '' ? null : Number(e.target.value) }))}>
                          <option value="">— ללא —</option>
                          {sheet.headers.map(h => <option key={h.index} value={h.index}>{colName(h.index)} · {h.label}</option>)}
                        </Select>
                      </div>
                    )
                  })}
                </div>
                {missing.length > 0 && <p role="alert" className="text-[13px] text-ui-danger">חסרות עמודות חובה: {missing.map(f => f.label).join(', ')}</p>}
                {usedTwice && <p role="alert" className="text-[13px] text-ui-danger">אותה עמודה נבחרה ליותר משדה אחד</p>}
                {kind === 'STUDENT' && mapping.grade == null && mapping.className == null && <p className="text-[13px] text-amber-700">לא נבחרו שכבה או כיתה: התלמידים יישמרו בלי כיתה.</p>}
              </>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <Button variant="ghost" icon={<ArrowRight className="h-4 w-4" aria-hidden="true" />} onClick={() => setStep('upload')}>חזרה</Button>
              <Button variant="primary" onClick={() => void makePreview()} loading={busy} disabled={sheet.headerRow < 0 || missing.length > 0 || usedTwice}>תצוגה מקדימה</Button>
            </div>
          </CardBody>
        </Card>
      )}

      {step === 'preview' && preview && (
        <Card>
          <CardHeader title={<span ref={heading} tabIndex={-1} className="outline-none">תצוגה מקדימה</span>}
            description={`${preview.kind === 'STUDENT' ? 'תלמידים' : 'מורים'} · ${isolate(preview.fileName)} · ${isolate(preview.sheetName)} · עדיין לא נשמר דבר`} />
          <CardBody className="grid gap-4">
            {preview.recentSameFile && <p role="status" className="flex items-center gap-2 rounded-ui-sm border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800"><AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />קובץ זהה כבר יובא ב־24 השעות האחרונות.</p>}
            <div className="flex flex-wrap gap-2" role="group" aria-label="סינון לפי סטטוס">
              <FilterChip on={filter === 'ALL'} onClick={() => { setFilter('ALL'); setPage(0) }}>הכול · {preview.rows.length}</FilterChip>
              {STATUS_ORDER.map(s => preview.summary[s] > 0 && (
                <FilterChip key={s} on={filter === s} onClick={() => { setFilter(s); setPage(0) }}>{STATUS_LABEL[s]} · {preview.summary[s]}</FilterChip>
              ))}
              <FilterChip on={filter === 'ISSUES'} onClick={() => { setFilter('ISSUES'); setPage(0) }}>עם הערות</FilterChip>
            </div>
            <div className="overflow-x-auto rounded-ui-sm border border-ui-border">
              <table className="hidden w-full text-sm sm:table">
                <thead className="bg-ui-subtle text-right text-xs text-ui-muted">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">שורה</th><th scope="col" className="px-3 py-2 font-medium">שם</th>
                    {preview.kind === 'STUDENT' && <th scope="col" className="px-3 py-2 font-medium">כיתה</th>}
                    <th scope="col" className="px-3 py-2 font-medium">תאריך לידה</th><th scope="col" className="px-3 py-2 font-medium">מזהה</th>
                    <th scope="col" className="px-3 py-2 font-medium">סטטוס</th><th scope="col" className="px-3 py-2 font-medium">הערות</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ui-border">
                  {pageRows.map(r => (
                    <tr key={r.line} className="align-top">
                      <td className="px-3 py-2 text-ui-muted tabular-nums">{r.line}</td>
                      <td className="px-3 py-2 font-medium text-ui-ink">{r.name || '—'}</td>
                      {preview.kind === 'STUDENT' && <td className="px-3 py-2">{r.className ?? '—'}</td>}
                      <td className="px-3 py-2 tabular-nums" dir="ltr">{r.birthDate ?? '—'}</td>
                      <td className="px-3 py-2 tabular-nums text-ui-muted" dir="ltr">{r.idHint ? `•••${r.idHint}` : '—'}</td>
                      <td className="px-3 py-2"><Badge tone={STATUS_TONE[r.status]}>{r.statusLabel}</Badge></td>
                      <td className="px-3 py-2"><Notes row={r} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ul className="divide-y divide-ui-border sm:hidden">
                {pageRows.map(r => (
                  <li key={r.line} className="grid gap-1 px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-semibold text-ui-ink">{r.name || '—'}</span>
                      <Badge tone={STATUS_TONE[r.status]}>{r.statusLabel}</Badge>
                    </div>
                    <span className="text-xs text-ui-muted">שורה {r.line}{r.className ? ` · ${r.className}` : ''}{r.birthDate ? ` · ${r.birthDate}` : ''}{r.idHint ? ` · •••${r.idHint}` : ''}</span>
                    <Notes row={r} />
                  </li>
                ))}
              </ul>
              {!pageRows.length && <p className="p-4 text-center text-[13px] text-ui-muted">אין שורות בסינון הזה</p>}
            </div>
            {pages > 1 && (
              <div className="flex items-center justify-between text-xs text-ui-muted">
                <span>עמוד {page + 1} מתוך {pages}</span>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage(p => p - 1)}>הקודם</Button>
                  <Button size="sm" variant="ghost" disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}>הבא</Button>
                </div>
              </div>
            )}
            <div className="flex flex-col-reverse gap-2 border-t border-ui-border pt-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-2">
                <Button variant="ghost" icon={<ArrowRight className="h-4 w-4" aria-hidden="true" />} onClick={() => void cancel()} disabled={busy}>חזרה לעמודות</Button>
              </div>
              <Button variant="primary" onClick={() => void apply()} loading={busy} disabled={!importable}>
                {importable ? `ייבוא ${importable} רשומות` : 'אין רשומות לייבוא'}
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {step === 'done' && result && (
        <Card>
          <CardHeader title={<span ref={heading} tabIndex={-1} className="outline-none">הייבוא הושלם</span>} description="כל השינויים נשמרו יחד. רשומות שלא היו בקובץ לא שונו." />
          <CardBody className="grid gap-4">
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {([['נוספו', result.created, 'text-ui-success'], ['עודכנו', result.updated, 'text-ui-primary'], ['ללא שינוי', result.unchanged, 'text-ui-ink-2'],
                ['דילוג (עדיפות מקור)', result.skipped, 'text-amber-700'], ['כפילויות בקובץ', result.duplicates, 'text-amber-700'], ['שורות שגויות', result.invalid, 'text-ui-danger']] as const).map(([label, n, tone]) => (
                <div key={label} className="rounded-ui-sm border border-ui-border px-3 py-2.5">
                  <dt className="text-xs text-ui-muted">{label}</dt>
                  <dd className={cn('text-xl font-bold tabular-nums', tone)}>{n}</dd>
                </div>
              ))}
            </dl>
            {(result.invalid > 0 || result.duplicates > 0) && <p className="text-[13px] text-ui-muted">שורות שגויות וכפולות לא יובאו. אפשר לתקן אותן בקובץ ולייבא שוב — רשומות שכבר יובאו יזוהו ולא ייווצרו כפילויות.</p>}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <Button variant="ghost" onClick={reset}>ייבוא קובץ נוסף</Button>
              <ButtonLink href="/admin/birthdays" variant="primary">לרשימת ימי ההולדת</ButtonLink>
            </div>
          </CardBody>
        </Card>
      )}

      {busy && step !== 'upload' && <p className="sr-only" role="status"><Loader2 aria-hidden="true" />מעבד…</p>}
      <p className="text-xs text-ui-muted">מספרי זהות אינם נשמרים כפי שהם ואינם מוצגים; משמשים רק לזיהוי. <Link href="/admin/birthdays" className="underline">חזרה לרשימה</Link></p>
    </div>
  )
}

function FilterChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-pressed={on} onClick={onClick} className={cn('ui-focus h-8 rounded-full border px-3 text-xs font-medium transition-colors', on ? 'border-ui-primary bg-ui-primary-soft text-ui-primary-ink' : 'border-ui-border text-ui-ink-2 hover:bg-ui-subtle')}>{children}</button>
}

function Notes({ row }: { row: PreviewRow }) {
  if (!row.issues.length && !row.notes.length) return <span className="text-xs text-ui-faint">—</span>
  return (
    <ul className="grid gap-0.5 text-xs">
      {row.issues.map((i, k) => <li key={`i${k}`} className={i.level === 'error' ? 'text-ui-danger' : 'text-amber-700'}>{i.message}</li>)}
      {row.notes.map((n, k) => <li key={`n${k}`} className="text-ui-muted">{n}</li>)}
    </ul>
  )
}
