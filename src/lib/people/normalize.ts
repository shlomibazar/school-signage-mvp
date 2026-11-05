import { parseDateOnly, formatDateOnly } from './birthdays'
import { normalizeGrade, normalizeParallel, displayClass } from './grades'

// The source-independent shape of a person, produced from any source (the admin form now; Excel in
// Stage 4; SmartSchool later) and consumed by the people service. Nothing downstream knows about
// spreadsheets or APIs of other systems.

export type PersonRoleType = 'STUDENT' | 'TEACHER'
export type Gender = 'MALE' | 'FEMALE'

export type NormalizedPersonRecord = {
  /** The external identifier as given (normalized and hashed by the service; never stored raw). */
  externalId: string | null
  firstName: string
  lastName: string
  /** YYYY-MM-DD */
  birthDate: string
  gender: Gender | null
  role: PersonRoleType
  grade: string | null
  parallel: number | null
  className: string | null
}

export type RawPersonInput = Partial<Record<keyof NormalizedPersonRecord, unknown>>
export type NormalizeResult =
  | { ok: true; record: NormalizedPersonRecord; warnings: string[] }
  | { ok: false; errors: Partial<Record<keyof NormalizedPersonRecord, string>> }

const NAME_MAX = 60
// Letters of any script, combining marks, spaces, hyphens, apostrophes/geresh and dots.
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M} .'’׳״"-]*$/u

export function normalizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const v = raw.normalize('NFC').replace(/\s+/g, ' ').trim()
  if (!v || v.length > NAME_MAX || !NAME_PATTERN.test(v)) return null
  return v
}

/** Gender from the usual spellings; anything else is "not given" (never guessed). */
export function normalizeGender(raw: unknown): Gender | null | 'invalid' {
  if (raw === null || raw === undefined) return null
  const v = String(raw).trim().toLowerCase()
  if (!v) return null
  if (['male', 'm', 'זכר', 'ז', 'בן'].includes(v)) return 'MALE'
  if (['female', 'f', 'נקבה', 'נ', 'בת'].includes(v)) return 'FEMALE'
  return 'invalid'
}

/**
 * Validates and normalizes one person. `now` bounds the birth date (not in the future, not before
 * 1900). Student fields are kept only for students.
 */
export function normalizePersonRecord(input: RawPersonInput, now = new Date()): NormalizeResult {
  const errors: Partial<Record<keyof NormalizedPersonRecord, string>> = {}
  const warnings: string[] = []
  const firstName = normalizeName(input.firstName)
  if (!firstName) errors.firstName = 'יש להזין שם פרטי (אותיות בלבד, עד 60 תווים)'
  const lastName = normalizeName(input.lastName)
  if (!lastName) errors.lastName = 'יש להזין שם משפחה (אותיות בלבד, עד 60 תווים)'
  const date = parseDateOnly(input.birthDate)
  if (!date) errors.birthDate = 'יש להזין תאריך לידה תקין'
  else if (date.getUTCFullYear() < 1900 || date.getTime() > Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) errors.birthDate = 'תאריך הלידה אינו סביר'
  const role = input.role === 'STUDENT' || input.role === 'TEACHER' ? input.role : null
  if (!role) errors.role = 'יש לבחור תלמיד או מורה'
  const gender = normalizeGender(input.gender)
  if (gender === 'invalid') errors.gender = 'מגדר לא מוכר'

  let externalId: string | null = null
  if (input.externalId !== undefined && input.externalId !== null && String(input.externalId).trim() !== '') {
    externalId = typeof input.externalId === 'string' ? input.externalId : null
    if (externalId === null) errors.externalId = 'יש להזין מזהה כטקסט'
  }

  let grade: string | null = null, parallel: number | null = null, className: string | null = null
  if (role === 'STUDENT') {
    if (input.grade !== undefined && input.grade !== null && String(input.grade).trim() !== '') {
      grade = normalizeGrade(input.grade)
      if (!grade) errors.grade = 'שכבה לא מוכרת'
    }
    if (input.parallel !== undefined && input.parallel !== null && String(input.parallel).trim() !== '') {
      parallel = normalizeParallel(input.parallel)
      if (parallel === null) errors.parallel = 'מקבילה צריכה להיות מספר בין 1 ל־99'
    }
    const given = typeof input.className === 'string' ? input.className : null
    className = displayClass(grade, parallel, given)
    if (!grade) warnings.push('לא צוינה שכבה')
  }

  if (Object.keys(errors).length) return { ok: false, errors }
  return {
    ok: true, warnings,
    record: { externalId, firstName: firstName!, lastName: lastName!, birthDate: formatDateOnly(date!), gender: gender as Gender | null, role: role!, grade, parallel, className },
  }
}
