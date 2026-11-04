// Integration tests: dashboard announcement statistics ("מוצגות עכשיו", "טיוטות") and the
// "הודעות על המסכים" list, against real scheduling and assignment data.
//
// LOCAL TEST ENVIRONMENT ONLY (see ./_local.mjs). Creates its own screens and announcements
// (tagged "QA-DASH") in school A and removes them at the end. Counts are compared as deltas
// against the dashboard before the fixtures were created.
//
//   QA_CREDS_FILE=/path/outside/repo/qa-users.json npm run test:qa:dashboard
import { creds, db, ids, login, call, reporter } from './_local.mjs'

const { t, finish } = reporter()
const TAG = 'QA-DASH'
const created = { screens: [], anns: [] }
const day = 864e5, now = Date.now()
const iso = ms => new Date(ms).toISOString()
const OPEN = new Date('2099-12-31T23:59').toISOString()
const stat = (html, label) => Number(new RegExp(`>(\\d+)</div><div class="[^"]*">${label}<`).exec(html)?.[1] ?? NaN)

async function screenWithRegion(name, active) {
  const s = await db.screen.create({ data: { schoolId: ids.schoolA, name: `${TAG} ${name}`, slug: `qa-dash-${name.toLowerCase()}-${now}`, active, layout: { create: { headerEnabled: true, footerEnabled: true, mainSections: 1 } }, sections: { create: [{ position: 0, widthPct: 100 }] } }, include: { sections: true } })
  created.screens.push(s.id)
  const item = await db.contentItem.create({ data: { sectionId: s.sections[0].id, contentType: 'ANNOUNCEMENT', active: true, settings: { selectedAnnouncementIds: [], rotationSecs: 10 } } })
  return item.id
}

try {
  const A = await login(creds.A)
  const before = (await call(A, '/admin/dashboard')).text
  const live0 = stat(before, 'מוצגות עכשיו'), draft0 = stat(before, 'טיוטות')
  t('dashboard renders the new stat cards', Number.isFinite(live0) && Number.isFinite(draft0), `live=${live0} draft=${draft0}`)

  const onRegion = await screenWithRegion('On', true)
  const offRegion = await screenWithRegion('Off', false)
  const make = async (title, extra) => {
    const r = await call(A, '/api/announcements', 'POST', { title: `${TAG} ${title}`, body: '<p>x</p>', priority: 'LOW', active: true, startAt: iso(now - day), endAt: iso(now + 7 * day), ...extra })
    if (r.s !== 201) throw new Error(`create ${title}: ${r.s} ${r.text}`)
    created.anns.push(r.j.data.id); return r.j.data.id
  }
  // The list shows the first 5 (on the screens now, earliest start first): start these long ago
  // so they are among them even when the school already has many live announcements.
  await make('Live dated', { regionIds: [onRegion], startAt: iso(now - 4001 * day) })
  await make('Live open-ended', { regionIds: [onRegion], startAt: iso(now - 4000 * day), endAt: OPEN })
  await make('Inactive', { regionIds: [onRegion], active: false })
  await make('Draft', {})
  await make('Expired', { regionIds: [onRegion], startAt: iso(now - 10 * day), endAt: iso(now - day) })
  await make('Future', { regionIds: [onRegion], startAt: iso(now + 2 * day) })
  const outside = await make('Outside hours', { regionIds: [onRegion] })
  // Daily window that is certainly not now (the API does not set times; set them directly).
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Jerusalem' }).format(new Date()))
  const startH = String((h + 3) % 24).padStart(2, '0'), endH = String((h + 4) % 24).padStart(2, '0')
  await db.announcement.update({ where: { id: outside }, data: { startTime: `${startH}:00`, endTime: `${endH}:00` } })
  await make('Screen off', { regionIds: [offRegion] })

  const after = (await call(A, '/admin/dashboard')).text
  t('"מוצגות עכשיו" +2 (only assigned, active, in dates, in hours, on a screen that is on)', stat(after, 'מוצגות עכשיו') - live0 === 2, `${live0} → ${stat(after, 'מוצגות עכשיו')}`)
  t('"טיוטות" +1 (unassigned, active, not expired)', stat(after, 'טיוטות') - draft0 === 1, `${draft0} → ${stat(after, 'טיוטות')}`)
  const list = after.slice(after.indexOf('>הודעות על המסכים</h2>'))
  t('list: the open-ended one shows "ללא תאריך סיום", never 2099', list.includes(`${TAG} Live open-ended`) && list.includes('ללא תאריך סיום') && !after.includes('2099'))
  t('list: live ones marked "מוצגת עכשיו"', list.includes('מוצגת עכשיו'))
  t('list: no draft, inactive or expired announcement', !list.includes(`${TAG} Draft`) && !list.includes(`${TAG} Inactive`) && !list.includes(`${TAG} Expired`))
  t('dashboard: no enable/disable buttons', !after.includes('השבתת מסך') && !after.includes('הפעלת מסך'))
  t('dashboard: screens show a status badge', /פעיל|מושבת/.test(after.slice(after.indexOf('מסכים אחרונים'))))
} catch (e) {
  t('no unexpected error', false, e?.stack || String(e))
} finally {
  await db.announcement.deleteMany({ where: { id: { in: created.anns } } })
  await db.screen.deleteMany({ where: { id: { in: created.screens } } })
  t('cleanup: no QA-DASH data left', (await db.screen.count({ where: { name: { startsWith: TAG } } })) + (await db.announcement.count({ where: { title: { startsWith: TAG } } })) === 0)
  await db.$disconnect()
  finish()
}
