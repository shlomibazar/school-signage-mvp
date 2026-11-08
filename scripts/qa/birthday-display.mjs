// Integration tests: birthdays on screens (regions and footer ticker) from the central registry —
// permissions, saving and persistence, public data minimization, filters, footer with the regular
// ticker, empty states, legacy cards, editor preview vs. public screen, school isolation.
//
// LOCAL TEST ENVIRONMENT ONLY (see ./_local.mjs). Everything happens in a temporary school (with
// temporary EDITOR/VIEWER users; random passwords never printed) plus one synthetic person in school B
// for the isolation check; all of it is removed at the end. Synthetic data only.
//
//   QA_CREDS_FILE=/path/outside/repo/qa-users.json npm run test:qa:birthday-display
import crypto from 'node:crypto'
import path from 'node:path'
import { createRequire } from 'node:module'
import { ROOT, db, ids, login, call, reporter } from './_local.mjs'

const require = createRequire(path.join(ROOT, 'package.json'))
const bcrypt = require('bcryptjs')
const { t, finish } = reporter()
const TAG = 'QAD'
const users = []
let schoolId = null, otherPersonId = null

// Today's day and month in the school's time zone (the server computes in Asia/Jerusalem).
const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(p => [p.type, p.value]))
const MD = `${parts.month}-${parts.day}`
const otherMonth = String((Number(parts.month) % 12) + 1).padStart(2, '0')
// Feb 29 cannot be "today" in a test run on another date; it is covered by the unit tests.
const born = (year, md = MD) => new Date(`${year}-${md === '02-29' ? '02-28' : md}T00:00:00Z`)
const LAST = 'קודקודי' // a synthetic last name that must never reach the screen with "first name" format

const tempUser = async (role, school) => {
  const password = crypto.randomBytes(18).toString('base64url')
  const email = `qa-bday-${role.toLowerCase()}-${Date.now()}-${users.length}@qa.local`
  const u = await db.user.create({ data: { email, name: `${TAG} ${role}`, role, schoolId: school, passwordHash: await bcrypt.hash(password, 10) } })
  users.push(u.id)
  return login({ email, password })
}
const person = (school, first, birthDate, role, grade = null, className = null, active = true) => db.person.create({ data: {
  schoolId: school, firstName: first, lastName: LAST, birthDate, active, dataSource: 'MANUAL',
  roles: { create: [{ role, grade, className, parallel: null, active: true }] },
} })
const LAYOUT = {
  headerEnabled: true, headerHeight: 80, headerTitleFontSize: 26, headerTitleFontWeight: 700, headerShowLogo: true, headerShowTitle: true,
  headerShowClock: true, headerShowDate: true, headerShowParasha: false, headerShowHebDate: true, headerDateType: 'BOTH',
  headerShowWeather: false, headerScrollText: null, mainSections: 3, footerEnabled: true, footerHeight: 48,
  footerTicker: 'הודעת בית ספר רגילה', footerFeedMode: 'manual', footerRssUrl: null, footerRssMaxItems: 8, footerRssRefreshMinutes: 15,
  footerTickerSpeed: 'normal', footerShowSchoolName: true, footerShowClock: false, footerShowBirthdays: false,
  bgColor: null, bgImageUrl: null, fontFamily: 'Heebo',
}

