import { inflateRawSync } from 'node:zlib'
import { posix } from 'node:path'

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
  // A 3,000-row export with 60 columns is about 5–13MB of sheet XML; anything beyond costs memory and CPU only.
  entryBytes: 12 * 1024 * 1024,
  totalBytes: 24 * 1024 * 1024,
  sheets: 30,
  rows: 5_000, // worksheet row numbers; an import holds at most 3,000 data rows
  columns: 60,
  cellText: 1_000,
}

export type Cell =
  | { kind: 'text'; text: string; formula: boolean }
  | { kind: 'number'; num: number; format: string | null; formula: boolean }
  | { kind: 'bool'; value: boolean; formula: boolean }
  | { kind: 'error'; formula: boolean }

/** truncated: the sheet has content beyond the row limit (its rows were not read). */
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
// Elements are found with indexOf scans, never with backtracking regular expressions over a whole
// part: every scan is linear in the part's size, so a malformed part (thousands of unclosed tags)
// fails fast instead of keeping the server busy for minutes.

const MALFORMED = 'הקובץ פגום או אינו קובץ Excel תקין.'

/** A part prepared for scanning: no DTD (Excel never writes one), element prefixes removed. */
function prepareXml(xml: string): string {
  if (/<!(?:DOCTYPE|ENTITY)/i.test(xml)) throw new XlsxError('הקובץ מכיל הגדרות XML שאינן נתמכות. שמרו אותו מחדש ב־Excel ונסו שוב.')
  // <x:row> (OpenXML SDK and other generators) → <row>; attributes such as r:id are left untouched.
  const prefixed = /<(\/?)[A-Za-z_][\w.-]*:(?=[A-Za-z_])/
  return prefixed.test(xml) ? xml.replace(new RegExp(prefixed.source, 'g'), '<$1') : xml
}

type El = { attrs: string; body: string }

/** The `tag` elements in xml[from, to): attributes and inner content. Nested same-name elements are not expected. */
function* elements(xml: string, tag: string, from = 0, to = xml.length): Generator<El> {
  const open = '<' + tag, close = '</' + tag + '>'
  let i = xml.indexOf(open, from)
  while (i >= 0 && i < to) {
    const next = xml.charCodeAt(i + open.length)
    // "<c" must not match "<col" / "<cols"
    if (!(next === 32 || next === 9 || next === 10 || next === 13 || next === 62 || next === 47)) { i = xml.indexOf(open, i + 1); continue }
    const gt = xml.indexOf('>', i + open.length)
    if (gt < 0 || gt >= to) throw new XlsxError(MALFORMED)
    if (xml.charCodeAt(gt - 1) === 47) {
      yield { attrs: xml.slice(i + open.length, gt - 1), body: '' }
      i = xml.indexOf(open, gt + 1)
      continue
    }
    const end = xml.indexOf(close, gt + 1)
    if (end < 0 || end + close.length > to) throw new XlsxError(MALFORMED)
    yield { attrs: xml.slice(i + open.length, gt), body: xml.slice(gt + 1, end) }
    i = xml.indexOf(open, end + close.length)
  }
}

/** The first `tag` element's content, or undefined. */
const first = (xml: string, tag: string) => {
  const open = '<' + tag + '>', start = xml.indexOf(open)
  if (start < 0) return undefined
  const end = xml.indexOf('</' + tag + '>', start + open.length)
  if (end < 0) throw new XlsxError(MALFORMED)
  return xml.slice(start + open.length, end)
}

