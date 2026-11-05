import type { Cell } from './xlsx'
import { isDateFormat } from './xlsx'
import { normalizeExternalId } from '../identity'
import { parseDateOnly, formatDateOnly } from '../birthdays'

// Spreadsheet cell values → import values. Every conversion either succeeds, or returns a Hebrew
// error; uncertain conversions add a warning that the preview shows. Nothing is guessed silently.

export type Converted<T> = { value: T | null; error?: string; warning?: string }

export function textOf(c: Cell | undefined): string {
  if (!c) return ''
  if (c.kind === 'text') return c.text.trim()
  if (c.kind === 'number') return Number.isInteger(c.num) ? String(c.num) : String(c.num)
  if (c.kind === 'bool') return c.value ? 'TRUE' : 'FALSE'
  return ''
}

/**
 * The identifier of a row. Text cells are used as typed (leading zeros kept). A number cell may
 * have lost leading zeros when it was typed: it is accepted only when its number format pads it
 * ("000000000" — the shown value is then known) or when it already has 9 digits or more; otherwise
 * the row must be corrected in the file. Digits are never added by guessing.
 */
export function idOf(c: Cell | undefined): Converted<string> {
  if (!c) return { value: null }
  if (c.formula) return { value: null, error: 'המזהה מחושב בנוסחה. יש להזין בתא ערך קבוע.' }
  if (c.kind === 'text') {
    if (!c.text.trim()) return { value: null }
    const v = normalizeExternalId(c.text)
    return v ? { value: v } : { value: null, error: 'המזהה אינו תקין (ספרות ואותיות לטיניות בלבד, עד 20 תווים)' }
  }
  if (c.kind === 'number') {
    if (!Number.isSafeInteger(c.num) || c.num < 0) return { value: null, error: 'המזהה אינו תקין' }
    const digits = String(c.num)
    const pad = c.format && /^0+$/.test(c.format) ? c.format.length : 0
    if (pad > digits.length) return { value: digits.padStart(pad, '0') }
    if (digits.length >= 9) return { value: digits }
    return { value: null, error: 'המזהה נשמר בתא מספרי, ולכן ייתכן שנמחקו ממנו אפסים מובילים. יש לתקן בקובץ (לעצב את העמודה כטקסט ולהקליד את המזהה המלא).' }
  }
  return { value: null, error: 'המזהה אינו תקין' }
}

/** Excel serial date → "YYYY-MM-DD" (calendar arithmetic in UTC, no time-zone shift). */
export function serialToDate(serial: number, date1904: boolean): string | null {
  const days = Math.floor(serial)
  if (!Number.isFinite(days) || days < 1) return null
  let ms: number
  if (date1904) ms = Date.UTC(1904, 0, 1) + days * 86_400_000
  else {
    if (days === 60) return null // 29.2.1900 does not exist (Excel's 1900 leap-year bug)
    ms = (days < 60 ? Date.UTC(1899, 11, 31) : Date.UTC(1899, 11, 30)) + days * 86_400_000
  }
  return formatDateOnly(new Date(ms))
}

/**
 * The birth date of a row, as "YYYY-MM-DD". Accepts date cells, Excel serial numbers, D/M/YYYY,
 * D.M.YYYY, D-M-YYYY (day first, as written in Israel) and YYYY-MM-DD. A day/month order that could
 * also be read the other way is accepted with a warning; two-digit years are rejected.
 */
export function dateOf(c: Cell | undefined, date1904: boolean): Converted<string> {
  if (!c) return { value: null }
  if (c.kind === 'number') {
    const v = serialToDate(c.num, date1904)
    if (!v) return { value: null, error: 'תאריך הלידה אינו תקין' }
    return isDateFormat(c.format) ? { value: v } : { value: v, warning: 'התא מכיל מספר ולא תאריך; פורש כתאריך של Excel' }
  }
  if (c.kind !== 'text') return { value: null, error: 'תאריך הלידה אינו תקין' }
  const s = c.text.trim()
  if (!s) return { value: null }
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(s)
  if (m) return checked(Number(m[1]), Number(m[2]), Number(m[3]))
  m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/.exec(s)
  if (!m) return { value: null, error: 'תאריך הלידה אינו בפורמט מוכר (למשל 05/03/2012)' }
  if (m[3].length !== 4) return { value: null, error: 'שנה בשתי ספרות אינה חד־משמעית. יש להזין שנה מלאה (למשל 2012).' }
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const result = checked(year, month, day)
  if (result.value && day <= 12 && month <= 12 && day !== month)
    result.warning = 'התאריך יכול להיקרא בשתי דרכים; פורש כיום/חודש/שנה'
  return result
}

function checked(y: number, mo: number, d: number): Converted<string> {
  const iso = `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  return parseDateOnly(iso) ? { value: iso } : { value: null, error: 'תאריך הלידה אינו קיים בלוח השנה' }
}
