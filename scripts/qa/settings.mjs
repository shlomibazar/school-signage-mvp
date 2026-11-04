// Integration tests: school settings and per-screen settings (pages and the existing APIs they use).
//
// LOCAL TEST ENVIRONMENT ONLY (see ./_local.mjs). Creates a temporary screen and two temporary users
// of school A (EDITOR, VIEWER, random passwords that are never printed), changes school A's weather
// city, and restores / removes all of it at the end. No logo is uploaded (only rejected requests).
//
//   QA_CREDS_FILE=/path/outside/repo/qa-users.json npm run test:qa:settings
import crypto from 'node:crypto'
import path from 'node:path'
import { createRequire } from 'node:module'
import { ROOT, creds, db, ids, login, call, reporter } from './_local.mjs'

const require = createRequire(path.join(ROOT, 'package.json'))
const bcrypt = require('bcryptjs')
const { t, finish } = reporter()
const TAG = 'QA-SET'
const created = { screens: [], users: [] }
const original = await db.school.findUnique({ where: { id: ids.schoolA }, select: { logoUrl: true, weatherCity: true } })

const tempUser = async role => {
  const password = crypto.randomBytes(18).toString('base64url')
  const email = `qa-set-${role.toLowerCase()}-${Date.now()}@qa.local`
  const u = await db.user.create({ data: { email, name: `${TAG} ${role}`, role, schoolId: ids.schoolA, passwordHash: await bcrypt.hash(password, 10) } })
  created.users.push(u.id)
  return login({ email, password })
}
const schedule = async id => (await db.$queryRaw`SELECT "enabled", "startTime", "endTime", "days", "standbyMode" FROM "ScreenOperatingSchedule" WHERE "screenId" = ${id}`)[0]

