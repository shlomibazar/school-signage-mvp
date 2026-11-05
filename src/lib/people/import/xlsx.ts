import { inflateRawSync } from 'node:zlib'

// A minimal, read-only .xlsx reader for the people import (server only, no dependencies).
//
// An .xlsx file is a zip archive of XML parts. Only the parts needed for cell values are read
// (workbook, its relationships, shared strings, styles and the worksheets). Security properties:
// - Nothing is executed: formulas are never evaluated (a formula cell is flagged, and only the value
//   Excel cached in the file is read); macro-enabled workbooks are rejected.
// - Bounded work: file size, number of zip entries, declared and actual decompressed sizes (inflate
//   stops at the limit — "zip bombs"), sheets, rows, columns and cell text are all capped.
// - Only stored and deflated entries; encrypted, zip64 and legacy .xls files are rejected.
// Errors carry fixed Hebrew messages; file content never appears in them.

export class XlsxError extends Error {}

export const XLSX_LIMITS = {
  fileBytes: 5 * 1024 * 1024,
  entries: 400,
  entryBytes: 25 * 1024 * 1024,
  totalBytes: 60 * 1024 * 1024,
  sheets: 30,
  rows: 10_000,
  columns: 60,
  cellText: 1_000,
}

export type Cell =
  | { kind: 'text'; text: string; formula: boolean }
  | { kind: 'number'; num: number; format: string | null; formula: boolean }
  | { kind: 'bool'; value: boolean; formula: boolean }
  | { kind: 'error'; formula: boolean }

export type Sheet = { name: string; rows: (Cell | undefined)[][]; truncated: boolean }
export type Workbook = { sheets: Sheet[]; date1904: boolean }

// ── zip ─────────────────────────────────────────────────────────────────────────────────────

type Entry = { name: string; method: number; compressed: number; size: number; offset: number; flags: number }

function zipEntries(buf: Buffer): Map<string, Entry> {
  if (buf.length >= 8 && buf.readUInt32BE(0) === 0xd0cf11e0) throw new XlsxError('זהו קובץ Excel ישן (xls). שמרו אותו מחדש בפורמט xlsx ונסו שוב.')
  if (buf.length < 22 || buf.readUInt32LE(0) !== 0x04034b50) throw new XlsxError('הקובץ אינו קובץ Excel תקין (xlsx).')
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new XlsxError('הקובץ פגום או אינו קובץ Excel תקין.')
  const count = buf.readUInt16LE(eocd + 10)
  const cdSize = buf.readUInt32LE(eocd + 12), cdOffset = buf.readUInt32LE(eocd + 16)
  if (count === 0xffff || cdOffset === 0xffffffff) throw new XlsxError('הקובץ גדול או מורכב מדי לייבוא.')
  if (count > XLSX_LIMITS.entries) throw new XlsxError('הקובץ מורכב מדי לייבוא.')
  if (cdOffset + cdSize > buf.length) throw new XlsxError('הקובץ פגום או אינו קובץ Excel תקין.')
  const out = new Map<string, Entry>()
  let p = cdOffset
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new XlsxError('הקובץ פגום או אינו קובץ Excel תקין.')
    const flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10)
    const compressed = buf.readUInt32LE(p + 20), size = buf.readUInt32LE(p + 24)
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32)
    const offset = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen).replace(/^\/+/, '')
    if (flags & 1) throw new XlsxError('קבצים מוגנים בסיסמה אינם נתמכים. הסירו את ההגנה ונסו שוב.')
    out.set(name, { name, method, compressed, size, offset, flags })
    p += 46 + nameLen + extraLen + commentLen
  }
  return out
}

