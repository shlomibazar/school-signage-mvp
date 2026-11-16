// Integration tests: the three ways of planning duties (weekly, recurring template, hybrid) through
// the API, with the public screen endpoint.
//
// LOCAL TEST ENVIRONMENT ONLY (see ./_local.mjs). Creates temporary staff, locations, periods, a
// template, calendar days, a screen with a duty region and one VIEW user in school A; user B checks
// isolation. Everything created is removed at the end.
//
//   QA_CREDS_FILE=/path/outside/repo/qa-users.json npm run test:qa:duty-templates
import crypto from 'node:crypto'
import path from 'node:path'
import { createRequire } from 'node:module'
import { ROOT, creds, db, ids, login, call, reporter } from './_local.mjs'

const require = createRequire(path.join(ROOT, 'package.json'))
const bcrypt = require('bcryptjs')
const { t, finish } = reporter()
const TAG = 'QA-TPL'
const started = new Date()
const made = { users: [], screens: [] }
const settingsBefore = await db.dutySettings.findUnique({ where: { schoolId: ids.schoolA } })
const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(p => [p.type, p.value]))
const today = `${parts.year}-${parts.month}-${parts.day}`
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10)
const W0 = addDays(today, -new Date(today + 'T00:00:00Z').getUTCDay()), W1 = addDays(W0, 7), W2 = addDays(W0, 14)
const D = (w, wd) => addDays(w, wd)
const wdToday = new Date(today + 'T00:00:00Z').getUTCDay()