function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (_, e: string) => {
    if (e === 'lt') return '<'; if (e === 'gt') return '>'; if (e === 'amp') return '&'; if (e === 'quot') return '"'; if (e === 'apos') return "'"
    const code = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
  })
}
const attrPatterns = new Map<string, RegExp>()
const attr = (attrs: string, name: string) => {
  let re = attrPatterns.get(name)
  if (!re) attrPatterns.set(name, re = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`))
  const m = re.exec(attrs)
  return m ? decodeXml(m[1] ?? m[2]) : undefined
}
/** The text of a rich or plain string (<t> runs), without phonetic guides (<rPh>). */
function texts(xml: string): string {
  const kept: string[] = []
  let last = 0, at = xml.indexOf('<rPh')
  while (at >= 0) {
    const end = xml.indexOf('</rPh>', at)
    if (end < 0) throw new XlsxError(MALFORMED)
    kept.push(xml.slice(last, at))
    last = end + 6
    at = xml.indexOf('<rPh', last)
  }
  kept.push(xml.slice(last))
  return [...elements(kept.join(''), 't')].map(e => decodeXml(e.body)).join('')
}

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
  for (const fmts of elements(xml, 'numFmts')) for (const f of elements(fmts.body, 'numFmt')) {
    const id = Number(attr(f.attrs, 'numFmtId')), code = attr(f.attrs, 'formatCode')
    if (Number.isFinite(id) && code !== undefined) custom.set(id, code)
  }
  const xfs = elements(xml, 'cellXfs').next().value?.body ?? ''
  return [...elements(xfs, 'xf')].map(x => {
    const id = Number(attr(x.attrs, 'numFmtId') ?? 0)
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

// Parsing is written as generators that yield at regular points ("steps"): readXlsx runs them to the
// end at once, readXlsxAsync gives the event loop back every few milliseconds, so a large file never
// stops the server from answering other requests (TV screens) while it is read.
type Steps<T> = Generator<void, T, void>
const STEP_ROWS = 50

function* readSheet(xml: string, shared: string[], styles: (string | null)[]): Steps<{ rows: (Cell | undefined)[][]; truncated: boolean }> {
  const rows: (Cell | undefined)[][] = []
  let truncated = false, n = 0
  const data = elements(xml, 'sheetData').next().value?.body ?? ''
  for (const rm of elements(data, 'row')) {
    if (++n % STEP_ROWS === 0) yield
    const r = Number(attr(rm.attrs, 'r') ?? rows.length + 1) - 1
    if (!Number.isInteger(r) || r < 0) continue
    const cells = readRow(rm.body, shared, styles)
    // Past the limit: rows without values (formatting, formulas showing "") are skipped; content stops the read.
    if (r >= XLSX_LIMITS.rows) {
      if (cells.some(c => c && !(c.kind === 'text' && c.text.trim() === ''))) { truncated = true; break }
      continue
    }
    rows[r] = cells
  }
  return { rows, truncated }
}

function readRow(rowXml: string, shared: string[], styles: (string | null)[]): (Cell | undefined)[] {
  const cells: (Cell | undefined)[] = []
  for (const cm of elements(rowXml, 'c')) {
    const ref = attr(cm.attrs, 'r')
    const c = ref ? colIndex(ref) : cells.length
    if (c < 0 || c >= XLSX_LIMITS.columns) continue
    const body = cm.body
    const formula = body.includes('<f>') || body.includes('<f ') || body.includes('<f/')
    const t = attr(cm.attrs, 't') ?? 'n'
    const v = first(body, 'v')
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
      const s = Number(attr(cm.attrs, 's') ?? 0)
      cell = Number.isFinite(num) ? { kind: 'number', num, format: styles[s] ?? null, formula } : undefined
    }
    if (cell && !(cell.kind === 'text' && cell.text.trim() === '' && !formula)) cells[c] = cell
  }
  return cells
}

type ReadOptions = { onlySheet?: number }

/** Reads the worksheets of an .xlsx file (cell values only); with `onlySheet`, the other sheets are listed by name only. */
export function readXlsx(buf: Buffer, opts: ReadOptions = {}): Workbook {
  const steps = workbookSteps(buf, opts)
  for (;;) { const r = steps.next(); if (r.done) return r.value }
}

/** As readXlsx, giving the event loop back at least every `sliceMs` milliseconds of work. */
export async function readXlsxAsync(buf: Buffer, opts: ReadOptions = {}, sliceMs = 10): Promise<Workbook> {
  const steps = workbookSteps(buf, opts)
  let start = performance.now()
  for (;;) {
    const r = steps.next()
    if (r.done) return r.value
    if (performance.now() - start >= sliceMs) {
      await new Promise<void>(resolve => setImmediate(resolve))
      start = performance.now()
    }
  }
}

function* workbookSteps(buf: Buffer, opts: ReadOptions): Steps<Workbook> {
  if (buf.length > XLSX_LIMITS.fileBytes) throw new XlsxError('הקובץ גדול מדי (עד 5MB).')
  const entries = zipEntries(buf)
  if ([...entries.keys()].some(n => /vbaProject\.bin$/i.test(n))) throw new XlsxError('קבצים עם מאקרו (xlsm) אינם נתמכים. שמרו כ־xlsx רגיל ונסו שוב.')
  const budget = { left: XLSX_LIMITS.totalBytes }
  const part = (name: string) => { const e = entries.get(name); return e ? prepareXml(readEntry(buf, e, budget)) : null }
  const workbook = part('xl/workbook.xml')
  if (!workbook) throw new XlsxError('הקובץ אינו חוברת Excel תקינה.')
  const rels = part('xl/_rels/workbook.xml.rels') ?? ''
  const targets = new Map<string, string>()
  for (const rel of elements(rels, 'Relationship')) {
    const id = attr(rel.attrs, 'Id'), target = attr(rel.attrs, 'Target')
    // External targets (links to other files or URLs) are never followed; only parts inside this file.
    if (!id || !target || attr(rel.attrs, 'TargetMode') === 'External') continue
    const inside = posix.normalize(target.startsWith('/') ? target.slice(1) : `xl/${target}`)
    if (!inside.startsWith('..')) targets.set(id, inside)
  }
  const sharedXml = part('xl/sharedStrings.xml')
  const shared: string[] = []
  if (sharedXml) for (const si of elements(sharedXml, 'si')) { shared.push(texts(si.body)); if (shared.length % 500 === 0) yield }
  yield
  const styles = readStyles(part('xl/styles.xml'))
  const pr = elements(workbook, 'workbookPr').next().value
  const date1904 = !!pr && ['1', 'true'].includes(attr(pr.attrs, 'date1904') ?? '')
  const sheetTags: string[] = []
  for (const s of elements(workbook, 'sheet')) {
    if (sheetTags.length >= XLSX_LIMITS.sheets) throw new XlsxError('בקובץ יש יותר מדי גיליונות.')
    sheetTags.push(s.attrs)
  }
  if (!sheetTags.length) throw new XlsxError('לא נמצאו גיליונות בקובץ.')
  const sheets: Sheet[] = []
  for (const tag of sheetTags) {
    const name = attr(tag, 'name') ?? `גיליון ${sheets.length + 1}`
    const rid = attr(tag, 'r:id') ?? /(?:^|\s)[\w.-]+:id\s*=\s*"([^"]*)"/.exec(tag)?.[1]
    const target = rid ? targets.get(rid) : undefined
    const wanted = opts.onlySheet === undefined || opts.onlySheet === sheets.length
    const xml = target && wanted ? part(target) : null
    if (!xml) { sheets.push({ name, rows: [], truncated: false }); continue }
    yield
    sheets.push({ name, ...(yield* readSheet(xml, shared, styles)) })
  }
  return { sheets, date1904 }
}