function readEntry(buf: Buffer, e: Entry, budget: { left: number }): string {
  if (e.size > XLSX_LIMITS.entryBytes || e.size > budget.left) throw new XlsxError('הקובץ גדול מדי לייבוא.')
  if (e.offset + 30 > buf.length || buf.readUInt32LE(e.offset) !== 0x04034b50) throw new XlsxError('הקובץ פגום או אינו קובץ Excel תקין.')
  const start = e.offset + 30 + buf.readUInt16LE(e.offset + 26) + buf.readUInt16LE(e.offset + 28)
  if (start + e.compressed > buf.length) throw new XlsxError('הקובץ פגום או אינו קובץ Excel תקין.')
  const data = buf.subarray(start, start + e.compressed)
  let raw: Buffer
  if (e.method === 0) raw = data
  else if (e.method === 8) {
    // Inflate never produces more than the remaining budget, whatever the header claims.
    try { raw = inflateRawSync(data, { maxOutputLength: Math.min(XLSX_LIMITS.entryBytes, budget.left) }) }
    catch { throw new XlsxError('הקובץ פגום, גדול מדי או אינו קובץ Excel תקין.') }
  } else throw new XlsxError('הקובץ דחוס בשיטה שאינה נתמכת.')
  budget.left -= raw.length
  return raw.toString('utf8')
}

// ── xml helpers (the parts have a fixed, known schema) ─────────────────────────────────────────

function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (_, e: string) => {
    if (e === 'lt') return '<'; if (e === 'gt') return '>'; if (e === 'amp') return '&'; if (e === 'quot') return '"'; if (e === 'apos') return "'"
    const code = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
  })
}
const attr = (tag: string, name: string) => {
  const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(tag)
  return m ? decodeXml(m[1]) : undefined
}
const texts = (xml: string) => [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(m => decodeXml(m[1])).join('')

// Built-in number formats that show dates (ECMA-376 + common locale ids).
const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 22, 27, 28, 29, 30, 31, 34, 35, 36, 50, 51, 52, 53, 54, 57, 58, 71, 72, 73, 74, 75])
const BUILTIN_FORMAT_CODES: Record<number, string> = { 14: 'd/m/yyyy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 22: 'd/m/yyyy h:mm' }

/** True when a number format displays a calendar date (not a time-only format). */
export function isDateFormat(code: string | null): boolean {
  if (!code) return false
  const bare = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '').replace(/_./g, '').toLowerCase()
  return /[dy]/.test(bare) || /m{3,}/.test(bare)
}

function readStyles(xml: string | null): (string | null)[] {
  if (!xml) return []
  const custom = new Map<number, string>()
  for (const m of xml.matchAll(/<numFmt\b[^>]*\/?>/g)) {
    const id = Number(attr(m[0], 'numFmtId')), code = attr(m[0], 'formatCode')
    if (Number.isFinite(id) && code !== undefined) custom.set(id, code)
  }
  const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)?.[1] ?? ''
  return [...xfs.matchAll(/<xf\b[^>]*\/?>/g)].map(m => {
    const id = Number(attr(m[0], 'numFmtId') ?? 0)
    if (custom.has(id)) return custom.get(id)!
    if (BUILTIN_DATE_FORMATS.has(id)) return BUILTIN_FORMAT_CODES[id] ?? 'd/m/yyyy'
    return id === 49 ? '@' : null
  })
}

