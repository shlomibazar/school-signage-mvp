// Integration tests: the duty roster API and its public screen endpoint.
//
// LOCAL TEST ENVIRONMENT ONLY (see ./_local.mjs). In school A it creates temporary staff, locations,
// periods, a screen with a duty region and three temporary users (an editor without roster access, one
// with VIEW and one with EDIT; random passwords never printed); user B (another school) checks
// isolation. Everything created is removed at the end.
//
//   QA_CREDS_FILE=/path/outside/repo/qa-users.json npm run test:qa:duty
import crypto from 'node:crypto'
import path from 'node:path'
import { createRequire } from 'node:module'
import { ROOT, creds, db, ids, login, call, reporter } from './_local.mjs'

const require = createRequire(path.join(ROOT, 'package.json'))
const bcrypt = require('bcryptjs')
const { t, finish } = reporter()
const TAG = 'QA-DUTY'
const started = new Date()
const made = { users: [], staff: [], locations: [], periods: [], screens: [] }
const settingsBefore = await db.dutySettings.findUnique({ where: { schoolId: ids.schoolA } })

// School-local today (Asia/Jerusalem) and its week (Sunday).
const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(p => [p.type, p.value]))
const today = `${parts.year}-${parts.month}-${parts.day}`
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10)
const weekday = d => new Date(d + 'T00:00:00Z').getUTCDay()
const week = addDays(today, -weekday(today)), nextWeek = addDays(week, 7)

const tempUser = async (role, dutyAccess) => {
  const password = crypto.randomBytes(18).toString('base64url')
  const email = `qa-duty-${dutyAccess.toLowerCase()}-${Date.now()}@qa.local`
  const u = await db.user.create({ data: { email, name: `${TAG} ${dutyAccess}`, role, dutyAccess, schoolId: ids.schoolA, passwordHash: await bcrypt.hash(password, 10) } })
  made.users.push(u.id)
  return login({ email, password })
}

