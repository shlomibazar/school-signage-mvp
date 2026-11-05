import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { readXlsx, XlsxError, XLSX_LIMITS, isDateFormat } from '@/lib/people/import/xlsx'
import { detectColumns, validateMapping, fieldForHeader } from '@/lib/people/import/columns'
import { idOf, dateOf, serialToDate } from '@/lib/people/import/cells'
import { buildRows, canonicalClass } from '@/lib/people/import/rows'
import { planImport, planHash, summarize, type ExistingPerson, type PlanInputRow } from '@/lib/people/import/plan'
import { workbook, zip } from './helpers/xlsxBuilder'

const fixture = (f: string) => fs.readFileSync(path.join(process.cwd(), 'tests', 'fixtures', 'import', f))
const NOW = new Date('2026-11-05T10:00:00Z')

// ── Real Excel files (made by Excel, synthetic data) ───────────────────────────────────────────

test('students file made by Excel: sheets, header row below a title, columns by name in any order', () => {
  const wb = readXlsx(fixture('students-sample.xlsx'))
  assert.deepEqual(wb.sheets.map(s => s.name), ['תלמידים', 'הערות'])
  const c = detectColumns(wb.sheets[0], 'STUDENT')
  assert.equal(c.headerRow, 2)
  assert.deepEqual(c.mapping, { firstName: 1, lastName: 2, className: 3, grade: 4, parallel: 5, birthDate: 6, externalId: 7, gender: 8 })
  assert.equal(detectColumns(wb.sheets[1], 'STUDENT').headerRow, -1, 'a sheet without headers is not mistaken for data')
})

test('students file: every row converted or flagged as expected (no guessing)', () => {
  const wb = readXlsx(fixture('students-sample.xlsx'))
  const c = detectColumns(wb.sheets[0], 'STUDENT')
  const { rows } = buildRows(wb.sheets[0], c.headerRow, c.mapping, 'STUDENT', wb.date1904, NOW)
  const by = (name: string) => rows.find(r => r.firstName === name)!
  const err = (name: string) => by(name).issues.filter(i => i.level === 'error').map(i => i.field)
  const warn = (name: string) => by(name).issues.filter(i => i.level === 'warning').map(i => i.field)
  assert.equal(rows.length, 13, 'the empty row is skipped')
  assert.deepEqual(by('נועה').record, { externalId: '012345678', firstName: 'נועה', lastName: 'בדיקה', birthDate: '2011-03-05', gender: 'FEMALE', role: 'STUDENT', grade: 'ט׳', parallel: 2, className: 'ט׳ 2' })
  assert.equal(by('איתי').record?.externalId, '123456782', 'a 9-digit number cell is accepted')
  assert.equal(by('איתי').record?.birthDate, '2011-11-30')
  assert.deepEqual(err('מאיה'), ['externalId'], 'an 8-digit number cell may have lost a zero: must be fixed in the file')
  assert.equal(by('יונתן').record?.externalId, '001234567', 'a zero-padded number format is shown as written')
  assert.deepEqual(warn('יונתן'), ['birthDate'], '5.3.2012 could be read both ways: accepted with a warning')
  assert.equal(by('יונתן').record?.birthDate, '2012-03-05', 'day first')
  assert.equal(by('תמר').record?.birthDate, '2013-04-07')
  assert.equal(by('תמר').record?.gender, null, 'missing gender stays empty')
  assert.deepEqual(err('שירה'), ['birthDate'], '31/02 does not exist')
  assert.deepEqual(err('דניאל'), ['birthDate'], 'two-digit year rejected')
  assert.deepEqual(err('עומר'), ['externalId'], 'no identifier: not importable')
  assert.deepEqual(warn('גל'), ['firstName'], 'formula: cached value, flagged')
  assert.equal(by('הילה').record?.birthDate, '2008-02-29')
  assert.equal(by('הילה').record?.className, 'י״א 1')
  assert.equal(rows.filter(r => r.record?.externalId === '666777888').length, 2, 'duplicates are left to the plan')
  assert.equal(by('נועה').line, 4, 'spreadsheet line numbers')
})

test('teachers file made by Excel: other spellings (ת"ז, מין), no class fields', () => {
  const wb = readXlsx(fixture('teachers-sample.xlsx'))
  const c = detectColumns(wb.sheets[0], 'TEACHER')
  assert.deepEqual(c.mapping, { externalId: 0, lastName: 1, firstName: 2, birthDate: 3, gender: 4 })
  const { rows } = buildRows(wb.sheets[0], c.headerRow, c.mapping, 'TEACHER', wb.date1904, NOW)
  assert.deepEqual(rows.map(r => [r.record?.externalId, r.record?.birthDate, r.record?.gender, r.record?.className]), [
    ['012345678', '1985-01-20', 'FEMALE', null], ['901234567', '1979-12-31', 'FEMALE', null], ['902345678', '1990-08-15', 'MALE', null],
  ])
})