try {
  const A = await login(creds.A), B = await login(creds.B)
  const roleA = (await db.user.findUnique({ where: { email: creds.A.email }, select: { role: true } })).role
  t(`user A is a school admin (${roleA})`, ['SCHOOL_ADMIN', 'SUPER_ADMIN'].includes(roleA))
  const E = await tempUser('EDITOR'), V = await tempUser('VIEWER')
  const s = await db.screen.create({ data: { schoolId: ids.schoolA, name: `${TAG} Lobby`, slug: `qa-set-${Date.now()}`, refreshSecs: 600, layout: { create: { headerEnabled: true, footerEnabled: true, mainSections: 1, headerShowLogo: true, headerShowWeather: true } }, sections: { create: [{ position: 0, widthPct: 100 }] } } })
  created.screens.push(s.id)
  const settingsUrl = `/admin/screens/${s.id}/settings`

  // ── Pages ──────────────────────────────────────────────────────────────────────────────────
  const anon = await call(null, settingsUrl)
  t('screen settings: anonymous is sent to login', [302, 303, 307, 308].includes(anon.s), `${anon.s}`)
  const pA = await call(A, settingsUrl)
  t('screen settings (admin): the right screen, with hours, refresh and management', pA.s === 200 && pA.text.includes(`${TAG} Lobby`) && pA.text.includes('שמירת שעות פעילות') && pA.text.includes('שמירת תדירות רענון') && pA.text.includes('מחיקת המסך') && pA.text.includes('השבתת המסך'), `${pA.s}`)
  t('screen settings: TV connection and timezone shown', pA.text.includes('חיבור טלוויזיה') && pA.text.includes('Asia/Jerusalem'))
  const pE = await call(E, settingsUrl)
  t('screen settings (EDITOR): read-only, no save or management, still edit + TV connection', pE.s === 200 && !pE.text.includes('שמירת שעות פעילות') && !pE.text.includes('שמירת תדירות רענון') && !pE.text.includes('מחיקת המסך') && pE.text.includes('עריכת מסך') && pE.text.includes('חיבור טלוויזיה') && pE.text.includes('לצפייה בלבד'))
  const pV = await call(V, settingsUrl)
  t('screen settings (VIEWER): read-only, no edit link', pV.s === 200 && !pV.text.includes('שמירת שעות פעילות') && !pV.text.includes('מחיקת המסך') && !pV.text.includes('עריכת מסך') && pV.text.includes('צפייה במסך'))
  t('screen settings: another school gets 404', (await call(B, settingsUrl)).s === 404)
  t('screen settings: unknown screen gets 404', (await call(A, '/admin/screens/does-not-exist/settings')).s === 404)

  const oA = await call(A, '/admin/settings')
  t('settings overview (admin): school details and a link to this screen\'s settings', oA.s === 200 && oA.text.includes('פרטי בית הספר') && oA.text.includes('שמירת פרטי בית הספר') && oA.text.includes(`href="${settingsUrl}"`))
  t('settings overview: no per-screen forms on the overview page', !oA.text.includes('שמירת שעות פעילות') && !oA.text.includes('שמירת תדירות רענון'))
  t('settings overview: another school\'s screen is not listed', !(await call(B, '/admin/settings')).text.includes(settingsUrl))
  const oE = await call(E, '/admin/settings')
  t('settings overview (EDITOR): may edit school details (as the API allows)', oE.s === 200 && oE.text.includes('שמירת פרטי בית הספר'))
  const oV = await call(V, '/admin/settings')
  t('settings overview (VIEWER): school details read-only', oV.s === 200 && !oV.text.includes('שמירת פרטי בית הספר') && oV.text.includes('לצפייה בלבד'))

  const list = await call(A, '/admin/screens')
  t('screens list: "הגדרות מסך" goes to this screen\'s settings', list.text.includes(`פעולות נוספות למסך ${TAG} Lobby`) && (await call(A, settingsUrl)).s === 200)
  const ed = await call(A, `/admin/editor?screen=${s.id}`)
  t('editor: school values read-only with a link to school settings', ed.s === 200 && ed.text.includes('ניהול בהגדרות בית הספר') && !ed.text.includes('שמור עיר') && !ed.text.includes('school-weather-city'))
  t('editor: per-screen logo / weather visibility toggles kept', ed.text.includes('הצג לוגו') && ed.text.includes('הצג מזג אוויר בכותרת'))

  // ── Operating hours API (unchanged rules) ──────────────────────────────────────────────────
  const hours = { enabled: true, startTime: '07:30', endTime: '16:00', days: [0, 1, 2, 3, 4], standbyMode: 'message' }
  t('hours: anonymous 401', (await call(null, `/api/screens/${s.id}/schedule`, 'PATCH', hours)).s === 401)
  t('hours: VIEWER 403', (await call(V, `/api/screens/${s.id}/schedule`, 'PATCH', hours)).s === 403)
  t('hours: EDITOR 403', (await call(E, `/api/screens/${s.id}/schedule`, 'PATCH', hours)).s === 403)
  t('hours: another school 404', (await call(B, `/api/screens/${s.id}/schedule`, 'PATCH', hours)).s === 404)
  t('hours: enabled without days is rejected (400)', (await call(A, `/api/screens/${s.id}/schedule`, 'PATCH', { ...hours, days: [] })).s === 400)
  t('hours: bad time is rejected (400)', (await call(A, `/api/screens/${s.id}/schedule`, 'PATCH', { ...hours, startTime: '25:00' })).s === 400)
  t('…nothing stored after rejected requests', !(await schedule(s.id)))
  const ok = await call(A, `/api/screens/${s.id}/schedule`, 'PATCH', hours)
  const st = await schedule(s.id)
  t('hours: admin saves and it persists', ok.s === 200 && st?.enabled === true && st.startTime === '07:30' && st.endTime === '16:00' && st.standbyMode === 'message' && st.days.join() === '0,1,2,3,4')
  const reload = await call(A, settingsUrl)
  t('hours: the settings page shows the saved values after reload', reload.text.includes('07:30') && reload.text.includes('16:00'))
  t('hours: the overview shows the summary', (await call(A, '/admin/settings')).text.includes('07:30–16:00 · א׳–ה׳'))

  // ── Refresh API (unchanged rules) ──────────────────────────────────────────────────────────
  t('refresh: EDITOR 403', (await call(E, `/api/screens/${s.id}/refresh`, 'PATCH', { refreshSecs: 300 })).s === 403)
  t('refresh: another school 404', (await call(B, `/api/screens/${s.id}/refresh`, 'PATCH', { refreshSecs: 300 })).s === 404)
  t('refresh: a value outside 5/10/15 minutes is rejected (400)', (await call(A, `/api/screens/${s.id}/refresh`, 'PATCH', { refreshSecs: 120 })).s === 400)
  const rf = await call(A, `/api/screens/${s.id}/refresh`, 'PATCH', { refreshSecs: 900 })
  t('refresh: admin saves and it persists', rf.s === 200 && (await db.screen.findUnique({ where: { id: s.id } })).refreshSecs === 900)

  // ── School details APIs (unchanged rules) ──────────────────────────────────────────────────
  const city = '32.0114,34.7748|חולון'
  t('weather city: VIEWER 403', (await call(V, `/api/schools/${ids.schoolA}/weather-city`, 'PUT', { city })).s === 403)
  t('weather city: another school 403', (await call(B, `/api/schools/${ids.schoolA}/weather-city`, 'PUT', { city })).s === 403)
  t('weather city: invalid value 400', (await call(A, `/api/schools/${ids.schoolA}/weather-city`, 'PUT', { city: '<script>' })).s === 400)
  const wc = await call(E, `/api/schools/${ids.schoolA}/weather-city`, 'PUT', { city })
  t('weather city: EDITOR saves and it persists', wc.s === 200 && (await db.school.findUnique({ where: { id: ids.schoolA } })).weatherCity === city)
  t('weather city: the editor reads the new value', (await call(A, `/admin/editor?screen=${s.id}`)).text.includes('חולון'))
  t('weather city: school B is unchanged', (await db.school.findUnique({ where: { id: ids.schoolB } })).weatherCity !== city || original.weatherCity === city)
  const form = () => { const f = new FormData(); f.append('file', new Blob([Buffer.from('89504e470d0a1a0a', 'hex')], { type: 'image/png' }), 'x.png'); return f }
  t('logo: VIEWER 403 (nothing uploaded)', (await call(V, `/api/schools/${ids.schoolA}/logo`, 'POST', form())).s === 403)
  t('logo: another school 403 (nothing uploaded)', (await call(B, `/api/schools/${ids.schoolA}/logo`, 'POST', form())).s === 403)
  t('logo: school logo unchanged', (await db.school.findUnique({ where: { id: ids.schoolA } })).logoUrl === original.logoUrl)
} catch (e) {
  t('no unexpected error', false, e?.stack || String(e))
} finally {
  await db.school.update({ where: { id: ids.schoolA }, data: { weatherCity: original.weatherCity, logoUrl: original.logoUrl } })
  await db.screen.deleteMany({ where: { id: { in: created.screens } } })
  await db.user.deleteMany({ where: { id: { in: created.users } } })
  const after = await db.school.findUnique({ where: { id: ids.schoolA }, select: { logoUrl: true, weatherCity: true } })
  t('cleanup: school A restored, no QA-SET screens or users left', after.weatherCity === original.weatherCity && after.logoUrl === original.logoUrl &&
    (await db.screen.count({ where: { name: { startsWith: TAG } } })) + (await db.user.count({ where: { name: { startsWith: TAG } } })) === 0)
  await db.$disconnect()
  finish()
}
