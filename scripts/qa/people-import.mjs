// Integration tests: Excel import of students and teachers (Stage 4) — permissions, school isolation,
// preview without writes, transactional apply, precedence, double/concurrent apply, plan changes,
// expiry, cancel, malicious files, rate limiting and privacy of identifiers.
//
// LOCAL TEST ENVIRONMENT ONLY (see ./_local.mjs). Everything happens in a temporary school created
// here (with a temporary SCHOOL_ADMIN, plus a temporary SCHOOL_ADMIN in school B and an EDITOR and a
// VIEWER; random passwords never printed); the school and the users are deleted at the end.
// Synthetic fixtures only (tests/fixtures/import). The server must have PERSON_ID_KEY set.
//
//   QA_CREDS_FILE=/path/outside/repo/qa-users.json npm run test:qa:people-import
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { deflateRawSync } from 'node:zlib'
import { createRequire } from 'node:module'
import { ROOT, db, ids, login, call, reporter } from './_local.mjs'

const require = createRequire(path.join(ROOT, 'package.json'))
const bcrypt = require('bcryptjs')
const { t, finish } = reporter()
const TAG = 'QAI'
const users = []
let schoolId = null
const fixture = f => fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'import', f))
const STUDENTS = fixture('students-sample.xlsx'), TEACHERS = fixture('teachers-sample.xlsx')
// The synthetic identifiers in the fixtures: none may appear in any response or stored row.
const RAW_IDS = ['012345678', '123456782', '001234567', '222333444', '333444555', '444555666', '555666777', '666777888', '777888999', '888999000', '901234567', '902345678']
const leaks = text => RAW_IDS.filter(id => text.includes(id))