try {
  const A = await login(creds.A), B = await login(creds.B)
  const pw = crypto.randomBytes(18).toString('base64url'), email = `qa-tpl-view-${Date.now()}@qa.local`
  made.users.push((await db.user.create({ data: { email, name: `${TAG} VIEW`, role: 'EDITOR', dutyAccess: 'VIEW', schoolId: ids.schoolA, passwordHash: await bcrypt.hash(pw, 10) } })).id)
  const VIEW = await login({ email, password: pw })
  const all7 = [0, 1, 2, 3, 4, 5, 6]
  const set = mode => call(A, '/api/duty/settings', 'POST', { schoolDays: all7, maxPerDay: null, maxPerWeek: null, allowOverride: true, scheduleMode: mode })
  await set('RECURRING')
  const mk = async (kind, body) => (await call(A, '/api/duty/' + kind, 'POST', body)).j?.data?.id
  const s = []
  for (const n of ['דנה', 'יוסי', 'מיכל', 'רונית', 'אבי']) s.push(await mk('staff', { firstName: `${TAG} ${n}`, lastName: '' }))
  const temp = await mk('staff', { firstName: `${TAG} זמני`, lastName: '', kind: 'TEMPORARY', validUntil: addDays(W1, 2) })
  const yard = await mk('location', { name: `${TAG} חצר`, staffNeeded: 1, required: true })
  const hall = await mk('location', { name: `${TAG} מסדרון`, staffNeeded: 1, required: true })
  const p1 = await mk('period', { name: `${TAG} הפסקה 1`, startTime: '10:00', endTime: '10:20', weekdays: all7 })
  const ours = d => (d?.periods ?? []).filter(p => p.periodId === p1)
  const week = async w => (await call(A, `/api/duty/week?start=${w}`)).j?.data
  const mine = (wk, wd, loc) => (wk?.assignments ?? []).filter(a => a.date === D(wk.weekStart, wd) && a.periodId === p1 && a.locationId === loc)

  // ── A. Recurring template ──
  const tpl = (await call(A, '/api/duty/template', 'POST', { name: `${TAG} קבוע`, effectiveFrom: W0, effectiveUntil: null })).j?.data?.id
  t('recurring: template created', !!tpl)
  const entry = async (wd, loc, staffId) => (await call(A, '/api/duty/template-entry', 'POST', { templateId: tpl, weekday: wd, periodId: p1, locationId: loc, staffId })).j?.data?.id
  const eYard = []; for (let wd = 0; wd < 7; wd++) eYard.push(await entry(wd, yard, s[wd % 5]))
  const eHall = []; for (let wd = 0; wd < 7; wd++) eHall.push(await entry(wd, hall, s[(wd + 1) % 5]))
  const clash = await call(A, '/api/duty/template-entry', 'POST', { templateId: tpl, weekday: 0, periodId: p1, locationId: hall, staffId: s[0] })
  t('recurring: same person twice at the same time is refused in the template', clash.s === 409)
  const w0 = await week(W0), w2 = await week(W2)
  t('recurring: weeks follow the template automatically', mine(w0, 0, yard)[0]?.origin === 'template' && mine(w2, 3, yard)[0]?.staffId === s[3])
  const weekRow = await db.dutyWeek.findFirst({ where: { schoolId: ids.schoolA, weekStart: new Date(W2 + 'T00:00:00Z') } })
  t('recurring: no rows are stored for future weeks', !weekRow || (await db.dutyAssignment.count({ where: { weekId: weekRow.id } })) === 0)

  // Screen + publish.
  const screen = await db.screen.create({ data: { schoolId: ids.schoolA, name: `${TAG} screen`, slug: `qa-tpl-${Date.now()}`, layout: { create: { mainSections: 1 } },
    sections: { create: [{ position: 0, widthPct: 100, contentItems: { create: [{ contentType: 'DUTY_ROSTER', active: true, settings: { mode: 'day' } }] } }] } }, include: { sections: { include: { contentItems: true } } } })
  made.screens.push(screen.id)
  const item = screen.sections[0].contentItems[0].id
  const tv = async () => ours((await call(null, `/api/public/duty/${item}`)).j?.data)
  t('publish a recurring week', (await call(A, '/api/duty/publish', 'POST', { weekStart: W0 })).s === 200)
  const tv0 = await tv()
  t('screen shows the template duty of today', tv0[0]?.entries.some(e => e.staffName?.includes(['דנה', 'יוסי', 'מיכל', 'רונית', 'אבי'][wdToday % 5])), JSON.stringify(tv0).slice(0, 200))

  // ── C. Hybrid: one-time changes ──
  const occ = mine(w0, wdToday, yard)[0]
  const once = await call(A, '/api/duty/move', 'POST', { id: occ.id, weekStart: W0, staffId: s[4] === occ.staffId ? s[3] : s[4] })
  const w0b = await week(W0)
  const ch = mine(w0b, wdToday, yard)[0]
  t('one-time change: the occurrence becomes an override for that date', once.s === 200 && ch?.origin === 'override' && ch.entryId === eYard[wdToday])
  t('one-time change does not change the template (next week unchanged)', mine(await week(W1), wdToday, yard)[0]?.staffId === occ.staffId)
  t('draft change after publishing: week marked changed, screen unchanged', w0b.status === 'changed' && JSON.stringify(await tv()) === JSON.stringify(tv0))
  t('revert a one-time change to the template', (await call(A, '/api/duty/revert', 'POST', { entryId: eYard[wdToday], date: today })).s === 200 && mine(await week(W0), wdToday, yard)[0]?.origin === 'template')
  const cancel = await call(A, `/api/duty/assign?id=${encodeURIComponent(mine(await week(W0), wdToday, hall)[0].id)}`, 'DELETE')
  const w0c = await week(W0)
  t('cancel a duty for one date (template kept, shown as cancelled, slot uncovered)', cancel.s === 200 && !mine(w0c, wdToday, hall).length && w0c.cancelled.some(c => c.entryId === eHall[wdToday]) && w0c.gaps.some(g => g.date === today && g.locationId === hall))
  await call(A, '/api/duty/revert', 'POST', { entryId: eHall[wdToday], date: today })
  const add = await call(A, '/api/duty/assign', 'POST', { weekStart: W0, date: today, periodId: p1, locationId: yard, staffId: s[4] === occ.staffId || s[4] === mine(w0c, wdToday, hall)[0]?.staffId ? s[2] : s[4] })
  t('add an individual duty to a template week (warning: location full)', add.s === 201 && add.j.data.warnings.some(w => w.code === 'LOCATION_FULL'))
  if (add.j?.data?.id) await call(A, `/api/duty/assign?id=${add.j.data.id}`, 'DELETE')

  // ── Template change from a date on (future only) ──
  const fromDate = D(W1, 1)
  const fut = await call(A, '/api/duty/change-future', 'POST', { entryId: eYard[1], fromDate, staffId: s[4] }) // free on Mondays (yard s1, hall s2)
  const versions = (await call(A, '/api/duty/templates')).j?.data?.filter(x => x.name === `${TAG} קבוע`) ?? []
  t('change from a date: the template splits into two versions', fut.s === 200 && fut.j.data.split && versions.length === 2 && versions[0].effectiveUntil === addDays(fromDate, -1) && versions[1].effectiveFrom === fromDate)
  t('…earlier dates keep the old person, later dates get the new one', mine(await week(W0), 1, yard)[0]?.staffId === s[1] && mine(await week(W1), 1, yard)[0]?.staffId === s[4] && mine(await week(W2), 1, yard)[0]?.staffId === s[4])
  t('…the published roster of this week is unchanged', JSON.stringify(await tv()) === JSON.stringify(tv0))

  // ── Calendar ──
  await call(A, '/api/duty/calendar', 'POST', { date: D(W1, 2), kind: 'HOLIDAY', name: `${TAG} חג` })
  const w1 = await week(W1)
  t('holiday: no template duties and no gaps that day', !w1.assignments.some(a => a.date === D(W1, 2)) && !w1.gaps.some(g => g.date === D(W1, 2)))
  const onHoliday = await call(A, '/api/duty/assign', 'POST', { weekStart: W1, date: D(W1, 2), periodId: p1, locationId: yard, staffId: s[0] })
  t('holiday: assigning is refused with the holiday name', onHoliday.s === 409 && /QA-TPL חג/.test(onHoliday.j?.error ?? ''))

  // ── Temporary staff in the template ──
  const tEntry = await call(A, '/api/duty/template-entry', 'POST', { templateId: versions[1].id, weekday: 4, periodId: p1, locationId: hall, staffId: temp, replaceEntryId: (await call(A, '/api/duty/templates')).j.data.find(x => x.id === versions[1].id).entries.find(e => e.weekday === 4 && e.locationId === hall).id })
  t('temporary teacher in the template: on duty while valid, not after', tEntry.s === 201 && !mine(await week(W1), 4, hall).some(a => a.staffId === temp) && (await week(W1)).gaps.some(g => g.date === D(W1, 4) && g.locationId === hall))

  // ── Absence and substitute on a template duty ──
  const todayOcc = mine(await week(W0), wdToday, yard)[0]
  await call(A, '/api/duty/absence', 'POST', { staffId: todayOcc.staffId, date: today, periodId: null })
  const sub = await call(A, '/api/duty/substitution', 'POST', { assignmentId: todayOcc.id, substituteStaffId: [...s].find(x => !(w0.assignments.some(a => a.date === today && a.staffId === x))) })
  const tvSub = await tv()
  t('substitute for a recurring duty, shown on the screen without republishing', sub.s === 201 && tvSub[0]?.entries.some(e => e.status === 'substitute'), JSON.stringify(sub.j))

  // ── B / D. Weekly and hybrid planning ──
  const ind = await call(A, '/api/duty/week-template', 'POST', { weekStart: W2, useTemplate: false })
  const w2b = await week(W2)
  t('independent week: template duties become the week’s own rows', ind.s === 200 && !w2b.useTemplate && w2b.assignments.length > 0 && w2b.assignments.every(a => a.origin === 'week'))
  await call(A, '/api/duty/change-future', 'POST', { entryId: (await call(A, '/api/duty/templates')).j.data.find(x => x.id === versions[1].id).entries.find(e => e.weekday === 0 && e.locationId === yard).id, fromDate: W2, staffId: s[3] })
  t('…template changes do not affect an independent week', mine(await week(W2), 0, yard)[0]?.staffId === w2b.assignments.find(a => a.date === W2 && a.locationId === yard)?.staffId)
  t('back to the template: the week follows it again', (await call(A, '/api/duty/week-template', 'POST', { weekStart: W2, useTemplate: true })).s === 200 && mine(await week(W2), 0, yard)[0]?.origin === 'template')
  await set('WEEKLY')
  const W5 = addDays(W0, 35)
  t('weekly mode: a new week starts empty (no template)', (await week(W5)).assignments.length === 0 && (await week(W5)).useTemplate === false)
  const ap = await call(A, '/api/duty/apply-template', 'POST', { weekStart: W5, templateId: versions[1].id })
  t('weekly mode: copy a saved template into a week', ap.s === 200 && ap.j.data.copied > 0 && (await week(W5)).assignments.every(a => a.origin === 'week'))
  const w5weekly = JSON.stringify((await week(W5)).assignments.map(a => [a.date, a.locationId, a.staffId]))
  await set('HYBRID')
  const w5h = await week(W5)
  t('switching weekly → hybrid: a week planned on its own stays as planned (template not doubled on top)', !w5h.useTemplate && w5h.assignments.every(a => a.origin === 'week') && JSON.stringify(w5h.assignments.map(a => [a.date, a.locationId, a.staffId])) === w5weekly)
  t('changing the mode keeps history (published roster unchanged)', JSON.stringify(await tv()) === JSON.stringify(tvSub))

  // ── Concurrent edits and failed saves ──
  const W3 = addDays(W0, 21)
  await call(A, '/api/duty/week-template', 'POST', { weekStart: W3, useTemplate: false })
  const both = await Promise.all([hall, yard].map(loc => call(A, '/api/duty/assign', 'POST', { weekStart: W3, date: D(W3, 3), periodId: p1, locationId: loc, staffId: s[0] })))
  const w3 = await week(W3)
  const s0 = w3.assignments.filter(a => a.date === D(W3, 3) && a.staffId === s[0])
  t('concurrent edits: the same person cannot be saved twice at the same time', both.filter(r => r.s === 201).length <= 1 && s0.length === 1, both.map(r => r.s).join(','))
  const before = JSON.stringify((await week(W3)).assignments)
  const bad = await call(A, '/api/duty/assign', 'POST', { weekStart: W3, date: D(W3, 3), periodId: p1, locationId: yard, staffId: 'nope' })
  t('failed save leaves the draft unchanged', bad.s >= 400 && JSON.stringify((await week(W3)).assignments) === before)

  // ── Isolation and permissions ──
  const bTpl = await call(B, '/api/duty/template-entry', 'POST', { templateId: tpl, weekday: 0, periodId: p1, locationId: yard, staffId: s[0] })
  const bRev = await call(B, '/api/duty/revert', 'POST', { entryId: eYard[0], date: W0 })
  const bCal = await call(B, `/api/duty/calendar?id=${(await db.dutyCalendarDay.findFirst({ where: { schoolId: ids.schoolA, name: `${TAG} חג` } })).id}`, 'DELETE')
  const bTpls = (await call(B, '/api/duty/templates')).j?.data ?? []
  t('isolation: another school cannot read or change templates, one-time changes or calendar', bTpl.s === 404 && bRev.s === 404 && bCal.s === 404 && !bTpls.some(x => x.name?.startsWith(TAG)))
  t('permissions: VIEW can read templates but not change them', (await call(VIEW, '/api/duty/templates')).s === 200 && (await call(VIEW, '/api/duty/template', 'POST', { name: 'x', effectiveFrom: W0, effectiveUntil: null })).s === 403 && (await call(VIEW, '/api/duty/change-future', 'POST', { entryId: eYard[0], fromDate: W1, staffId: s[0] })).s === 403)
} catch (e) {
  t('run', false, e.stack?.split('\n').slice(0, 2).join(' ') ?? e.message)
} finally {
  await db.screen.deleteMany({ where: { id: { in: made.screens } } }).catch(() => {})
  await db.dutyTemplate.deleteMany({ where: { schoolId: ids.schoolA, name: { startsWith: TAG } } }).catch(() => {})
  await db.dutyCalendarDay.deleteMany({ where: { schoolId: ids.schoolA, name: { startsWith: TAG } } }).catch(() => {})
  await db.dutyStaff.deleteMany({ where: { schoolId: ids.schoolA, firstName: { startsWith: TAG } } }).catch(() => {})
  await db.dutyLocation.deleteMany({ where: { schoolId: ids.schoolA, name: { startsWith: TAG } } }).catch(() => {})
  await db.dutyPeriod.deleteMany({ where: { schoolId: ids.schoolA, name: { startsWith: TAG } } }).catch(() => {})
  await db.dutyWeek.deleteMany({ where: { schoolId: ids.schoolA, createdAt: { gte: started } } }).catch(() => {})
  await db.dutyAuditEvent.deleteMany({ where: { schoolId: ids.schoolA, createdAt: { gte: started } } }).catch(() => {})
  await db.user.deleteMany({ where: { id: { in: made.users } } }).catch(() => {})
  if (settingsBefore) { const { id: _i, updatedAt: _u, ...rest } = settingsBefore; await db.dutySettings.update({ where: { schoolId: ids.schoolA }, data: rest }).catch(() => {}) }
  else await db.dutySettings.deleteMany({ where: { schoolId: ids.schoolA } }).catch(() => {})
  await db.$disconnect()
  finish()
}
