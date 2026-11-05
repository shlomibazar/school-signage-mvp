import type { Sheet } from './xlsx'
import type { ColumnMapping, ImportField, ImportKind } from './columns'
import { textOf, idOf, dateOf } from './cells'
import { normalizePersonRecord, normalizeGender, type NormalizedPersonRecord } from '../normalize'
import { normalizeGrade, normalizeParallel, displayClass } from '../grades'

// Spreadsheet rows → normalized person records (the same NormalizedPersonRecord the admin form and,
// later, SmartSchool produce). Each row keeps its spreadsheet line number and its issues.

export const MAX_IMPORT_ROWS = 3000

export type ImportIssue = { level: 'error' | 'warning'; field?: ImportField | 'row'; message: string }
export type ImportRow = {
  line: number
  /** As written in the file, for the preview (also when the row is invalid). */
  firstName: string; lastName: string
  record: NormalizedPersonRecord | null
  issues: ImportIssue[]
}

/** "ט' 2" / "ט2" / "ט-2" → "ט׳ 2"; other texts are kept as written. */
export function canonicalClass(raw: string): { text: string; grade: string | null; parallel: number | null } {
  const t = raw.trim()
  const m = /^(.+?)[\s\-]*(\d{1,2})$/.exec(t)
  if (m) {
    const g = normalizeGrade(m[1]), p = normalizeParallel(m[2])
    if (g && p) return { text: `${g} ${p}`, grade: g, parallel: p }
  }
  const g = normalizeGrade(t)
  return { text: g ?? t, grade: g, parallel: null }
}

export function buildRows(sheet: Sheet, headerRow: number, mapping: ColumnMapping, kind: ImportKind, date1904: boolean, now = new Date()): { rows: ImportRow[]; tooMany: boolean } {
  const rows: ImportRow[] = []
  const cellAt = (r: number, f: ImportField) => { const i = mapping[f]; return i === undefined || i === null ? undefined : sheet.rows[r]?.[i] }
  for (let r = headerRow + 1; r < sheet.rows.length; r++) {
    const row = sheet.rows[r]
    if (!row || !Object.values(mapping).some(i => i !== null && i !== undefined && row[i] && textOf(row[i]) !== '')) continue
    if (rows.length >= MAX_IMPORT_ROWS) return { rows, tooMany: true }
    const issues: ImportIssue[] = []
    const add = (level: ImportIssue['level'], field: ImportIssue['field'], message: string) => issues.push({ level, field, message })
    for (const f of ['firstName', 'lastName', 'gender', 'grade', 'parallel', 'className'] as const)
      if (cellAt(r, f)?.formula) add('warning', f, 'הערך חושב בנוסחה; נלקח הערך השמור בקובץ')

    const id = idOf(cellAt(r, 'externalId'))
    if (id.error) add('error', 'externalId', id.error)
    else if (!id.value) add('error', 'externalId', 'חסר מזהה. בלי מזהה אי אפשר לייבא (כדי למנוע כפילויות); אפשר להוסיף ידנית.')
    const date = dateOf(cellAt(r, 'birthDate'), date1904)
    if (date.error) add('error', 'birthDate', date.error)
    else if (!date.value) add('error', 'birthDate', 'חסר תאריך לידה')
    if (date.warning) add('warning', 'birthDate', date.warning)

    const genderText = textOf(cellAt(r, 'gender'))
    let gender = normalizeGender(genderText)
    if (gender === 'invalid') { add('warning', 'gender', 'מגדר לא מוכר; יישמר כ״לא צוין״'); gender = null }

    let grade: string | null = null, parallel: number | null = null, className: string | null = null
    if (kind === 'STUDENT') {
      const gt = textOf(cellAt(r, 'grade'))
      if (gt) { grade = normalizeGrade(gt); if (!grade) add('error', 'grade', 'שכבה לא מוכרת') }
      const pt = textOf(cellAt(r, 'parallel'))
      if (pt) { parallel = normalizeParallel(pt); if (parallel === null) add('error', 'parallel', 'מקבילה צריכה להיות מספר בין 1 ל־99') }
      const ct = textOf(cellAt(r, 'className'))
      if (ct) {
        const c = canonicalClass(ct)
        className = c.text
        // Fill grade/parallel from the class when their columns are missing; flag disagreements.
        if (!gt && c.grade) grade = c.grade
        if (!pt && c.parallel) parallel = c.parallel
        if ((gt && c.grade && grade && c.grade !== grade) || (pt && c.parallel && parallel && c.parallel !== parallel))
          add('warning', 'className', 'הכיתה אינה תואמת לשכבה או למקבילה; נשמרה הכיתה כפי שנכתבה')
      }
      if (!grade && !className) add('warning', 'grade', 'לא צוינו שכבה וכיתה')
    }

    const firstName = textOf(cellAt(r, 'firstName')), lastName = textOf(cellAt(r, 'lastName'))
    let record: NormalizedPersonRecord | null = null
    if (!issues.some(i => i.level === 'error')) {
      const n = normalizePersonRecord({ externalId: id.value, firstName, lastName, birthDate: date.value, gender, role: kind, grade: grade ?? undefined, parallel: parallel ?? undefined, className: className ?? displayClass(grade, parallel) }, now)
      if (n.ok) record = n.record
      else for (const [field, message] of Object.entries(n.errors)) add('error', field as ImportField, message)
    } else {
      // Report name problems too, so a row can be fixed in one pass.
      const n = normalizePersonRecord({ firstName, lastName, birthDate: '2000-01-01', role: kind }, now)
      if (!n.ok) for (const field of ['firstName', 'lastName'] as const) if (n.errors[field]) add('error', field, n.errors[field]!)
    }
    rows.push({ line: r + 1, firstName: firstName.slice(0, 60), lastName: lastName.slice(0, 60), record, issues })
  }
  return { rows, tooMany: false }
}