const tempUser = async (role, school) => {
  const password = crypto.randomBytes(18).toString('base64url')
  const email = `qa-import-${role.toLowerCase()}-${Date.now()}-${users.length}@qa.local`
  const u = await db.user.create({ data: { email, name: `${TAG} ${role}`, role, schoolId: school, passwordHash: await bcrypt.hash(password, 10) } })
  users.push(u.id)
  return { cookie: await login({ email, password }), id: u.id }
}
const form = (buf, kind, extra = {}, name = 'list.xlsx') => {
  const f = new FormData()
  f.append('file', new Blob([buf]), name); f.append('kind', kind)
  for (const [k, v] of Object.entries(extra)) f.append(k, typeof v === 'string' ? v : JSON.stringify(v))
  return f
}
const inspect = (c, buf, kind, name) => call(c, '/api/people/import/inspect', 'POST', form(buf, kind, {}, name))
async function preview(c, buf, kind, override = {}) {
  const ins = await inspect(c, buf, kind)
  const sheet = ins.j?.data?.sheets?.find(s => s.headerRow >= 0)
  if (!sheet) return { s: ins.s, j: ins.j, text: ins.text }
  return call(c, '/api/people/import', 'POST', form(buf, kind, { sheet: String(sheet.index), mapping: { ...sheet.mapping, ...override } }))
}
const apply = (c, id) => call(c, `/api/people/import/${id}/apply`, 'POST')
const counts = async () => ({
  people: await db.person.count({ where: { schoolId } }), roles: await db.personRole.count({ where: { person: { schoolId } } }),
  sources: await db.personSource.count({ where: { schoolId } }), audit: await db.personAuditEvent.count({ where: { schoolId } }),
})
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// A tiny zip writer for hostile files (mirrors tests/helpers/xlsxBuilder.ts).
const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
function zip(parts) {
  const L = [], C = []; let off = 0
  for (const p of parts) {
    const raw = Buffer.from(p.data), body = deflateRawSync(raw), name = Buffer.from(p.name)
    const l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt16LE(8, 8); l.writeUInt32LE(crc(raw), 14); l.writeUInt32LE(body.length, 18); l.writeUInt32LE(raw.length, 22); l.writeUInt16LE(name.length, 26)
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(8, 10); c.writeUInt32LE(crc(raw), 16); c.writeUInt32LE(body.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(off, 42)
    L.push(l, name, body); C.push(c, name); off += 30 + name.length + body.length
  }
  const cd = Buffer.concat(C), e = Buffer.alloc(22)
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(parts.length, 8); e.writeUInt16LE(parts.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16)
  return Buffer.concat([...L, cd, e])
}

try {
  const school = await db.school.create({ data: { name: `${TAG} בית ספר זמני`, slug: `qa-import-${Date.now()}` } })
  schoolId = school.id
  const { cookie: A, id: adminId } = await tempUser('SCHOOL_ADMIN', schoolId)
  const { cookie: E } = await tempUser('EDITOR', schoolId), { cookie: V } = await tempUser('VIEWER', schoolId)
  const { cookie: B } = await tempUser('SCHOOL_ADMIN', ids.schoolB)

  // ── Access ─────────────────────────────────────────────────────────────────────────────────
  t('anonymous: 401 (inspect, preview, apply, cancel)', (await inspect(null, STUDENTS, 'STUDENT')).s === 401 && (await call(null, '/api/people/import', 'POST', form(STUDENTS, 'STUDENT'))).s === 401
    && (await apply(null, 'x')).s === 401 && (await call(null, '/api/people/import/x', 'DELETE')).s === 401)
  t('EDITOR and VIEWER: 403', (await inspect(E, STUDENTS, 'STUDENT')).s === 403 && (await inspect(V, STUDENTS, 'STUDENT')).s === 403 && (await apply(E, 'x')).s === 403)
  const page = await call(A, '/admin/birthdays/import')
  t('import page renders for the school admin', page.s === 200 && page.text.includes('ייבוא מאקסל'))
  t('import page: EDITOR gets no wizard', !(await call(E, '/admin/birthdays/import')).text.includes('סוג הרשימה'))

  // ── Inspect ────────────────────────────────────────────────────────────────────────────────
  const ins = await inspect(A, STUDENTS, 'STUDENT')
  const sh = ins.j?.data?.sheets?.[0]
  t('inspect: sheets, header row 3, Hebrew headers detected', ins.s === 200 && ins.j.data.sheets.length === 2 && sh.headerRow === 2 && ['externalId', 'firstName', 'lastName', 'birthDate', 'grade', 'parallel', 'className', 'gender'].every(f => typeof sh.mapping[f] === 'number'), ins.text.slice(0, 300))
  t('inspect: header names only — no row content, no identifiers', !ins.text.includes('נועה') && !leaks(ins.text).length)
  t('inspect: the notes sheet has no header row', ins.j.data.sheets[1].headerRow === -1)

  // ── Preview: nothing written ──────────────────────────────────────────────────────────────
  const before = await counts()
  const p1 = await preview(A, STUDENTS, 'STUDENT')
  const pv = p1.j?.data
  const st = line => pv?.rows?.find(r => r.line === line)?.status
  t('preview: 201 with rows and totals', p1.s === 201 && pv?.rows?.length === 13 && Object.values(pv.summary).reduce((a, b) => a + b, 0) === 13, p1.text.slice(0, 300))
  console.log('  students summary:', JSON.stringify(pv?.summary))
  t('preview: statuses (new, error for 8-digit numeric ID / invalid date / 2-digit year / no ID, duplicate pair)',
    st(4) === 'NEW' && st(5) === 'NEW' && st(6) === 'ERROR' && st(7) === 'NEW' && st(11) === 'ERROR' && st(12) === 'ERROR' && st(13) === 'DUPLICATE' && st(14) === 'DUPLICATE' && st(15) === 'ERROR' && st(17) === 'NEW',
    JSON.stringify(pv?.rows?.map(r => [r.line, r.status])))
  t('preview: leading zeros kept (text ID and zero-formatted number), hints only', pv.rows.find(r => r.line === 4)?.idHint === '678' && pv.rows.find(r => r.line === 7)?.idHint === '567')
  t('preview: ambiguous date carries a warning', pv.rows.find(r => r.line === 9)?.issues?.some(i => i.level === 'warning'))
  t('preview: no raw identifiers in the response', !leaks(p1.text).length, leaks(p1.text).join())
  t('preview: changes nothing (people, roles, sources, audit)', same(before, await counts()))
  const stored = await db.personImport.findUnique({ where: { id: pv.importId } })
  t('stored preview: status PREVIEWED, expires in ~30 minutes, no raw identifiers or file bytes', stored.status === 'PREVIEWED' && Math.abs(stored.expiresAt - Date.now() - 30 * 60_000) < 120_000
    && !leaks(JSON.stringify(stored)).length && /^[0-9a-f]{64}$/.test(stored.fileSha256))

  // ── Invalid mapping / requests ────────────────────────────────────────────────────────────
  const badMap = await preview(A, STUDENTS, 'STUDENT', { birthDate: null })
  t('mapping without a required column: 400 in Hebrew', badMap.s === 400 && /[֐-׿]/.test(badMap.j?.error ?? ''), badMap.text)
  const twice = await preview(A, STUDENTS, 'STUDENT', { lastName: sh.mapping.firstName })
  t('same column for two fields: 400', twice.s === 400)
  t('mapping to a column that does not exist: 400', (await preview(A, STUDENTS, 'STUDENT', { gender: 59 })).s === 400)
  t('invalid kind: 400', (await inspect(A, STUDENTS, 'PARENT')).s === 400)

  // ── Hostile files ─────────────────────────────────────────────────────────────────────────
  const ole = Buffer.concat([Buffer.from('d0cf11e0a1b11ae1', 'hex'), Buffer.alloc(600)])
  const hostile = [
    ['.xls name', STUDENTS, 'list.xls'], ['old binary .xls content', ole, 'list.xlsx'], ['random bytes', crypto.randomBytes(2000), 'list.xlsx'],
    ['empty file', Buffer.alloc(0), 'list.xlsx'], ['over 5MB', Buffer.alloc(5 * 1024 * 1024 + 10), 'list.xlsx'],
    ['macro workbook (vbaProject.bin)', zip([{ name: 'xl/workbook.xml', data: '<workbook/>' }, { name: 'xl/vbaProject.bin', data: 'x' }]), 'list.xlsx'],
    ['zip bomb', zip([{ name: 'xl/workbook.xml', data: '<workbook/>' }, { name: 'xl/worksheets/sheet1.xml', data: Buffer.alloc(40 * 1024 * 1024, 0x20) }]), 'list.xlsx'],
    ['XML entity (DOCTYPE)', zip([{ name: 'xl/workbook.xml', data: '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]><workbook/>' }]), 'list.xlsx'],
  ]
  for (const [label, buf, name] of hostile) {
    const r = await inspect(A, buf, 'STUDENT', name)
    t(`hostile file rejected (${label}): 4xx with a Hebrew message`, r.s >= 400 && r.s < 500 && /[֐-׿]/.test(r.j?.error ?? ''), `${r.s} ${r.text.slice(0, 200)}`)
  }
  t('server still healthy after hostile files', (await inspect(A, STUDENTS, 'STUDENT')).s === 200)

  // ── Cross-school isolation ─────────────────────────────────────────────────────────────────
  t('another school\'s admin: apply → 404, cancel → 404, nothing applied', (await apply(B, pv.importId)).s === 404 && (await call(B, `/api/people/import/${pv.importId}`, 'DELETE')).s === 404
    && (await db.personImport.findUnique({ where: { id: pv.importId } })).status === 'PREVIEWED')

  // ── Apply ──────────────────────────────────────────────────────────────────────────────────
  const a1 = await apply(A, pv.importId)
  const r1 = a1.j?.data
  t('apply: 200 with results matching the preview', a1.s === 200 && r1.created === pv.summary.NEW && r1.updated === 0 && r1.invalid === pv.summary.ERROR && r1.duplicates === pv.summary.DUPLICATE && r1.failed === 0, a1.text)
  const after1 = await counts()
  t('apply: one person, role and EXCEL source per new row; CREATED + IDENTITY_SET audit each', after1.people === pv.summary.NEW && after1.roles === pv.summary.NEW && after1.sources === pv.summary.NEW && after1.audit === 2 * pv.summary.NEW, JSON.stringify(after1))
  const people1 = await db.person.findMany({ where: { schoolId }, include: { roles: true, sources: true } })
  t('people: EXCEL data source, student role with class, keyed identity, no raw identifiers', people1.length > 0 && people1.every(p => p.dataSource === 'EXCEL' && p.roles[0].role === 'STUDENT' && /^[0-9a-f]{64}$/.test(p.identityKey)) && !leaks(JSON.stringify(people1)).length)
  const hila = people1.find(p => p.firstName === 'הילה')
  t('Feb 29 birth date and class י״א 1 stored', hila?.birthDate.toISOString().startsWith('2008-02-29') && /^י״א 1$/.test(hila?.roles[0].className ?? ''), `${hila?.birthDate?.toISOString()} ${hila?.roles?.[0]?.className}`)
  t('sources carry the import id', people1.length > 0 && people1.every(p => p.sources.some(s => s.sourceType === 'EXCEL' && s.lastImportId === pv.importId)))
  const audits = await db.personAuditEvent.findMany({ where: { schoolId } })
  t('audit: actor, import id, no names/identifiers in metadata', audits.length > 0 && audits.every(a => a.actorId === adminId && a.metadata?.importId === pv.importId) && !leaks(JSON.stringify(audits)).length && !JSON.stringify(audits.map(a => a.metadata)).includes('נועה'))
  const done = await db.personImport.findUnique({ where: { id: pv.importId } })
  t('import record: APPLIED, stored rows cleared', done.status === 'APPLIED' && done.rows === null && !!done.appliedAt)
  t('no raw identifiers in the response', !leaks(a1.text).length)

  // ── Double apply ──────────────────────────────────────────────────────────────────────────
  const again = await apply(A, pv.importId)
  t('applying the same import again: 409, nothing changes', again.s === 409 && same(after1, await counts()), `${again.s}`)

  // ── Re-import: unchanged, no writes ───────────────────────────────────────────────────────
  const stamp = new Map(people1.map(p => [p.id, p.updatedAt.getTime()]))
  const p2 = await preview(A, STUDENTS, 'STUDENT')
  t('same file again: all matched rows UNCHANGED, flagged as recently imported', p2.s === 201 && p2.j.data.summary.NEW === 0 && p2.j.data.summary.UNCHANGED === pv.summary.NEW && p2.j.data.recentSameFile === true, JSON.stringify(p2.j?.data?.summary))
  const a2 = await apply(A, p2.j.data.importId)
  const people2 = await db.person.findMany({ where: { schoolId } })
  t('…apply: unchanged reported, no person rows written, no audit events added', a2.s === 200 && a2.j.data.unchanged === pv.summary.NEW && a2.j.data.updated === 0
    && people2.every(p => p.updatedAt.getTime() === stamp.get(p.id)) && (await counts()).audit === after1.audit, a2.text)
  t('…sources now point to the latest import', (await db.personSource.count({ where: { schoolId, lastImportId: p2.j.data.importId } })) === pv.summary.NEW)

  // ── Teachers: dual role, update ───────────────────────────────────────────────────────────
  const pt = await preview(A, TEACHERS, 'TEACHER')
  console.log('  teachers summary:', JSON.stringify(pt.j?.data?.summary))
  t('teachers preview: two new, the student with the same ID matched (not duplicated)', pt.s === 201 && pt.j.data.summary.NEW === 2 && pt.j.data.summary.UPDATE === 1, pt.text.slice(0, 300))
  const at = await apply(A, pt.j.data.importId)
  const noa = await db.person.findMany({ where: { schoolId, firstName: 'נועה' }, include: { roles: true } })
  t('…apply: one person with student and teacher roles', at.s === 200 && noa.length === 1 && noa[0].roles.map(r => r.role).sort().join() === 'STUDENT,TEACHER')
  t('…ROLE_ADDED audited with the import id', (await db.personAuditEvent.count({ where: { schoolId, personId: noa[0].id, action: 'ROLE_ADDED' } })) === 1)

  // ── Precedence: SmartSchool data is never overwritten by Excel ────────────────────────────
  const itai = await db.person.findFirst({ where: { schoolId, firstName: 'איתי' } })
  await db.person.update({ where: { id: itai.id }, data: { dataSource: 'SMARTSCHOOL', firstName: 'איתי-סמארט' } })
  const p3 = await preview(A, STUDENTS, 'STUDENT')
  t('SmartSchool record with different data: SKIPPED (source precedence)', p3.j?.data?.rows?.find(r => r.line === 5)?.status === 'SKIPPED', JSON.stringify(p3.j?.data?.rows?.find(r => r.line === 5)))
  const a3 = await apply(A, p3.j.data.importId)
  t('…apply: name kept, data source still SMARTSCHOOL', a3.s === 200 && a3.j.data.skipped >= 1 && (await db.person.findUnique({ where: { id: itai.id } })).firstName === 'איתי-סמארט'
    && (await db.person.findUnique({ where: { id: itai.id } })).dataSource === 'SMARTSCHOOL')

  // ── Missing rows: never deactivated ───────────────────────────────────────────────────────
  t('people missing from the teachers file are still active students', (await db.person.count({ where: { schoolId, active: false } })) === 0 && (await db.personRole.count({ where: { person: { schoolId }, active: false } })) === 0)

  // ── Manual edit since the preview → 409 with an updated preview ───────────────────────────
  const maya = await db.person.findFirst({ where: { schoolId, firstName: 'יונתן' } })
  const p4 = await preview(A, STUDENTS, 'STUDENT')
  await db.person.update({ where: { id: maya.id }, data: { lastName: 'שונה' } })
  const before4 = await counts()
  const a4 = await apply(A, p4.j.data.importId)
  t('data changed since the preview: 409 PLAN_CHANGED with an updated preview, nothing written', a4.s === 409 && a4.j?.code === 'PLAN_CHANGED' && a4.j?.preview?.rows?.find(r => r.line === 7)?.status === 'UPDATE'
    && same(before4, await counts()) && (await db.person.findUnique({ where: { id: maya.id } })).lastName === 'שונה', a4.text.slice(0, 300))
  t('…no raw identifiers in the 409 body', !leaks(a4.text).length)
  const a4b = await apply(A, p4.j.data.importId)
  t('…confirming the updated preview applies it', a4b.s === 200 && a4b.j.data.updated === 1 && (await db.person.findUnique({ where: { id: maya.id } })).lastName === 'פיקטיבי', a4b.text)

  // ── Concurrent applies of one import: exactly one wins ────────────────────────────────────
  await db.person.update({ where: { id: maya.id }, data: { lastName: 'שונה' } })
  const p5 = await preview(A, STUDENTS, 'STUDENT')
  const both = await Promise.all([apply(A, p5.j.data.importId), apply(A, p5.j.data.importId)])
  t('two simultaneous applies of the same import: one 200, one 409', both.map(r => r.s).sort().join() === '200,409', both.map(r => r.s).join())
  t('…one UPDATED audit for that person from this import', (await db.personAuditEvent.count({ where: { schoolId, personId: maya.id, action: 'UPDATED', metadata: { path: ['importId'], equals: p5.j.data.importId } } })) === 1)

  // ── Two different imports at once (students + teachers): serialized, both consistent ──────
  await db.person.deleteMany({ where: { schoolId } })
  const [ps, ptt] = await Promise.all([preview(A, STUDENTS, 'STUDENT'), preview(A, TEACHERS, 'TEACHER')])
  const [as, att] = await Promise.all([apply(A, ps.j.data.importId), apply(A, ptt.j.data.importId)])
  t('concurrent students + teachers imports: serialized (each 200, or 409 PLAN_CHANGED when the other changed its plan)', [as, att].every(r => r.s === 200 || (r.s === 409 && r.j?.code === 'PLAN_CHANGED')), `${as.s} ${att.s}`)
  for (const r of [as, att]) if (r.s === 409) t('…the import that waited can be confirmed from its updated preview', (await apply(A, r.j.preview.importId)).s === 200)
  const noa2 = await db.person.findMany({ where: { schoolId, firstName: 'נועה' }, include: { roles: true } })
  t('…no duplicate person; dual role kept; all people present', noa2.length === 1 && noa2[0].roles.length === 2 && (await db.person.count({ where: { schoolId } })) === pv.summary.NEW + 2, `${noa2.length}`)

  // ── Expiry and cancel ─────────────────────────────────────────────────────────────────────
  const p6 = await preview(A, TEACHERS, 'TEACHER')
  await db.personImport.update({ where: { id: p6.j.data.importId }, data: { expiresAt: new Date(Date.now() - 1000) } })
  const a6 = await apply(A, p6.j.data.importId)
  const exp = await db.personImport.findUnique({ where: { id: p6.j.data.importId } })
  t('expired preview: 410, stored rows deleted', a6.s === 410 && exp.status === 'EXPIRED' && exp.rows === null, `${a6.s} ${exp.status}`)
  const p7 = await preview(A, TEACHERS, 'TEACHER')
  const c7 = await call(A, `/api/people/import/${p7.j.data.importId}`, 'DELETE')
  const can = await db.personImport.findUnique({ where: { id: p7.j.data.importId } })
  t('cancel: 200, rows deleted, cannot be applied afterwards', c7.s === 200 && can.rows === null && (await apply(A, p7.j.data.importId)).s === 410)
  t('unknown import id: 404', (await apply(A, 'cnotarealimportid000000')).s === 404)

  // ── Rate limit (database-backed) ──────────────────────────────────────────────────────────
  await db.$executeRaw`INSERT INTO "pairing_rate_limits" ("key", "count", "windowStart") VALUES (${'people-import:' + adminId}, 60, ${new Date()})
    ON CONFLICT ("key") DO UPDATE SET "count" = 60, "windowStart" = ${new Date()}`
  const limited = await inspect(A, STUDENTS, 'STUDENT')
  t('rate limit: over 60 import requests in 15 minutes → 429', limited.s === 429, `${limited.s}`)
  await db.pairingRateLimit.deleteMany({ where: { key: 'people-import:' + adminId } })

  // ── Nothing stored anywhere with raw identifiers ──────────────────────────────────────────
  const imports = await db.personImport.findMany({ where: { schoolId } })
  t('no raw identifiers in any stored import, person, source or audit row', !leaks(JSON.stringify(imports)).length
    && !leaks(JSON.stringify(await db.person.findMany({ where: { schoolId } }))).length && !leaks(JSON.stringify(await db.personSource.findMany({ where: { schoolId } }))).length)
} catch (e) {
  t('no unexpected error', false, e?.stack || String(e))
} finally {
  if (schoolId) {
    await db.pairingRateLimit.deleteMany({ where: { key: { in: users.map(u => 'people-import:' + u) } } })
    await db.user.deleteMany({ where: { id: { in: users } } })
    await db.school.delete({ where: { id: schoolId } })
  } else await db.user.deleteMany({ where: { id: { in: users } } })
  t('cleanup: temporary school, its people/imports/audit and users removed',
    (await db.school.count({ where: { name: { startsWith: TAG } } })) === 0 && (await db.user.count({ where: { name: { startsWith: TAG } } })) === 0
    && (await db.personImport.count({ where: { schoolId: schoolId ?? '-' } })) === 0 && (await db.person.count({ where: { schoolId: schoolId ?? '-' } })) === 0)
  await db.$disconnect()
  finish()
}
