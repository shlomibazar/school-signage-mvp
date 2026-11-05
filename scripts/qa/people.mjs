// Integration tests: birthday people (Stage 3) — permissions, school isolation, identity matching,
// mass assignment, pagination, privacy of responses, and compatibility with existing birthday content.
//
// LOCAL TEST ENVIRONMENT ONLY (see ./_local.mjs). Creates temporary users (EDITOR, VIEWER in school A;
// SCHOOL_ADMIN in school B; random passwords never printed) and temporary people tagged "QAP", and
// removes all of them at the end. The server must have PERSON_ID_KEY set (or run in development).
//
//   QA_CREDS_FILE=/path/outside/repo/qa-users.json npm run test:qa:people
import crypto from 'node:crypto'
import path from 'node:path'
import { createRequire } from 'node:module'
import { ROOT, BASE, creds, db, ids, login, call, reporter } from './_local.mjs'

const require = createRequire(path.join(ROOT, 'package.json'))
const bcrypt = require('bcryptjs')
const { t, finish } = reporter()
const TAG = 'QAP'
const users = []
const tempUser = async (role, schoolId) => {
  const password = crypto.randomBytes(18).toString('base64url')
  const email = `qa-people-${role.toLowerCase()}-${Date.now()}-${users.length}@qa.local`
  const u = await db.user.create({ data: { email, name: `${TAG} ${role}`, role, schoolId, passwordHash: await bcrypt.hash(password, 10) } })
  users.push(u.id)
  return login({ email, password })
}
const created = {}
const RAW_ID = '012345678'
const person = (o = {}) => ({ firstName: `${TAG}נועה`, lastName: 'כהן', birthDate: '2011-03-01', gender: 'FEMALE', role: 'STUDENT', grade: 'ט', parallel: 2, ...o })