// ── Cells ────────────────────────────────────────────────────────────────────────────────────

test('dates: Excel serials (1900 bug, 1904 system), formats, text forms', () => {
  assert.equal(serialToDate(59, false), '1900-02-28')
  assert.equal(serialToDate(60, false), null, '29.2.1900 does not exist')
  assert.equal(serialToDate(61, false), '1900-03-01')
  assert.equal(serialToDate(40607, false), '2011-03-05')
  assert.equal(serialToDate(39507.75, false), '2008-02-29', 'time of day ignored')
  assert.equal(serialToDate(0, true), null)
  assert.equal(serialToDate(39145, true), '2011-03-05') // 1904 system: 1462 days fewer
  const t = (s: string) => dateOf({ kind: 'text', text: s, formula: false }, false)
  assert.deepEqual(t('2011-03-05'), { value: '2011-03-05' })
  assert.deepEqual(t('25/12/2011'), { value: '2011-12-25' }, 'unambiguous: no warning')
  assert.ok(t('05/03/2011').warning)
  assert.deepEqual(t('5/5/2011'), { value: '2011-05-05' }, 'same day and month: not ambiguous')
  assert.ok(t('29/02/2011').error && t('2011-13-01').error && t('05/03/11').error && t('מרץ 2011').error)
  assert.equal(t('29.02.2012').value, '2012-02-29')
  const n = dateOf({ kind: 'number', num: 40607, format: null, formula: false }, false)
  assert.equal(n.value, '2011-03-05'); assert.ok(n.warning, 'a plain number is accepted only with a warning')
  assert.ok(isDateFormat('dd/mm/yyyy') && isDateFormat('d-mmm-yy') && isDateFormat('[$-he-IL]dd.mm.yyyy') && !isDateFormat('h:mm') && !isDateFormat('000000000') && !isDateFormat('"day"0'))
})

test('identifiers: text kept as is; numbers only when no zero can be missing', () => {
  const num = (n: number, format: string | null = null) => idOf({ kind: 'number', num: n, format, formula: false })
  assert.deepEqual(idOf({ kind: 'text', text: '012345678', formula: false }), { value: '012345678' })
  assert.deepEqual(num(123456789), { value: '123456789' })
  assert.ok(num(12345678).error, 'never padded by guessing')
  assert.deepEqual(num(1234567, '000000000'), { value: '001234567' })
  assert.ok(num(12.5).error && num(-1).error)
  assert.ok(idOf({ kind: 'text', text: '12345678', formula: true }).error, 'formula identifiers rejected')
  assert.deepEqual(idOf(undefined), { value: null })
})

test('headers and mappings', () => {
  for (const h of ['ת.ז', 'ת"ז', 'ת״ז', 'תעודת זהות', 'מס\' זהות']) assert.equal(fieldForHeader(h), 'externalId', h)
  for (const h of ['ת. לידה', 'תאריך לידה']) assert.equal(fieldForHeader(h), 'birthDate', h)
  assert.equal(fieldForHeader('מין'), 'gender')
  const headers = [0, 1, 2, 3, 4].map(index => ({ index }))
  assert.deepEqual(validateMapping({ externalId: 0, firstName: 1, lastName: 2, birthDate: 3 }, 'TEACHER', headers).errors, [])
  assert.ok(validateMapping({ externalId: 0, firstName: 0, lastName: 2, birthDate: 3 }, 'TEACHER', headers).errors.length, 'one column, two fields')
  assert.ok(validateMapping({ externalId: 0, firstName: 1, lastName: 2, birthDate: 9 }, 'TEACHER', headers).errors.length, 'unknown column')
  assert.ok(validateMapping({ externalId: 0, firstName: 1, lastName: 2, birthDate: 3, grade: 4 }, 'TEACHER', headers).errors.length, 'teachers have no grade')
  assert.ok(validateMapping({ externalId: 0, firstName: 1, lastName: 2, birthDate: 3, schoolId: 4 }, 'STUDENT', headers).errors.length, 'unknown field (mass assignment)')
  assert.ok(validateMapping({ firstName: 1, lastName: 2, birthDate: 3 }, 'STUDENT', headers).errors.some(e => e.includes('ת.ז')), 'identifier column required')
  assert.ok(validateMapping('x', 'STUDENT', headers).errors.length && validateMapping([1], 'STUDENT', headers).errors.length)
  assert.deepEqual(canonicalClass("ט' 2"), { text: 'ט׳ 2', grade: 'ט׳', parallel: 2 })
  assert.equal(canonicalClass('ט׳ מופת').text, 'ט׳ מופת')
})