try {
  const A = await login(creds.A), B = await login(creds.B)
  const NONE = await tempUser('EDITOR', 'NONE'), VIEW = await tempUser('EDITOR', 'VIEW'), EDIT = await tempUser('EDITOR', 'EDIT')
  // The school A settings may already exist (local data): use the school days of the test week.
  await call(A, '/api/duty/settings', 'POST', { schoolDays: [0, 1, 2, 3, 4, 5, 6], maxPerDay: null, maxPerWeek: null, allowOverride: true })

  // Setup.
  const mk = async (kind, body, list) => { const r = await call(A, '/api/duty/' + kind, 'POST', body); if (r.j?.data?.id) list.push(r.j.data.id); return r }
  const names = [['דנה', 'לוי'], ['יוסי', 'כהן'], ['מיכל', 'אברהם'], ['David', 'Green']]
  for (const [firstName, lastName] of names) await mk('staff', { firstName: `${TAG} ${firstName}`, lastName }, made.staff)
  const [s1, s2, s3, s4] = made.staff
  await mk('location', { name: `${TAG} חצר`, staffNeeded: 1, required: true }, made.locations)
  await mk('location', { name: `${TAG} מסדרון`, staffNeeded: 1, required: true }, made.locations)
  const [yard, hall] = made.locations
  const all = [0, 1, 2, 3, 4, 5, 6]
  await mk('period', { name: `${TAG} הפסקה 1`, startTime: '10:00', endTime: '10:20', weekdays: all }, made.periods)
  await mk('period', { name: `${TAG} הפסקה 2`, startTime: '12:00', endTime: '12:15', weekdays: all }, made.periods)
  const [p1, p2] = made.periods
  t('setup: staff, locations and periods created', made.staff.length === 4 && made.locations.length === 2 && made.periods.length === 2)
  const bad = await call(A, '/api/duty/period', 'POST', { name: 'x', startTime: '11:00', endTime: '10:00', weekdays: all })
  t('setup: invalid period rejected with a message', bad.s === 400 && /שעת הסיום/.test(bad.j?.error ?? ''), `${bad.s}`)

  // 1–3. Weekly roster, assignment, conflicts.
  const assign = (cookie, staffId, locationId, periodId, date = today, extra = {}) => call(cookie, '/api/duty/assign', 'POST', { weekStart: week, date, periodId, locationId, staffId, ...extra })
  const a1 = await assign(A, s1, yard, p1)
  t('assign a teacher', a1.s === 201, a1.text.slice(0, 200))
  const dup = await assign(A, s1, yard, p1)
  t('duplicate assignment rejected', dup.s === 409 && dup.j?.issues?.some(i => i.code === 'DUPLICATE'))
  const clash = await assign(A, s1, hall, p1)
  t('conflicting assignment (same person, same time) rejected', clash.s === 409 && clash.j?.issues?.some(i => i.code === 'OVERLAP'), clash.text.slice(0, 200))
  const forced = await assign(A, s1, hall, p1, today, { overrideReason: 'בדיקת חריגה' })
  t('override with a reason is saved and audited', forced.s === 201 && !!(await db.dutyAuditEvent.findFirst({ where: { schoolId: ids.schoolA, action: 'assign_override', entityId: forced.j?.data?.id } })))
  if (forced.j?.data?.id) await call(A, '/api/duty/assign?id=' + forced.j.data.id, 'DELETE')
  const outside = await call(A, '/api/duty/assign', 'POST', { weekStart: week, date: addDays(week, 9), periodId: p1, locationId: hall, staffId: s2 })
  t('invalid assignment (outside the week) rejected', outside.s === 409 || outside.s === 400)
  const junk = await call(A, '/api/duty/assign', 'POST', { weekStart: week, date: today, periodId: p1, locationId: hall, staffId: s2, schoolId: ids.schoolB })
  t('unknown fields (e.g. schoolId) rejected', junk.s === 400)
  await assign(A, s2, hall, p1)

  const wk = await call(A, `/api/duty/week?start=${today}`)
  const gapsToday = (wk.j?.data?.gaps ?? []).filter(g => g.date === today && [yard, hall].includes(g.locationId))
  t('uncovered area detected (period 2 empty)', gapsToday.length === 2 && gapsToday.every(g => g.periodId === p2), JSON.stringify(gapsToday))
  t('draft saved without publishing', wk.j?.data?.status === 'draft' && wk.j?.data?.assignments.length >= 2)

  // 10–11. Public display: only the published roster.
  const screen = await db.screen.create({ data: { schoolId: ids.schoolA, name: `${TAG} screen`, slug: `qa-duty-${Date.now()}`, layout: { create: { mainSections: 1 } },
    sections: { create: [{ position: 0, widthPct: 100, contentItems: { create: [{ contentType: 'DUTY_ROSTER', active: true, settings: { title: 'תורנויות', mode: 'day' } }] } }] } }, include: { sections: { include: { contentItems: true } } } })
  made.screens.push(screen.id)
  const itemId = screen.sections[0].contentItems[0].id
  const pub0 = await call(null, `/api/public/duty/${itemId}`)
  const ours = d => (d?.periods ?? []).filter(p => [p1, p2].includes(p.periodId))
  t('unpublished roster is not shown', pub0.s === 200 && (pub0.j?.data?.published === false || ours(pub0.j?.data).length === 0), pub0.text.slice(0, 200))
  const noPub = await call(EDIT, '/api/duty/publish', 'POST', { weekStart: week })
  t('publishing requires publish permission (EDIT user refused)', noPub.s === 403)
  const pub = await call(A, '/api/duty/publish', 'POST', { weekStart: week })
  t('publish', pub.s === 200)
  const pub1 = await call(null, `/api/public/duty/${itemId}`)
  const shown = ours(pub1.j?.data)
  t('published roster shown on the screen', shown.length === 2 && shown[0].entries.some(e => e.staffName?.includes('דנה')), JSON.stringify(shown).slice(0, 300))
  t('missing assignment shown as unassigned', shown.find(p => p.periodId === p2)?.entries.every(e => e.status === 'unassigned'))
  await assign(A, s3, yard, p2)
  const pub2 = await call(null, `/api/public/duty/${itemId}`)
  t('later draft changes stay hidden until published', ours(pub2.j?.data).find(p => p.periodId === p2)?.entries.every(e => e.status === 'unassigned'))
  t('week shows unpublished changes', (await call(A, `/api/duty/week?start=${week}`)).j?.data?.status === 'changed')

  // 6–7. Absence, suggestion, substitution.
  const abs = await call(A, '/api/duty/absence', 'POST', { staffId: s1, date: today, periodId: null, reason: 'מחלה' })
  t('mark a teacher absent', abs.s === 201)
  const wk2 = (await call(A, `/api/duty/week?start=${week}`)).j?.data
  const target = wk2.assignments.find(a => a.staffId === s1 && a.periodId === p1)
  t('absence marks the assignment as needing a substitute', wk2.impacted.some(i => i.assignmentId === target.id && !i.substituteStaffId))
  const pub3 = await call(null, `/api/public/duty/${itemId}`)
  t(`screen shows "טרם שובץ מחליף" status`, ours(pub3.j?.data).find(p => p.periodId === p1)?.entries.some(e => e.status === 'needs_substitute'))
  const sug = await call(A, `/api/duty/suggest?start=${week}&date=${today}&periodId=${p1}&locationId=${yard}&exclude=${s1}`)
  const sugIds = (sug.j?.data ?? []).map(s => s.staffId)
  t('suggestions exclude the absent and the busy, with reasons', sug.s === 200 && !sugIds.includes(s1) && !sugIds.includes(s2) && sugIds.includes(s4) && sug.j.data[0].reasons.length >= 2, JSON.stringify(sugIds))
  const busySub = await call(A, '/api/duty/substitution', 'POST', { assignmentId: target.id, substituteStaffId: s2 })
  t('busy substitute rejected', busySub.s === 409)
  const sub = await call(A, '/api/duty/substitution', 'POST', { assignmentId: target.id, substituteStaffId: s4 })
  t('approve a substitute', sub.s === 201)
  const pub4 = await call(null, `/api/public/duty/${itemId}`)
  const e4 = ours(pub4.j?.data).find(p => p.periodId === p1)?.entries.find(e => e.locationName.includes('חצר'))
  t('screen shows the substitute; the original assignment is kept', e4?.status === 'substitute' && e4?.substituteName?.includes('David') && !!(await db.dutyAssignment.findUnique({ where: { id: target.id } })), JSON.stringify(e4))

  // 5. Copy to the next week.
  const copy = await call(A, '/api/duty/copy', 'POST', { from: week, to: nextWeek })
  t('copy roster to another week', copy.s === 200 && copy.j?.data?.copied >= 3, copy.text.slice(0, 200))
  const again = await call(A, '/api/duty/copy', 'POST', { from: week, to: nextWeek })
  t('copy onto a non-empty week needs confirmation (replace)', again.s === 409)

  // 12. Isolation.
  const bSetup = await call(B, '/api/duty/setup')
  t('another school does not see the roster', bSetup.s === 200 && !(bSetup.j?.data?.staff ?? []).some(s => made.staff.includes(s.id)))
  const bPatch = await call(B, '/api/duty/staff', 'PATCH', { id: s1, firstName: 'x' })
  const bDel = await call(B, '/api/duty/assign?id=' + target.id, 'DELETE')
  const bSub = await call(B, '/api/duty/substitution', 'POST', { assignmentId: target.id, substituteStaffId: s3 })
  t('another school cannot change records by id', bPatch.s === 404 && bDel.s === 404 && bSub.s === 404, `${bPatch.s} ${bDel.s} ${bSub.s}`)
  const bAccess = await call(B, '/api/duty/access', 'POST', { userId: made.users[0], dutyAccess: 'PUBLISH' })
  t("another school's admin cannot grant access to this school's users", bAccess.s === 404)

  // 13. Permissions.
  t('editor without roster access: no access', (await call(NONE, '/api/duty/setup')).s === 403 && (await call(NONE, `/api/duty/week?start=${week}`)).s === 403)
  t('VIEW: can read, cannot change', (await call(VIEW, `/api/duty/week?start=${week}`)).s === 200 && (await assign(VIEW, s3, hall, p2)).s === 403 && (await call(VIEW, '/api/duty/staff', 'POST', { firstName: 'x', lastName: 'y' })).s === 403)
  t('EDIT: can change the draft', (await assign(EDIT, s3, hall, p2, addDays(today, 0))).s !== 403)
  t('EDIT: cannot change school rules or access', (await call(EDIT, '/api/duty/settings', 'POST', { schoolDays: all, maxPerDay: null, maxPerWeek: null, allowOverride: true })).s === 403 && (await call(EDIT, '/api/duty/access')).s === 403)
  t('signed out: no access', (await call(null, '/api/duty/setup')).s === 401)

  // 14. After a refresh the published roster is read again from the database.
  const fresh = await call(null, `/api/public/duty/${itemId}`)
  t('after refresh: same published roster', JSON.stringify(ours(fresh.j?.data)) === JSON.stringify(ours(pub4.j?.data)))
  t('a disabled screen shows nothing', await db.screen.update({ where: { id: screen.id }, data: { active: false } }).then(() => call(null, `/api/public/duty/${itemId}`)).then(r => r.j?.data === null))
} catch (e) {
  t('run', false, e.message)
} finally {
  await db.screen.deleteMany({ where: { id: { in: made.screens } } }).catch(() => {})
  await db.dutyStaff.deleteMany({ where: { id: { in: made.staff } } }).catch(() => {})
  await db.dutyLocation.deleteMany({ where: { id: { in: made.locations } } }).catch(() => {})
  await db.dutyPeriod.deleteMany({ where: { id: { in: made.periods } } }).catch(() => {})
  await db.dutyWeek.deleteMany({ where: { schoolId: ids.schoolA, assignments: { none: {} }, createdAt: { gte: started } } }).catch(() => {})
  await db.dutyAuditEvent.deleteMany({ where: { schoolId: ids.schoolA, createdAt: { gte: started } } }).catch(() => {})
  await db.user.deleteMany({ where: { id: { in: made.users } } }).catch(() => {})
  if (settingsBefore) { const { id: _id, updatedAt: _u, ...rest } = settingsBefore; await db.dutySettings.update({ where: { schoolId: ids.schoolA }, data: rest }).catch(() => {}) }
  else await db.dutySettings.deleteMany({ where: { schoolId: ids.schoolA } }).catch(() => {})
  await db.$disconnect()
  finish()
}