try {
  const A = await login(creds.A)
  const roleA = (await db.user.findUnique({ where: { email: creds.A.email }, select: { role: true } })).role
  t(`user A is a school admin (${roleA})`, ['SCHOOL_ADMIN', 'SUPER_ADMIN'].includes(roleA))
  const E = await tempUser('EDITOR', ids.schoolA), V = await tempUser('VIEWER', ids.schoolA), B = await tempUser('SCHOOL_ADMIN', ids.schoolB)

  // ── Access ─────────────────────────────────────────────────────────────────────────────────
  t('anonymous: 401', (await call(null, '/api/people?role=STUDENT')).s === 401 && (await call(null, '/api/people', 'POST', person())).s === 401)
  t('VIEWER: 403 (read and write)', (await call(V, '/api/people?role=STUDENT')).s === 403 && (await call(V, '/api/people', 'POST', person())).s === 403)
  t('EDITOR: 403 — content editors do not manage personal data', (await call(E, '/api/people?role=STUDENT')).s === 403 && (await call(E, '/api/people', 'POST', person())).s === 403)
  t('page: EDITOR does not get the list', !(await call(E, '/admin/birthdays')).text.includes('חיפוש לפי שם'))
  const listA = await call(A, '/api/people?role=STUDENT')
  t('SCHOOL_ADMIN: 200', listA.s === 200)

  // ── Create, identity, privacy ──────────────────────────────────────────────────────────────
  const c1 = await call(A, '/api/people', 'POST', person({ externalId: RAW_ID }))
  const p1 = c1.j?.data
  t('create student with an ID (201)', c1.s === 201 && !!p1?.id, c1.text)
  t('response: hint only — no raw ID, no identity key', p1?.identityHint === '678' && p1?.hasIdentity === true && !c1.text.includes(RAW_ID) && !('identityKey' in (p1 ?? {})) && !('externalId' in (p1 ?? {})))
  const row = await db.person.findUnique({ where: { id: p1.id } })
  t('database: no raw ID in any column; keyed hash stored', !JSON.stringify(row).includes(RAW_ID) && /^[0-9a-f]{64}$/.test(row.identityKey) && row.identityKeyVersion === 1)
  t('database: birth date is a date-only value', row.birthDate.toISOString() === '2011-03-01T00:00:00.000Z')
  t('class normalized (ט → ט׳, class ט׳ 2)', p1.roles[0].grade === 'ט׳' && p1.roles[0].className === 'ט׳ 2')
  t('manual source recorded', (await db.personSource.count({ where: { personId: p1.id, sourceType: 'MANUAL' } })) === 1)

  const dup = await call(A, '/api/people', 'POST', person({ externalId: ' 0-1234-5678 ', firstName: `${TAG}אחר` }))
  t('same ID (any formatting) in the same school: 409 DUPLICATE_IDENTITY, nothing created', dup.s === 409 && dup.j?.code === 'DUPLICATE_IDENTITY' && dup.j?.existing?.id === p1.id && (await db.person.count({ where: { firstName: `${TAG}אחר` } })) === 0)
  const noZero = await call(A, '/api/people', 'POST', person({ externalId: '12345678', firstName: `${TAG}בלי` }))
  t('leading zero preserved: "12345678" is another person', noZero.s === 201)
  const asTeacher = await call(A, '/api/people', 'POST', person({ externalId: RAW_ID, role: 'TEACHER', grade: undefined, parallel: undefined }))
  t('same ID as a teacher: 409 pointing to the existing student', asTeacher.s === 409 && asTeacher.j?.existing?.roles?.join() === 'STUDENT')
  const addRole = await call(A, `/api/people/${p1.id}`, 'PATCH', { role: { role: 'TEACHER', active: true } })
  t('adding the teacher role to the same person (no duplicate)', addRole.s === 200 && addRole.j?.data?.roles?.length === 2 && (await db.person.count({ where: { schoolId: ids.schoolA, identityKey: row.identityKey } })) === 1)
  const teachers = await call(A, `/api/people?role=TEACHER&q=${encodeURIComponent(TAG + 'נועה')}`)
  t('…listed under teachers too, marked as having another role', teachers.j?.items?.some(i => i.id === p1.id && i.otherRole))

  const inB = await call(B, '/api/people', 'POST', person({ externalId: RAW_ID }))
  const rowB = inB.j?.data && await db.person.findUnique({ where: { id: inB.j.data.id } })
  t('same ID in another school: allowed, unrelated key', inB.s === 201 && rowB && rowB.identityKey !== row.identityKey)

  for (const [label, id] of [['malformed', 'ab#12'], ['too long', '1'.repeat(30)]]) {
    const r = await call(A, '/api/people', 'POST', person({ externalId: id }))
    t(`${label} identifier rejected (400)`, r.s === 400, `${r.s} ${r.text}`)
  }
  t('identifier as a number (would lose zeros) rejected (400)', (await call(A, '/api/people', 'POST', person({ externalId: 12345678 }))).s === 400)
  const noId = await call(A, '/api/people', 'POST', person({ firstName: `${TAG}ללא` }))
  t('identifier is optional (manual entry)', noId.s === 201 && noId.j?.data?.hasIdentity === false)

  // ── Validation and mass assignment ─────────────────────────────────────────────────────────
  const invalid = await call(A, '/api/people', 'POST', person({ firstName: '<b>', birthDate: '2023-02-29' }))
  t('invalid name/date: 400 with field errors in Hebrew', invalid.s === 400 && invalid.j?.fieldErrors?.firstName && invalid.j?.fieldErrors?.birthDate)
  t('future birth date: 400', (await call(A, '/api/people', 'POST', person({ birthDate: '2099-01-01' }))).s === 400)
  for (const extra of [{ schoolId: ids.schoolB }, { identityKey: 'x' }, { active: false }, { dataSource: 'SMARTSCHOOL' }, { id: 'x' }]) {
    const r = await call(A, '/api/people', 'POST', person(extra))
    t(`mass assignment rejected on create: ${Object.keys(extra)[0]} (400)`, r.s === 400 && r.j?.fields?.length >= 0, `${r.s}`)
  }
  t('mass assignment rejected on update: schoolId (400)', (await call(A, `/api/people/${p1.id}`, 'PATCH', { schoolId: ids.schoolB })).s === 400)
  t('…and the person stayed in school A', (await db.person.findUnique({ where: { id: p1.id } })).schoolId === ids.schoolA)

  // ── Cross-school ───────────────────────────────────────────────────────────────────────────
  t('another school cannot read (404)', (await call(B, `/api/people/${p1.id}`)).s === 404)
  t('another school cannot update (404), unchanged', (await call(B, `/api/people/${p1.id}`, 'PATCH', { firstName: 'Hacked' })).s === 404 && (await db.person.findUnique({ where: { id: p1.id } })).firstName !== 'Hacked')
  t('another school cannot deactivate (404)', (await call(B, `/api/people/${p1.id}/active`, 'PATCH', { active: false })).s === 404)
  const listB = await call(B, `/api/people?role=STUDENT&pageSize=50&q=${TAG}`)
  t('another school\'s list does not include school A people', listB.s === 200 && !listB.j.items.some(i => i.id === p1.id))
  t('another school cannot take an ID that collides in its own school only', (await call(B, '/api/people', 'POST', person({ externalId: RAW_ID }))).s === 409)

  // ── Lifecycle ──────────────────────────────────────────────────────────────────────────────
  const upd = await call(A, `/api/people/${p1.id}`, 'PATCH', { lastName: 'כהן-לוי', role: { role: 'STUDENT', grade: 'י', parallel: 1, active: true } })
  t('update names and class', upd.s === 200 && upd.j.data.lastName === 'כהן-לוי' && upd.j.data.roles.find(r => r.role === 'STUDENT').className === 'י׳ 1')
  const off = await call(A, `/api/people/${p1.id}/active`, 'PATCH', { active: false })
  const actives = await call(A, `/api/people?role=STUDENT&status=active&q=${TAG}&pageSize=50`)
  const inactives = await call(A, `/api/people?role=STUDENT&status=inactive&q=${TAG}&pageSize=50`)
  t('deactivate: out of the active list, in the inactive list (not deleted)', off.s === 200 && !actives.j.items.some(i => i.id === p1.id) && inactives.j.items.some(i => i.id === p1.id) && !!(await db.person.findUnique({ where: { id: p1.id } })))
  t('reactivate', (await call(A, `/api/people/${p1.id}/active`, 'PATCH', { active: true })).j?.data?.active === true)
  t('replacing the identifier: new hint, old ID no longer matches', (await call(A, `/api/people/${p1.id}`, 'PATCH', { externalId: '222333444' })).j?.data?.identityHint === '444' &&
    (await call(A, '/api/people', 'POST', person({ externalId: RAW_ID, firstName: `${TAG}חדש` }))).s === 201)

  // ── Search, filters, pagination, limits ────────────────────────────────────────────────────
  const many = await Promise.all(Array.from({ length: 27 }, (_, i) => db.person.create({ data: { schoolId: ids.schoolA, firstName: `${TAG}דף${String(i).padStart(2, '0')}`, lastName: 'בדיקה', birthDate: new Date(Date.UTC(1980, 0, 1 + i)), roles: { create: { role: 'TEACHER' } } } })))
  const pg1 = await call(A, `/api/people?role=TEACHER&q=${encodeURIComponent(TAG + 'דף')}&pageSize=25`)
  const pg2 = await call(A, `/api/people?role=TEACHER&q=${encodeURIComponent(TAG + 'דף')}&pageSize=25&page=2`)
  t('pagination: 25 + 2 of 27, no overlap', pg1.j?.items?.length === 25 && pg2.j?.items?.length === 2 && pg1.j.total === 27 && !pg2.j.items.some(i => pg1.j.items.some(x => x.id === i.id)))
  t('limits: pageSize > 50, page 0, unknown query parameter → 400', (await call(A, '/api/people?role=TEACHER&pageSize=51')).s === 400 && (await call(A, '/api/people?role=TEACHER&page=0')).s === 400 && (await call(A, '/api/people?role=TEACHER&export=all')).s === 400)
  t('role is required (no unfiltered dump)', (await call(A, '/api/people')).s === 400)
  const byGrade = await call(A, `/api/people?role=STUDENT&grade=${encodeURIComponent("י'")}&q=${TAG}`)
  t('grade filter (any spelling) and class facets', byGrade.j?.items?.length === 1 && byGrade.j.items[0].id === p1.id && byGrade.j.facets.classes.includes('י׳ 1'))
  const byClass = await call(A, `/api/people?role=STUDENT&className=${encodeURIComponent('ט׳ 2')}&q=${TAG}`)
  t('class filter', byClass.j?.items?.every(i => i.className === 'ט׳ 2') && byClass.j.items.length >= 1)
  t('list items: day and month only (no birth year or full date)', !JSON.stringify(pg1.j.items).includes('1980') && pg1.j.items.every(i => !('birthDate' in i)))
  created.extra = many.map(m => m.id)

  // ── Public screens and existing birthday content ───────────────────────────────────────────
  const scr = await db.screen.create({ data: { schoolId: ids.schoolA, name: `${TAG} screen`, slug: `qap-${Date.now()}`, layout: { create: { headerEnabled: true, footerEnabled: true, mainSections: 1, footerShowBirthdays: true } }, sections: { create: [{ position: 0, widthPct: 100 }] } }, include: { sections: true } })
  created.screen = scr.id
  const bd = await call(A, `/api/screens/${scr.id}/sections/${scr.sections[0].id}/content`, 'POST', { contentType: 'BIRTHDAYS', settings: { personName: 'דני', grade: 'ה׳', birthDate: '', greetingText: 'מזל טוב' } })
  t('existing birthday content type still saves', [200, 201].includes(bd.s), bd.text)
  const tv = await call(null, `/screen/${scr.slug}`)
  t('TV page renders existing birthday content', tv.s === 200 && tv.text.includes('דני'))
  t('TV page exposes none of the new person records', !tv.text.includes(TAG + 'נועה') && !tv.text.includes('identityHint') && !tv.text.includes(RAW_ID))
} catch (e) {
  t('no unexpected error', false, e?.stack || String(e))
} finally {
  if (created.screen) await db.screen.deleteMany({ where: { id: created.screen } })
  await db.person.deleteMany({ where: { firstName: { startsWith: TAG } } })
  await db.user.deleteMany({ where: { id: { in: users } } })
  t('cleanup: no QAP people, sources or users left', (await db.person.count({ where: { firstName: { startsWith: TAG } } })) + (await db.user.count({ where: { name: { startsWith: TAG } } })) === 0 &&
    (await db.personSource.count({ where: { person: { firstName: { startsWith: TAG } } } })) === 0)
  await db.$disconnect()
  finish()
}