test('column order does not matter; numbers, dates and padded numbers from generated files', () => {
  const file = workbook([{ name: 'גיליון1', rows: [
    ['תאריך לידה', 'מגדר', 'שם משפחה', 'ת.ז', 'שם פרטי'],
    [{ n: 40607, fmt: 'date' }, 'ז', 'בדיקה', { n: 1234567, fmt: 'pad9' }, 'אבי'],
    ['2011-03-05', null, 'בדיקה', '000000018', 'בני'],
  ] }])
  const wb = readXlsx(file)
  const c = detectColumns(wb.sheets[0], 'TEACHER')
  const { rows } = buildRows(wb.sheets[0], c.headerRow, c.mapping, 'TEACHER', wb.date1904, NOW)
  assert.deepEqual(rows.map(r => [r.record?.firstName, r.record?.externalId, r.record?.birthDate, r.record?.gender]), [['אבי', '001234567', '2011-03-05', 'MALE'], ['בני', '000000018', '2011-03-05', null]])
})

// ── Malicious and broken files ───────────────────────────────────────────────────────────────

test('malformed and malicious files are rejected with Hebrew messages', () => {
  const rejects = (buf: Buffer, label: string) => assert.throws(() => readXlsx(buf), (e: unknown) => e instanceof XlsxError && /[֐-׿]/.test(e.message), label)
  rejects(Buffer.from('not a spreadsheet at all, just text'), 'plain text')
  rejects(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), 'legacy .xls')
  const good = workbook([{ name: 'a', rows: [['שם פרטי', 'שם משפחה']] }])
  rejects(good.subarray(0, good.length - 30), 'truncated zip')
  rejects(zip([{ name: 'xl/workbook.xml', data: '<workbook/>' }]), 'no sheets')
  rejects(zip([{ name: 'other.txt', data: 'x' }]), 'not a workbook')
  rejects(workbook([{ name: 'a', rows: [] }], [{ name: 'xl/vbaProject.bin', data: 'macro' }]), 'macro-enabled')
  rejects(zip([{ name: 'xl/workbook.xml', data: '<workbook/>', flags: 1 }]), 'encrypted entry')
  rejects(workbook(Array.from({ length: 31 }, (_, i) => ({ name: `s${i}`, rows: [] }))), 'too many sheets')
  // A "zip bomb": 40MB of zeros compressed to a few KB, declared as small. Inflate stops at the limit.
  const bomb = zip([{ name: 'xl/workbook.xml', data: Buffer.alloc(40 * 1024 * 1024, 0x20), declaredSize: 100 }])
  assert.ok(bomb.length < 200_000)
  rejects(bomb, 'zip bomb')
  rejects(Buffer.alloc(6 * 1024 * 1024, 0x50), 'over 5MB')
})

test('XML entities, formulas and huge cells', () => {
  const wb = readXlsx(workbook([{ name: 'a&b', rows: [['שם &amp; פרטי', { f: 'HYPERLINK("http://x")', v: 'x' }, 'א'.repeat(5000)]] }]))
  assert.equal(wb.sheets[0].name, 'a&b')
  const [c0, c1, c2] = wb.sheets[0].rows[0]
  assert.ok(c0?.kind === 'text' && c0.text === 'שם &amp; פרטי')
  assert.ok(c1?.kind === 'text' && c1.formula && c1.text === 'x', 'formula never evaluated: cached value only')
  assert.ok(c2?.kind === 'text' && c2.text.length === 1000, 'cell text capped')
})

// A minimal workbook around one worksheet part (and optional extra parts), for parser edge cases.
const oneSheet = (sheetXml: string, extra: { name: string; data: string }[] = [], rels = '<Relationship Id="rId1" Target="worksheets/sheet1.xml"/>') => zip([
  { name: 'xl/workbook.xml', data: '<workbook xmlns:r="r"><sheets><sheet name="s" sheetId="1" r:id="rId1"/></sheets></workbook>' },
  { name: 'xl/_rels/workbook.xml.rels', data: `<Relationships>${rels}</Relationships>` },
  { name: 'xl/worksheets/sheet1.xml', data: sheetXml }, ...extra,
])