const colIndex = (ref: string) => {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? ''
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function readSheet(xml: string, shared: string[], styles: (string | null)[]): { rows: (Cell | undefined)[][]; truncated: boolean } {
  const rows: (Cell | undefined)[][] = []
  let truncated = false
  for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const r = Number(attr(rm[1], 'r') ?? rows.length + 1) - 1
    if (!Number.isInteger(r) || r < 0) continue
    if (r >= XLSX_LIMITS.rows) { truncated = true; break }
    const cells: (Cell | undefined)[] = []
    for (const cm of (rm[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(cm[1], 'r')
      const c = ref ? colIndex(ref) : cells.length
      if (c < 0 || c >= XLSX_LIMITS.columns) continue
      const body = cm[2] ?? ''
      const formula = /<f\b/.test(body)
      const t = attr(cm[1], 't') ?? 'n'
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1]
      const clip = (s: string) => (s.length > XLSX_LIMITS.cellText ? s.slice(0, XLSX_LIMITS.cellText) : s)
      let cell: Cell | undefined
      if (t === 's') { const i = Number(v); cell = Number.isInteger(i) && i >= 0 && i < shared.length ? { kind: 'text', text: clip(shared[i]), formula } : undefined }
      else if (t === 'inlineStr') cell = { kind: 'text', text: clip(texts(body)), formula }
      else if (t === 'str') cell = v === undefined ? undefined : { kind: 'text', text: clip(decodeXml(v)), formula }
      else if (t === 'b') cell = { kind: 'bool', value: v === '1', formula }
      else if (t === 'e') cell = { kind: 'error', formula }
      else if (t === 'd') cell = v === undefined ? undefined : { kind: 'text', text: clip(decodeXml(v)), formula }
      else if (v !== undefined && v.trim() !== '') {
        const num = Number(v)
        const s = Number(attr(cm[1], 's') ?? 0)
        cell = Number.isFinite(num) ? { kind: 'number', num, format: styles[s] ?? null, formula } : undefined
      }
      if (cell && !(cell.kind === 'text' && cell.text.trim() === '' && !formula)) cells[c] = cell
    }
    rows[r] = cells
  }
  return { rows, truncated }
}

/** Reads all worksheets of an .xlsx file (cell values only). */
export function readXlsx(buf: Buffer): Workbook {
  if (buf.length > XLSX_LIMITS.fileBytes) throw new XlsxError('הקובץ גדול מדי (עד 5MB).')
  const entries = zipEntries(buf)
  if ([...entries.keys()].some(n => /vbaProject\.bin$/i.test(n))) throw new XlsxError('קבצים עם מאקרו (xlsm) אינם נתמכים. שמרו כ־xlsx רגיל ונסו שוב.')
  const budget = { left: XLSX_LIMITS.totalBytes }
  const part = (name: string) => { const e = entries.get(name); return e ? readEntry(buf, e, budget) : null }
  const workbook = part('xl/workbook.xml')
  if (!workbook) throw new XlsxError('הקובץ אינו חוברת Excel תקינה.')
  const rels = part('xl/_rels/workbook.xml.rels') ?? ''
  const targets = new Map<string, string>()
  for (const m of rels.matchAll(/<Relationship\b[^>]*\/?>/g)) {
    const id = attr(m[0], 'Id'), target = attr(m[0], 'Target')
    if (id && target) targets.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`)
  }
  const sharedXml = part('xl/sharedStrings.xml')
  const shared = sharedXml ? [...sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\s*\/>/g)].map(m => texts(m[1] ?? '')) : []
  const styles = readStyles(part('xl/styles.xml'))
  const date1904 = /<workbookPr\b[^>]*\bdate1904="(1|true)"/.test(workbook)
  const sheetTags = [...workbook.matchAll(/<sheet\b[^>]*\/?>/g)].map(m => m[0])
  if (!sheetTags.length) throw new XlsxError('לא נמצאו גיליונות בקובץ.')
  if (sheetTags.length > XLSX_LIMITS.sheets) throw new XlsxError('בקובץ יש יותר מדי גיליונות.')
  const sheets: Sheet[] = []
  for (const tag of sheetTags) {
    const name = attr(tag, 'name') ?? `גיליון ${sheets.length + 1}`
    const rid = attr(tag, 'r:id') ?? /\bid="([^"]*)"/.exec(tag)?.[1]
    const target = rid ? targets.get(rid) : undefined
    const xml = target ? part(target) : null
    if (!xml) { sheets.push({ name, rows: [], truncated: false }); continue }
    sheets.push({ name, ...readSheet(xml, shared, styles) })
  }
  return { sheets, date1904 }
}
