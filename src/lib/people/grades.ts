// Grades (שכבות) and classes of students. Sources write grades in many ways ("ט", "ט'", "ט׳", "9",
// "יא", "י\"א", "י״א"); they are stored in one canonical form so filters and display agree.

const LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י', 'יא', 'יב', 'יג', 'יד']

/** Canonical grade ("ט׳", "י״א"), or null when empty or not recognized. */
export function normalizeGrade(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null
  let v = String(raw).trim()
  if (!v) return null
  if (/^\d{1,2}$/.test(v)) {
    const n = Number(v)
    return n >= 1 && n <= LETTERS.length ? canonical(LETTERS[n - 1]) : null
  }
  v = v.replace(/^שכבה\s*/, '').replace(/["'׳״`\s]/g, '')
  return LETTERS.includes(v) ? canonical(v) : null
}

function canonical(letters: string): string {
  return letters.length === 1 ? `${letters}׳` : `${letters[0]}״${letters.slice(1)}`
}

/** Grade order for sorting (א׳ = 1 … י״ד = 14); unknown grades last. */
export function gradeOrder(grade: string | null | undefined): number {
  if (!grade) return 99
  const i = LETTERS.indexOf(grade.replace(/[׳״]/g, ''))
  return i < 0 ? 99 : i + 1
}

/** A parallel number 1–99, or null. */
export function normalizeParallel(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim())
  return Number.isInteger(n) && n >= 1 && n <= 99 ? n : null
}

/** The display class: the source's own text when given, else "<grade> <parallel>", else the grade. */
export function displayClass(grade: string | null, parallel: number | null, given?: string | null): string | null {
  const text = given?.trim()
  if (text) return text.slice(0, 40)
  if (grade && parallel) return `${grade} ${parallel}`
  return grade
}