test('malformed XML fails fast (linear scanning, no backtracking over the part)', () => {
  // Before: ~100 s of blocked CPU for each of these (a few KB compressed). Now: rejected at once.
  for (const [label, xml, extra] of [
    ['unclosed rows', '<sheetData>' + '<row>'.repeat(200_000), []],
    ['unclosed cells', '<sheetData><row r="1">' + '<c r="A1">'.repeat(200_000) + '</row></sheetData>', []],
    ['tags without ">"', '<sheetData>' + '<row '.repeat(200_000), []],
    ['unclosed shared strings', '<sheetData/>', [{ name: 'xl/sharedStrings.xml', data: '<sst>' + '<si>'.repeat(200_000) }]],
    ['unclosed number formats', '<sheetData/>', [{ name: 'xl/styles.xml', data: '<styleSheet><numFmts>' + '<numFmt '.repeat(200_000) }]],
  ] as const) {
    const t = performance.now()
    assert.throws(() => readXlsx(oneSheet(xml, [...extra])), XlsxError, label)
    assert.ok(performance.now() - t < 2000, `${label}: ${Math.round(performance.now() - t)} ms`)
  }
})

test('row limit: content past it is reported (never silently dropped); empty formatted rows are ignored', () => {
  const row = (r: number, inner: string) => `<row r="${r}">${inner}</row>`
  const cell = (r: number) => `<c r="A${r}" t="inlineStr"><is><t>x</t></is></c>`
  const past = XLSX_LIMITS.rows + 10
  const content = readXlsx(oneSheet(`<sheetData>${row(1, cell(1))}${row(past, cell(past))}</sheetData>`)).sheets[0]
  assert.equal(content.truncated, true)
  const formatted = readXlsx(oneSheet(`<sheetData>${row(1, cell(1))}${row(past, `<c r="A${past}" s="3"/>`)}${row(past + 1, `<c r="A${past + 1}" t="str"><f>""</f><v></v></c>`)}</sheetData>`)).sheets[0]
  assert.equal(formatted.truncated, false)
  assert.equal(formatted.rows.length, 1)
  // Only the requested sheet is parsed; the others are listed by name.
  const two = workbook([{ name: 'א', rows: [['a']] }, { name: 'ב', rows: [['b']] }])
  const only = readXlsx(two, { onlySheet: 1 })
  assert.deepEqual(only.sheets.map(s => [s.name, s.rows.length]), [['א', 0], ['ב', 1]])
})

test('DTDs rejected; prefixed SpreadsheetML read; external relationships never followed', () => {
  assert.throws(() => readXlsx(oneSheet('<!DOCTYPE x [<!ENTITY e "boom">]><worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>&e;</t></is></c></row></sheetData></worksheet>')), XlsxError)
  const prefixed = readXlsx(zip([
    { name: 'xl/workbook.xml', data: '<x:workbook xmlns:x="m" xmlns:r="r"><x:workbookPr date1904="1"/><x:sheets><x:sheet name="תלמידים" sheetId="1" r:id="rId1"/></x:sheets></x:workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', data: '<Relationships><Relationship Id="rId1" Target="/xl/worksheets/sheet1.xml"/></Relationships>' },
    { name: 'xl/worksheets/sheet1.xml', data: '<x:worksheet xmlns:x="m"><x:sheetData><x:row r="2"><x:c r="B2" t="inlineStr"><x:is><x:t>שם</x:t></x:is></x:c><x:c r="C2"><x:v>7</x:v></x:c></x:row></x:sheetData></x:worksheet>' },
  ]))
  assert.equal(prefixed.date1904, true)
  assert.equal(prefixed.sheets[0].name, 'תלמידים')
  assert.deepEqual(prefixed.sheets[0].rows[1].slice(1), [{ kind: 'text', text: 'שם', formula: false }, { kind: 'number', num: 7, format: null, formula: false }])
  const external = readXlsx(oneSheet('', [], '<Relationship Id="rId1" Target="http://example.invalid/sheet.xml" TargetMode="External"/>'))
  assert.deepEqual(external.sheets[0].rows, [], 'external target ignored (never fetched)')
  const outside = readXlsx(oneSheet('', [], '<Relationship Id="rId1" Target="../../etc/sheet.xml"/>'))
  assert.deepEqual(outside.sheets[0].rows, [], 'path outside the package ignored')
  // Rich text with phonetic guides, single-quoted attributes, <col> not mistaken for <c>
  const rich = readXlsx(oneSheet("<worksheet><cols><col min='1' max='2'/></cols><sheetData><row r='1'><c r='A1' t='s'><v>0</v></c></row></sheetData></worksheet>",
    [{ name: 'xl/sharedStrings.xml', data: '<sst><si><r><t>נו</t></r><r><t xml:space="preserve">עה </t></r><rPh sb="0" eb="1"><t>X</t></rPh></si></sst>' }]))
  assert.deepEqual(rich.sheets[0].rows[0], [{ kind: 'text', text: 'נועה ', formula: false }])
})

