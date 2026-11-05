import { createHash } from 'node:crypto'
import { planSourceUpdate, SOURCE_RANK, type CoreFields, type SourceType } from '../sourcePrecedence'
import type { ImportKind } from './columns'

// What an import will do with each row, decided from the rows and the people currently in the school
// (matched by identity key only — never by name). Pure: the same function runs for the preview and
// again, inside the apply transaction, against the then-current data.

export type RowStatus = 'NEW' | 'UPDATE' | 'UNCHANGED' | 'DUPLICATE' | 'ERROR' | 'SKIPPED'
export const STATUS_LABELS: Record<RowStatus, string> = {
  NEW: 'חדש', UPDATE: 'לעדכון', UNCHANGED: 'ללא שינוי', DUPLICATE: 'כפילות בקובץ', ERROR: 'שגיאה', SKIPPED: 'דילוג בגלל עדיפות מקור',
}

export type RoleFields = { grade: string | null; parallel: number | null; className: string | null }
export type PlanInputRow = {
  line: number
  /** Keyed identity (HMAC) — null for rows that have errors. */
  identityKey: string | null
  core: CoreFields | null
  role: RoleFields | null
}
export type ExistingPerson = {
  id: string; dataSource: SourceType; active: boolean
  core: CoreFields
  roles: { role: ImportKind; grade: string | null; parallel: number | null; className: string | null; active: boolean }[]
}
export type PlannedRow = {
  line: number
  status: RowStatus
  personId: string | null
  core: Partial<CoreFields>
  roleAction: 'add' | 'update' | null
  roleFields: (keyof RoleFields)[]
  kept: string[]
  notes: string[]
  dataSource: SourceType | null
}

export function planImport(kind: ImportKind, rows: PlanInputRow[], existing: Map<string, ExistingPerson>): PlannedRow[] {
  const counts = new Map<string, number>()
  for (const r of rows) if (r.identityKey) counts.set(r.identityKey, (counts.get(r.identityKey) ?? 0) + 1)
  return rows.map(r => {
    const base: PlannedRow = { line: r.line, status: 'ERROR', personId: null, core: {}, roleAction: null, roleFields: [], kept: [], notes: [], dataSource: null }
    if (!r.identityKey || !r.core || !r.role) return base
    // The same identifier twice in one file: none of the rows is imported (which one is right?).
    if ((counts.get(r.identityKey) ?? 0) > 1) return { ...base, status: 'DUPLICATE' }
    const p = existing.get(r.identityKey)
    if (!p) return { ...base, status: 'NEW', core: r.core, roleAction: 'add', roleFields: ['grade', 'parallel', 'className'], dataSource: 'EXCEL' }

    const plan = planSourceUpdate({ dataSource: p.dataSource, ...p.core }, 'EXCEL', r.core)
    const mayOverwrite = SOURCE_RANK.EXCEL >= SOURCE_RANK[p.dataSource]
    const out: PlannedRow = { ...base, personId: p.id, core: plan.changes, kept: [...plan.kept], dataSource: plan.dataSource }
    const role = p.roles.find(x => x.role === kind)
    if (!role) {
      // Adding a missing role never replaces data, whoever owns the record.
      out.roleAction = 'add'; out.roleFields = ['grade', 'parallel', 'className']
      out.notes.push(kind === 'TEACHER' ? 'יתווסף תפקיד מורה לרשומה קיימת' : 'יתווסף תפקיד תלמיד לרשומה קיימת')
    } else if (kind === 'STUDENT') {
      const changed = (['grade', 'parallel', 'className'] as const).filter(k => r.role![k] !== null && r.role![k] !== role[k])
      if (changed.length && mayOverwrite) { out.roleAction = 'update'; out.roleFields = changed }
      else if (changed.length) out.kept.push(...changed)
    }
    if (!p.active) out.notes.push('הרשומה מושבתת ותישאר מושבתת')
    else if (role && !role.active) out.notes.push('התפקיד מושבת ויישאר מושבת')
    const writes = Object.keys(out.core).length > 0 || out.roleAction !== null
    out.status = writes ? 'UPDATE' : out.kept.length ? 'SKIPPED' : 'UNCHANGED'
    if (out.kept.length) out.notes.push('חלק מהנתונים לא עודכנו כי הם מגיעים ממקור עדיף (SmartSchool)')
    if (!writes) out.dataSource = p.dataSource
    return out
  })
}

/** A fingerprint of the planned work: the apply step re-plans and refuses if it differs. */
export function planHash(plan: PlannedRow[]): string {
  const canonical = plan.map(p => [p.line, p.status, p.personId, Object.entries(p.core).sort(), p.roleAction, [...p.roleFields].sort(), [...p.kept].sort()])
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

export function summarize(plan: PlannedRow[]): Record<RowStatus, number> {
  const s: Record<RowStatus, number> = { NEW: 0, UPDATE: 0, UNCHANGED: 0, DUPLICATE: 0, ERROR: 0, SKIPPED: 0 }
  for (const p of plan) s[p.status]++
  return s
}
