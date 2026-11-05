// Source precedence for people's data (used by imports from Stage 4 on; Stage 3 has manual entry).
//
// Each person records which source last wrote its core fields (dataSource). Rules:
// 1. Precedence: SMARTSCHOOL (authoritative, rank 3) > EXCEL (manual file, rank 2) > MANUAL (rank 1).
// 2. An import may write core fields (names, birth date, gender) and role details only if its rank is
//    at least the rank of the person's current dataSource. So an Excel import never overwrites data
//    that came from SmartSchool, whatever the dates of the files; SmartSchool overwrites Excel and
//    manual data. Timestamps are never used to decide.
// 3. An admin's edit in the management page is an explicit action and is always applied; it does not
//    change dataSource, so the next import from the owning source may update the record again (the
//    page says so for imported people).
// 4. A lower-rank source may still link itself to the person (its PersonSource row is kept up to
//    date) and may fill fields that are empty — it never replaces a value.
// 5. Being missing from an import never deletes or deactivates anyone automatically. A full sync may
//    only *propose* deactivations, applied after an explicit confirmation.

export type SourceType = 'MANUAL' | 'EXCEL' | 'SMARTSCHOOL'
export const SOURCE_RANK: Record<SourceType, number> = { MANUAL: 1, EXCEL: 2, SMARTSCHOOL: 3 }

export type CoreFields = { firstName: string; lastName: string; birthDate: string; gender: 'MALE' | 'FEMALE' | null }

export type SourceUpdatePlan = {
  /** The fields to write (only changed ones). */
  changes: Partial<CoreFields>
  /** Fields with a different incoming value that were kept because the current owner ranks higher. */
  kept: (keyof CoreFields)[]
  /** The person's dataSource after the update. */
  dataSource: SourceType
}

/** What an import from `incoming` may change on a person whose core data came from `current`. */
export function planSourceUpdate(current: { dataSource: SourceType } & CoreFields, incomingSource: SourceType, incoming: Partial<CoreFields>): SourceUpdatePlan {
  const mayOverwrite = SOURCE_RANK[incomingSource] >= SOURCE_RANK[current.dataSource]
  const changes: Partial<CoreFields> = {}
  const kept: (keyof CoreFields)[] = []
  for (const key of ['firstName', 'lastName', 'birthDate', 'gender'] as const) {
    const next = incoming[key]
    if (next === undefined || next === null || next === '') continue // a source never clears a value
    if (next === current[key]) continue
    const empty = current[key] === null || current[key] === ''
    if (mayOverwrite || empty) (changes as Record<string, unknown>)[key] = next
    else kept.push(key)
  }
  return { changes, kept, dataSource: mayOverwrite ? incomingSource : current.dataSource }
}