// ── Planning (matching and source precedence) ────────────────────────────────────────────────

const core = (o = {}) => ({ firstName: 'נועה', lastName: 'בדיקה', birthDate: '2011-03-05', gender: 'FEMALE' as const, ...o })
const role = (o = {}) => ({ grade: 'ט׳', parallel: 2, className: 'ט׳ 2', ...o })
const row = (line: number, key: string | null, o: Partial<PlanInputRow> = {}): PlanInputRow => ({ line, identityKey: key, core: key ? core() : null, role: key ? role() : null, ...o })
const person = (o: Partial<ExistingPerson> = {}): ExistingPerson => ({ id: 'p1', dataSource: 'MANUAL', active: true, core: core(), roles: [{ role: 'STUDENT', ...role(), active: true }], ...o })

test('plan: new, unchanged, update, role added, class change, duplicates, errors', () => {
  const existing = new Map<string, ExistingPerson>([
    ['same', person({ id: 'same' })],
    ['renamed', person({ id: 'renamed', core: core({ lastName: 'ישן' }) })],
    ['moved', person({ id: 'moved', roles: [{ role: 'STUDENT', ...role({ grade: 'ח׳', parallel: 1, className: 'ח׳ 1' }), active: true }] })],
  ])
  const plan = planImport('STUDENT', [row(1, 'new'), row(2, 'same'), row(3, 'renamed'), row(4, 'moved'), row(5, 'dup'), row(6, 'dup'), row(7, null)], existing)
  assert.deepEqual(plan.map(p => p.status), ['NEW', 'UNCHANGED', 'UPDATE', 'UPDATE', 'DUPLICATE', 'DUPLICATE', 'ERROR'])
  assert.deepEqual(plan[2].core, { lastName: 'בדיקה' })
  assert.equal(plan[2].dataSource, 'EXCEL', 'Excel takes over from manual data')
  assert.deepEqual([plan[3].roleAction, plan[3].roleFields.sort()], ['update', ['className', 'grade', 'parallel']])
  assert.deepEqual(summarize(plan), { NEW: 1, UPDATE: 2, UNCHANGED: 1, DUPLICATE: 2, ERROR: 1, SKIPPED: 0 })
  // A student imported as a teacher: a role is added; the student role stays.
  const teacher = planImport('TEACHER', [row(1, 'same', { role: { grade: null, parallel: null, className: null } })], existing)
  assert.deepEqual([teacher[0].status, teacher[0].roleAction, teacher[0].personId], ['UPDATE', 'add', 'same'])
})

test('plan: SmartSchool data is never overwritten by Excel (only empty fields filled, roles added)', () => {
  const smart = new Map([['k', person({ dataSource: 'SMARTSCHOOL', core: core({ lastName: 'רשמי', gender: null }) })]])
  const [p] = planImport('STUDENT', [row(1, 'k', { role: role({ grade: 'י׳', className: 'י׳ 2' }) })], smart)
  assert.equal(p.status, 'UPDATE', 'gender was empty: filled')
  assert.deepEqual(p.core, { gender: 'FEMALE' })
  assert.ok(p.kept.includes('lastName') && p.kept.includes('grade') && p.kept.includes('className'))
  assert.equal(p.dataSource, 'SMARTSCHOOL')
  const smartFull = new Map([['k', person({ dataSource: 'SMARTSCHOOL', core: core({ lastName: 'רשמי' }) })]])
  assert.equal(planImport('STUDENT', [row(1, 'k')], smartFull)[0].status, 'SKIPPED')
})

test('plan: inactive people stay inactive; fingerprint changes when the data changes', () => {
  const inactive = new Map([['k', person({ active: false })]])
  const [p] = planImport('STUDENT', [row(1, 'k')], inactive)
  assert.equal(p.status, 'UNCHANGED')
  assert.ok(p.notes.some(n => n.includes('מושבתת')))
  const a = planImport('STUDENT', [row(1, 'k')], new Map())
  const b = planImport('STUDENT', [row(1, 'k')], new Map())
  assert.equal(planHash(a), planHash(b))
  assert.notEqual(planHash(a), planHash(planImport('STUDENT', [row(1, 'k')], inactive)))
})