try {
  const school = await db.school.create({ data: { name: `${TAG} בית ספר זמני`, slug: `qa-bday-${Date.now()}` } })
  schoolId = school.id
  const E = await tempUser('EDITOR', schoolId), V = await tempUser('VIEWER', schoolId), EB = await tempUser('EDITOR', ids.schoolB)
  // Synthetic registry: today's birthdays (students of two grades, a teacher), one inactive, one in
  // another month; and a person of school B born on the same day (must never appear here).
  await person(schoolId, 'נועה', born(2012), 'STUDENT', 'ט׳', 'ט׳ 2')
  await person(schoolId, 'איתי', born(2013), 'STUDENT', 'ח׳', 'ח׳ 1')
  await person(schoolId, 'דנה', born(1981), 'TEACHER')
  await person(schoolId, 'רוני', born(2012), 'STUDENT', 'ט׳', 'ט׳ 3', false)
  await person(schoolId, 'מאיה', born(2012, `${otherMonth}-15`), 'STUDENT', 'ט׳', 'ט׳ 1')
  otherPersonId = (await person(ids.schoolB, 'זרה', born(2012), 'STUDENT', 'ט׳', 'ט׳ 1')).id

  const screen = await db.screen.create({ data: { schoolId, name: `${TAG} מסך`, slug: `qa-bday-${Date.now()}`, layout: { create: { ...LAYOUT } },
    sections: { create: [{ position: 0, widthPct: 34 }, { position: 1, widthPct: 33 }, { position: 2, widthPct: 33 }] } }, include: { sections: { orderBy: { position: 'asc' } } } })
  const [s0, s1, s2] = screen.sections
  const pub = async () => (await call(null, `/screen/${screen.slug}`)).text
  const save = (section, settings) => call(E, `/api/screens/${screen.id}/sections/${section.id}/content`, 'POST', { contentType: 'BIRTHDAYS', active: true, settings })
  const putLayout = patch => call(E, `/api/screens/${screen.id}/layout`, 'PUT', { layout: { ...LAYOUT, ...patch }, sections: screen.sections.map(s => ({ position: s.position, widthPct: s.widthPct })) })

  // ── Editor preview API: permissions ────────────────────────────────────────────────────────
  const qs = 'audience=ALL&period=today&grades=&nameFormat=first'
  t('preview API: anonymous 401, VIEWER 403', (await call(null, `/api/screens/${screen.id}/birthdays?${qs}`)).s === 401 && (await call(V, `/api/screens/${screen.id}/birthdays?${qs}`)).s === 403)
  t('preview API: another school\'s editor → 404', (await call(EB, `/api/screens/${screen.id}/birthdays?${qs}`)).s === 404)
  const pv = await call(E, `/api/screens/${screen.id}/birthdays?${qs}`)
  t('preview API: EDITOR gets today\'s list (active, own school) and the school\'s grades', pv.s === 200 && JSON.stringify(pv.j.data.list.items.map(b => b.name).sort()) === JSON.stringify(['איתי', 'דנה', 'נועה'].sort())
    && JSON.stringify(pv.j.data.grades) === JSON.stringify(['ח׳', 'ט׳']), pv.text.slice(0, 300))
  t('preview API: minimal fields only (no ids, last names, years, dates)', pv.j.data.list.items.every(b => Object.keys(b).sort().join() === 'className,day,month,name,role')
    && !pv.text.includes(LAST) && !/(19|20)\d\d-\d\d/.test(pv.text) && !pv.text.includes('"id"'))

  // ── Region: saving keeps display settings only; legacy fields are dropped ────────────────
  const r0 = await save(s0, { mode: 'registry', audience: 'ALL', period: 'today', grades: [], nameFormat: 'first', title: '', greetingText: 'מזל טוב!', personName: 'הוקלד ידנית', birthDate: '2012-01-01', list: { items: [{ name: 'מזויף' }] } })
  const stored0 = (await db.contentItem.findFirst({ where: { sectionId: s0.id } }))?.settings
  t('region saved (EDITOR); stored settings are display settings only', [200, 201].includes(r0.s) && stored0?.mode === 'registry' && !('personName' in stored0) && !('birthDate' in stored0) && !('list' in stored0), `${r0.s} ${JSON.stringify(stored0)}`)
  t('region settings persist (the editor reopens what was saved)', (await call(E, `/api/screens/${screen.id}/sections/${s0.id}/content`)).text.includes('"audience":"ALL"'))
  t('VIEWER cannot save a region', (await call(V, `/api/screens/${screen.id}/sections/${s0.id}/content`, 'POST', { contentType: 'BIRTHDAYS', settings: {} })).s === 403)

  // ── Public screen: registry region ─────────────────────────────────────────────────────────
  let html = await pub()
  t('public screen: region shows today\'s students (with class) and teacher', html.includes('נועה') && html.includes('ט׳ 2') && html.includes('איתי') && html.includes('דנה') && html.includes('צוות המורים'))
  t('public screen: inactive person, other month and other school\'s person not shown', !html.includes('רוני') && !html.includes('מאיה') && !html.includes('זרה'))
  t('public screen: no last name, birth year, full date, ids or identity data', !html.includes(LAST) && !html.includes('2012-') && !html.includes('1981') && !html.includes('identityHint') && !html.includes('identityKey') && !html.includes('הוקלד ידנית') && !html.includes('מזויף'))
  t('public screen: heading for the range', html.includes('ימי הולדת היום'))

  // Filters, in other regions (any region position works).
  await save(s1, { mode: 'registry', audience: 'STUDENT', period: 'today', grades: ['ח׳'], nameFormat: 'full' })
  await save(s2, { mode: 'registry', audience: 'TEACHER', period: 'month', grades: ['ט׳'] })
  const preview1 = await call(E, `/api/screens/${screen.id}/birthdays?audience=STUDENT&period=today&grades=${encodeURIComponent('ח׳')}&nameFormat=full`)
  t('grade filter + full name (region 2): only the ח׳ student, with last name', JSON.stringify(preview1.j.data.list.items.map(b => b.name)) === JSON.stringify([`איתי ${LAST}`]))
  const preview2 = await call(E, `/api/screens/${screen.id}/birthdays?audience=TEACHER&period=month&grades=${encodeURIComponent('ט׳')}`)
  t('teachers with a grade filter (region 3): teachers still shown', JSON.stringify(preview2.j.data.list.items.map(b => b.name)) === JSON.stringify(['דנה']))
  html = await pub()
  t('public screen renders all three regions\' lists (full name only where configured)', html.includes(`איתי ${LAST}`) && (html.match(new RegExp(LAST, 'g')) ?? []).length === (html.match(new RegExp(`איתי ${LAST}`, 'g')) ?? []).length)

  // ── Footer ticker ──────────────────────────────────────────────────────────────────────────
  t('footer off: no birthday segment, regular ticker unchanged', !html.includes('יום הולדת שמח') && html.includes('הודעת בית ספר רגילה'))
  const lay = await putLayout({ footerShowBirthdays: true, footerBirthdayAudience: 'ALL', footerBirthdayPeriod: 'today', footerBirthdayGrades: [], footerBirthdayNameFormat: 'first' })
  const storedLayout = await db.screenLayout.findUnique({ where: { screenId: screen.id } })
  t('footer settings saved and persisted', lay.s === 200 && storedLayout.footerShowBirthdays && storedLayout.footerBirthdayAudience === 'ALL' && storedLayout.footerBirthdayPeriod === 'today', lay.text.slice(0, 200))
  html = await pub()
  const seg = html.indexOf('🎂 יום הולדת שמח'), reg = html.indexOf('הודעת בית ספר רגילה', seg)
  t('footer: birthday segment first, then the regular ticker (both kept)', seg >= 0 && reg > seg && html.includes('המורה דנה') && html.includes('נועה (ט׳ 2)'))
  await putLayout({ footerShowBirthdays: true, footerBirthdayAudience: 'STUDENT', footerBirthdayGrades: ['ט׳'], footerFeedMode: 'rss', footerRssUrl: 'https://example.invalid/feed.xml' })
  html = await pub()
  t('footer in RSS mode: birthday segment still shown (filtered: ט׳ students only)', html.includes('🎂 יום הולדת שמח: נועה (ט׳ 2)') && !html.includes('המורה דנה'))
  await putLayout({ footerShowBirthdays: true, footerBirthdayAudience: 'TEACHER', footerBirthdayPeriod: 'today', footerBirthdayGrades: [] })
  await db.person.updateMany({ where: { schoolId, roles: { some: { role: 'TEACHER' } } }, data: { active: false } })
  html = await pub()
  t('footer with nobody in range: no empty segment, regular ticker intact', !html.includes('יום הולדת שמח') && html.includes('הודעת בית ספר רגילה'))
  await db.person.updateMany({ where: { schoolId, roles: { some: { role: 'TEACHER' } } }, data: { active: true } })

  // Footer works without any birthday region.
  await db.contentItem.deleteMany({ where: { sectionId: { in: [s0.id, s1.id, s2.id] } } })
  await putLayout({ footerShowBirthdays: true, footerBirthdayAudience: 'ALL', footerBirthdayPeriod: 'today', footerBirthdayGrades: [] })
  html = await pub()
  t('footer works with no birthday region on the screen', html.includes('🎂 יום הולדת שמח') && html.includes('המורה דנה'))

  // ── Empty region; legacy card ─────────────────────────────────────────────────────────────
  await save(s0, { mode: 'registry', audience: 'STUDENT', period: 'today', grades: ['א׳'] })
  html = await pub()
  t('region with nobody in range: friendly empty state (not blank)', html.includes('אין ימי הולדת היום'))
  await db.contentItem.updateMany({ where: { sectionId: s0.id }, data: { settings: { personName: 'כרטיס ישן', grade: 'ה׳', birthDate: '2015-04-12', greetingText: 'מזל טוב' } } })
  html = await pub()
  t('legacy card (never re-saved) still renders as before, without its birth date', html.includes('כרטיס ישן') && !html.includes('2015-04-12'))
  t('legacy card does not feed the footer (footer = registry only)', !html.includes('יום הולדת שמח כרטיס ישן'))

  // ── Preview vs. public screen ───────────────────────────────────────────────────────────────
  await save(s0, { mode: 'registry', audience: 'ALL', period: 'today', grades: [] })
  html = await pub()
  const preview = (await call(E, `/api/screens/${screen.id}/birthdays?${qs}`)).j.data.list.items.map(b => b.name)
  t('editor preview list = public screen list (same people, same order of names in the region)', preview.length === 3 && preview.every(n => html.includes(n)))

  // ── Registry changes reach the screen on its next refresh ─────────────────────────────────
  await person(schoolId, 'חדשה', born(2014), 'STUDENT', 'ז׳', 'ז׳ 1')
  t('a person added to the registry appears on the next page load', (await pub()).includes('חדשה'))
} catch (e) {
  t('no unexpected error', false, e?.stack || String(e))
} finally {
  if (otherPersonId) await db.person.deleteMany({ where: { id: otherPersonId } })
  await db.user.deleteMany({ where: { id: { in: users } } })
  if (schoolId) await db.school.delete({ where: { id: schoolId } })
  t('cleanup: temporary school, people and users removed', (await db.school.count({ where: { name: { startsWith: TAG } } })) === 0 && (await db.user.count({ where: { name: { startsWith: TAG } } })) === 0
    && (await db.person.count({ where: { firstName: 'זרה', lastName: LAST } })) === 0)
  await db.$disconnect()
  finish()
}
