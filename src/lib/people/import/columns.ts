import type { Cell, Sheet } from './xlsx'

// Column mapping of a people import: which spreadsheet column holds which field. Headers are found
// by name (Hebrew, with the usual spellings), never by position; the admin can correct the mapping.

export const IMPORT_FIELDS = ['externalId', 'firstName', 'lastName', 'birthDate', 'gender', 'grade', 'parallel', 'className'] as const
export type ImportField = typeof IMPORT_FIELDS[number]
export type ImportKind = 'STUDENT' | 'TEACHER'
export type ColumnMapping = Partial<Record<ImportField, number | null>>

export const FIELD_LABELS: Record<ImportField, string> = {
  externalId: 'ת.ז / מזהה', firstName: 'שם פרטי', lastName: 'שם משפחה', birthDate: 'תאריך לידה',
  gender: 'מגדר', grade: 'שכבה', parallel: 'מקבילה', className: 'כיתה',
}

/** Fields of each import type, and which are required. Rows without an identifier cannot be
 *  imported (they could not be matched again and would be duplicated by the next import). */
export function fieldsFor(kind: ImportKind): { field: ImportField; required: boolean }[] {
  const base = [
    { field: 'externalId' as const, required: true }, { field: 'firstName' as const, required: true },
    { field: 'lastName' as const, required: true }, { field: 'birthDate' as const, required: true }, { field: 'gender' as const, required: false },
  ]
  return kind === 'STUDENT'
    ? [...base, { field: 'grade', required: false }, { field: 'parallel', required: false }, { field: 'className', required: false }]
    : base
}

// Header spellings, compared after removing quotes, geresh, dots, hyphens, colons and spaces.
const SYNONYMS: Record<ImportField, string[]> = {
  externalId: ['תז', 'תעודתזהות', 'מספרזהות', 'מסזהות', 'מספרתז', 'מזהה', 'מזהיתלמיד', 'id', 'idnumber'],
  firstName: ['שםפרטי', 'פרטי', 'firstname'],
  lastName: ['שםמשפחה', 'משפחה', 'lastname', 'surname'],
  birthDate: ['תאריךלידה', 'תלידה', 'לידה', 'birthdate', 'dateofbirth', 'dob'],
  gender: ['מגדר', 'מין', 'gender', 'sex'],
  grade: ['שכבה', 'שכבתגיל', 'grade'],
  parallel: ['מקבילה', 'מספרמקבילה', 'parallel'],
  className: ['כיתה', 'שםכיתה', 'class', 'classname'],
}
const normHeader = (s: string) => s.normalize('NFC').toLowerCase().replace(/["'׳״`.\-:_\s()]/g, '')

const cellText = (c: Cell | undefined) => (c?.kind === 'text' ? c.text : c?.kind === 'number' ? String(c.num) : '').trim()

export function fieldForHeader(header: string): ImportField | null {
  const h = normHeader(header)
  if (!h) return null
  for (const f of IMPORT_FIELDS) if (SYNONYMS[f].includes(h)) return f
  return null
}

export type SheetColumns = { headerRow: number; headers: { index: number; label: string }[]; mapping: ColumnMapping; dataRows: number }

/** Finds the header row (the first of the top 15 rows with most recognized headers, at least 2) and
 *  maps the recognized columns. Returns headerRow -1 when no header row is recognized. */
export function detectColumns(sheet: Sheet, kind: ImportKind): SheetColumns {
  let best = { row: -1, score: 0 }
  for (let r = 0; r < Math.min(15, sheet.rows.length); r++) {
    const row = sheet.rows[r]
    if (!row) continue
    const fields = new Set(row.map(c => fieldForHeader(cellText(c))).filter(Boolean))
    if (fields.size > best.score) best = { row: r, score: fields.size }
  }
  const allowed = new Set(fieldsFor(kind).map(f => f.field))
  if (best.score < 2) return { headerRow: -1, headers: [], mapping: {}, dataRows: 0 }
  const headerCells = sheet.rows[best.row] ?? []
  const headers = headerCells.map((c, index) => ({ index, label: cellText(c) })).filter(h => h.label)
  const mapping: ColumnMapping = {}
  for (const h of headers) {
    const f = fieldForHeader(h.label)
    if (f && allowed.has(f) && mapping[f] === undefined) mapping[f] = h.index
  }
  const dataRows = sheet.rows.slice(best.row + 1).filter(r => r && r.some(Boolean)).length
  return { headerRow: best.row, headers, mapping, dataRows }
}

/** Server-side check of a mapping sent by the client. Returns Hebrew errors (empty = valid). */
export function validateMapping(mapping: unknown, kind: ImportKind, headers: { index: number }[]): { mapping: ColumnMapping; errors: string[] } {
  const errors: string[] = []
  const out: ColumnMapping = {}
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) return { mapping: out, errors: ['מיפוי העמודות אינו תקין'] }
  const allowed = new Map(fieldsFor(kind).map(f => [f.field, f.required]))
  const valid = new Set(headers.map(h => h.index))
  const used = new Set<number>()
  for (const [key, value] of Object.entries(mapping as Record<string, unknown>)) {
    if (!allowed.has(key as ImportField)) { errors.push('מיפוי העמודות כולל שדה לא מוכר'); continue }
    if (value === null || value === undefined) continue
    if (typeof value !== 'number' || !Number.isInteger(value) || !valid.has(value)) { errors.push(`העמודה של "${FIELD_LABELS[key as ImportField]}" אינה קיימת בגיליון`); continue }
    if (used.has(value)) { errors.push('אותה עמודה נבחרה ליותר משדה אחד'); continue }
    used.add(value); out[key as ImportField] = value
  }
  for (const [field, required] of allowed) if (required && out[field] === undefined) errors.push(`יש לבחור עמודה עבור "${FIELD_LABELS[field]}"`)
  return { mapping: out, errors: [...new Set(errors)] }
}
