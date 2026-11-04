// Integration tests: announcement assignments (Announcements page API + screen editor).
//
// LOCAL TEST ENVIRONMENT ONLY. Runs against a locally running app and its local database,
// creates its own fixtures (tagged "QA-UI2") and removes them at the end.
//
// Usage:
//   QA_CREDS_FILE=/path/outside/repo/qa-users.json npm run test:qa:announcements
//
// QA_CREDS_FILE (required, must be outside the repository) contains two local test users of two
// different schools, each with role EDITOR or higher:
//   { "A": { "email": "...", "password": "..." }, "B": { "email": "...", "password": "..." } }
// QA_BASE_URL defaults to http://localhost:3000. The script refuses to run unless both the app
// URL and DATABASE_URL (environment, or .env in the repository) point to localhost.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const require = createRequire(path.join(ROOT, 'package.json'))
const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])
const abort = msg => { console.error('ABORT: ' + msg); process.exit(2) }
if (process.env.NODE_ENV === 'production') abort('NODE_ENV is production')
const envFile = path.join(ROOT, '.env')
const dbUrl = process.env.DATABASE_URL || (fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8').match(/^DATABASE_URL="?([^"\r\n]*)/m)?.[1] : undefined)
if (!dbUrl) abort('DATABASE_URL is not set')
let dbHost; try { dbHost = new URL(dbUrl).hostname } catch { abort('DATABASE_URL is not a valid URL') }
if (!LOCAL.has(dbHost)) abort('DATABASE_URL does not point to a local database')
const BASE = (process.env.QA_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
if (!LOCAL.has(new URL(BASE).hostname)) abort('QA_BASE_URL is not a local address')
const credsFile = process.env.QA_CREDS_FILE
if (!credsFile || !fs.existsSync(credsFile)) abort('QA_CREDS_FILE is not set or does not exist')
if (!path.relative(ROOT, path.resolve(credsFile)).startsWith('..')) abort('QA_CREDS_FILE must be outside the repository')
const creds = JSON.parse(fs.readFileSync(credsFile, 'utf8'))
if (!creds.A?.email || !creds.B?.email) abort('QA_CREDS_FILE needs users A and B')

const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient({ datasources: { db: { url: dbUrl } } })
const schoolOf = async email => (await db.user.findUnique({ where: { email }, select: { schoolId: true } }))?.schoolId
const ids = { schoolA: await schoolOf(creds.A.email), schoolB: await schoolOf(creds.B.email) }
if (!ids.schoolA || !ids.schoolB || ids.schoolA === ids.schoolB) abort('users A and B must belong to two different schools')

async function login(c) {
  const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: JSON.stringify({ email: c.email, password: c.password }) })
  const cookie = (r.headers.get('set-cookie') || '').split(';')[0]
  if (!r.ok || !cookie) throw new Error('login failed ' + r.status)
  return cookie
}
const call = async (cookie, p, method = 'GET', body) => {
  const h = { Origin: BASE }; if (cookie) h.Cookie = cookie
  if (body !== undefined) h['Content-Type'] = 'application/json'
  const r = await fetch(BASE + p, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' })
  const text = await r.text(); let j = null; try { j = JSON.parse(text) } catch {}
  return { s: r.status, j, text }
}
const out = []
const t = (name, ok, detail = '') => out.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + detail}`)
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const settingsOf = async id => (await db.contentItem.findUnique({ where: { id }, select: { settings: true } })).settings
const listOf = async id => (await settingsOf(id)).selectedAnnouncementIds ?? []

const TAG = 'QA-UI2'
const created = { screens: [], items: [], anns: [] }
const start = new Date().toISOString(), openEnd = new Date('2099-12-31T23:59').toISOString()
const ann = (title, extra = {}) => ({ title: `${TAG} ${title}`, body: `<p>${title}</p>`, showTitle: true, priority: 'LOW', active: true, attachmentDisplayMode: 'together', attachmentSlideSeconds: 8, startAt: start, endAt: openEnd, ...extra })

try {
  // ---- fixtures (school A: single-region screen, two-region screen, no-region screen; school B: one region)
  const mk = async (schoolId, name, regions, sections = regions.length || 1) => {
    const s = await db.screen.create({ data: { schoolId, name: `${TAG} ${name}`, slug: `qa-ui2-${name.toLowerCase().replace(/\W+/g, '-')}-${Date.now()}`, layout: { create: { headerEnabled: true, footerEnabled: true, mainSections: sections } }, sections: { create: Array.from({ length: sections }, (_, i) => ({ position: i, widthPct: Math.round(100 / sections) })) } }, include: { sections: { orderBy: { position: 'asc' } } } })
    created.screens.push(s.id)
    const items = []
    for (const [i, settings] of regions.entries()) {
      const it = await db.contentItem.create({ data: { sectionId: s.sections[i].id, contentType: 'ANNOUNCEMENT', active: true, settings } })
      created.items.push(it.id); items.push(it.id)
    }
    return { screen: s, items }
  }
  const existing = (await db.announcement.findMany({ where: { schoolId: ids.schoolA }, select: { id: true }, take: 2 })).map(a => a.id)
  const single = await mk(ids.schoolA, 'Single', [{ selectedAnnouncementIds: existing, rotationSecs: 7, sectionTitle: 'לוח', showSectionTitle: true }])
  const multi = await mk(ids.schoolA, 'Multi', [{ selectedAnnouncementIds: [existing[0]], rotationSecs: 9, sectionTitle: 'ימין' }, { selectedAnnouncementIds: [], rotationSecs: 11, sectionTitle: 'שמאל' }])
  const empty = await mk(ids.schoolA, 'NoRegion', [], 1)
  const other = await mk(ids.schoolB, 'OtherSchool', [{ selectedAnnouncementIds: [], rotationSecs: 5 }])
  // A hidden section (beyond mainSections) is never offered.
  const hiddenScreen = await mk(ids.schoolA, 'Hidden', [{ selectedAnnouncementIds: [], rotationSecs: 5 }, { selectedAnnouncementIds: [], rotationSecs: 5 }], 2)
  await db.screenLayout.update({ where: { screenId: hiddenScreen.screen.id }, data: { mainSections: 1 } })
  const [S1] = single.items, [M1, M2] = multi.items, [B1] = other.items, [, H2] = hiddenScreen.items

  const annBFixture = await db.announcement.create({ data: { schoolId: ids.schoolB, title: `${TAG} B fixture`, body: 'b', startAt: new Date(start), endAt: new Date(openEnd), daysOfWeek: [] } })
  ids.annB = annBFixture.id
  const A = await login(creds.A), B = await login(creds.B)

  // ---- regions endpoint
  const reg = await call(A, '/api/announcement-regions')
  const scr = id => reg.j?.data?.find(s => s.id === id)
  t('regions: own screens listed, B screen absent', reg.s === 200 && !!scr(single.screen.id) && !scr(other.screen.id))
  t('regions: multi-region screen has 2 regions in order', eq(scr(multi.screen.id)?.regions.map(r => r.id), [M1, M2]))
  t('regions: screen without region listed with none', scr(empty.screen.id)?.regions.length === 0)
  t('regions: hidden section not offered', eq(scr(hiddenScreen.screen.id)?.regions.map(r => r.id), [hiddenScreen.items[0]]))
  t('regions: anonymous rejected', (await call(null, '/api/announcement-regions')).s === 401)

  // ---- draft (no regions)
  const d = await call(A, '/api/announcements', 'POST', ann('Draft'))
  created.anns.push(d.j?.data?.id)
  t('draft: created 201', d.s === 201)
  const listed = (await call(A, '/api/announcements')).j.data.find(a => a.id === d.j.data.id)
  t('draft: status draft, displayedIn empty', listed?.status === 'draft' && listed.displayedIn.length === 0, JSON.stringify(listed?.status))
  t('draft: no end date stored as 2099', new Date(listed.endAt).getUTCFullYear() === 2099)

  // ---- assign at create: single + one region of multi
  const beforeS1 = await settingsOf(S1)
  const c = await call(A, '/api/announcements', 'POST', ann('Multi', { regionIds: [S1, M2, S1] }))
  const X = c.j?.data?.id; created.anns.push(X)
  t('assign: created with regions 201', c.s === 201, c.text)
  t('assign: appended to end, existing order kept', eq(await listOf(S1), [...existing, X]))
  t('assign: other settings unchanged', eq({ ...(await settingsOf(S1)), selectedAnnouncementIds: undefined }, { ...beforeS1, selectedAnnouncementIds: undefined }))
  t('assign: only explicitly chosen region of multi screen', eq(await listOf(M1), [existing[0]]) && eq(await listOf(M2), [X]))
  t('assign: no duplicate from repeated id', (await listOf(S1)).filter(i => i === X).length === 1)
  const lx = (await call(A, '/api/announcements')).j.data.find(a => a.id === X)
  t('assign: status live, shown on 2 screens', lx.status === 'live' && new Set(lx.displayedIn.map(p => p.screenId)).size === 2)

  // ---- update: add a region, keep others; PUT without regionIds leaves assignments
  const put = (id, body) => call(A, '/api/announcements/' + id, 'PUT', body)
  t('update: add M1', (await put(X, ann('Multi', { regionIds: [S1, M1, M2] }))).s === 200)
  t('update: M1 appended after existing', eq(await listOf(M1), [existing[0], X]))
  t('update: re-save same set keeps order (no re-append)', (await put(X, ann('Multi', { regionIds: [M2, M1, S1] }))).s === 200 && eq(await listOf(S1), [...existing, X]))
  t('update: PUT without regionIds keeps assignments', (await put(X, ann('Multi renamed'))).s === 200 && (await listOf(M1)).includes(X) && (await listOf(S1)).includes(X))
  t('update: content edit is one shared record', (await db.announcement.findUnique({ where: { id: X } })).title === `${TAG} Multi renamed`)

  // ---- remove one assignment (not delete)
  t('remove one: drop M1 only', (await put(X, ann('Multi renamed', { regionIds: [S1, M2] }))).s === 200)
  t('remove one: M1 back to original, others kept', eq(await listOf(M1), [existing[0]]) && (await listOf(S1)).includes(X) && (await listOf(M2)).includes(X))
  t('remove one: announcement still exists', !!(await db.announcement.findUnique({ where: { id: X } })))
  t('unassign all: becomes draft', (await put(X, ann('Multi renamed', { regionIds: [] }))).s === 200 && (await call(A, '/api/announcements')).j.data.find(a => a.id === X).status === 'draft')
  await put(X, ann('Multi renamed', { regionIds: [S1, M1, M2] }))

  // ---- validation, cross-school, hidden, unknown
  t('cross-school: B region rejected (400)', (await put(X, ann('Multi renamed', { regionIds: [S1, B1] }))).s === 400)
  t('cross-school: nothing changed after rejection', (await listOf(S1)).includes(X) && eq(await listOf(B1), []))
  t('hidden region rejected', (await put(X, ann('x', { regionIds: [H2] }))).s === 400)
  t('unknown region rejected', (await put(X, ann('x', { regionIds: ['cnotarealregion0000000'] }))).s === 400)
  t('malformed regionIds rejected', (await put(X, ann('x', { regionIds: 'abc' }))).s === 400)
  t('create with B region rejected, nothing created', (await call(A, '/api/announcements', 'POST', ann('Cross', { regionIds: [B1] }))).s === 400 && !(await db.announcement.findFirst({ where: { title: `${TAG} Cross` } })))
  t('B cannot edit A announcement', (await call(B, '/api/announcements/' + X, 'PUT', ann('hack', { regionIds: [B1] }))).s === 404)
  t('B cannot delete A announcement', (await call(B, '/api/announcements/' + X, 'DELETE')).s === 404)
  t('B regions endpoint does not show A screens', !(await call(B, '/api/announcement-regions')).j.data.some(s => s.id === single.screen.id))

  // ---- concurrency: many announcements assigned to the same region at once
  const many = await Promise.all(Array.from({ length: 8 }, (_, i) => call(A, '/api/announcements', 'POST', ann('Burst ' + i, { regionIds: [M2] }))))
  for (const r of many) if (r.j?.data?.id) created.anns.push(r.j.data.id)
  const burstIds = many.map(r => r.j?.data?.id).filter(Boolean)
  const m2 = await listOf(M2)
  t('concurrency: all 8 created', burstIds.length === 8 && many.every(r => r.s === 201), many.map(r => r.s).join(','))
  t('concurrency: none lost from region', burstIds.every(id => m2.includes(id)), JSON.stringify(m2))
  t('concurrency: X kept first, no duplicates', m2[0] === X && new Set(m2).size === m2.length)
  // concurrent add + remove on different announcements of the same region
  const [rmRes, addRes] = await Promise.all([put(burstIds[0], ann('Burst 0', { regionIds: [] })), put(burstIds[1], ann('Burst 1', { regionIds: [M2, M1] }))])
  t('concurrency: parallel remove/add both applied', rmRes.s === 200 && addRes.s === 200 && !(await listOf(M2)).includes(burstIds[0]) && (await listOf(M1)).includes(burstIds[1]))

  // ---- screen editor vs Announcements API (stale editor saves must not overwrite assignments)
  const secM2 = multi.screen.sections[1].id, secS1 = single.screen.sections[0].id
  const contentUrl = (screen, sec) => `/api/screens/${screen.id}/sections/${sec}/content`
  const editorLoad = async (screen, sec) => (await call(A, contentUrl(screen, sec))).j.data
  const editorSave = (screen, sec, loaded, ids, extra = {}) => call(A, contentUrl(screen, sec), 'POST', {
    contentType: 'ANNOUNCEMENT', active: loaded.active, settings: { ...loaded.settings, ...extra, selectedAnnouncementIds: ids },
    baseAnnouncementIds: loaded.settings.selectedAnnouncementIds,
  })
  // E1: editor loads, Announcements page assigns Y meanwhile, editor adds Z (stale) → both kept.
  const Y = (await call(A, '/api/announcements', 'POST', ann('Y'))).j.data.id; created.anns.push(Y)
  const Z = (await call(A, '/api/announcements', 'POST', ann('Z'))).j.data.id; created.anns.push(Z)
  const l1 = await editorLoad(multi.screen, secM2)
  t('editor: loaded region id equals the region', l1.id === M2)
  await put(Y, ann('Y', { regionIds: [M2] }))
  const e1 = await editorSave(multi.screen, secM2, l1, [...l1.settings.selectedAnnouncementIds, Z])
  const afterE1 = await listOf(M2)
  t('editor stale save: 201', e1.s === 201, e1.text)
  t('editor stale save: concurrent assignment Y kept', afterE1.includes(Y), JSON.stringify(afterE1))
  t('editor stale save: editor addition Z appended last', afterE1[afterE1.length - 1] === Z)
  t('editor save: region id unchanged (updated in place)', e1.j?.data?.id === M2 && !!(await db.contentItem.findUnique({ where: { id: M2 } })))
  t('editor save: response shows merged list', eq(e1.j?.data?.settings?.selectedAnnouncementIds, afterE1))
  // E2: editor loaded with Y, Y removed via Announcements page, editor saves unchanged list → no resurrection.
  const l2 = await editorLoad(multi.screen, secM2)
  await put(Y, ann('Y', { regionIds: [] }))
  const e2 = await editorSave(multi.screen, secM2, l2, l2.settings.selectedAnnouncementIds, { rotationSecs: 15 })
  t('editor stale save: removed announcement not resurrected', e2.s === 201 && !(await listOf(M2)).includes(Y))
  t('editor stale save: its own setting change applied', (await settingsOf(M2)).rotationSecs === 15)
  // E3: editor removes Z while Y is added concurrently → Z gone, Y present.
  const l3 = await editorLoad(multi.screen, secM2)
  await put(Y, ann('Y', { regionIds: [M2] }))
  await editorSave(multi.screen, secM2, l3, l3.settings.selectedAnnouncementIds.filter(id => id !== Z))
  t('editor intentional removal applied, concurrent addition kept', !(await listOf(M2)).includes(Z) && (await listOf(M2)).includes(Y))
  // E4: an editor/client save without base that changes the list is refused, list untouched.
  const beforeE4 = await listOf(M2)
  const e4 = await call(A, contentUrl(multi.screen, secM2), 'POST', { contentType: 'ANNOUNCEMENT', settings: { selectedAnnouncementIds: [Z], rotationSecs: 15 } })
  t('save without base that changes the list: 409', e4.s === 409, String(e4.s))
  t('save without base: list unchanged', eq(await listOf(M2), beforeE4))
  // E5: unchanged editor save (no concurrent change) keeps the order exactly.
  const l5 = await editorLoad(single.screen, secS1)
  await editorSave(single.screen, secS1, l5, l5.settings.selectedAnnouncementIds, { rotationSecs: 7 })
  t('editor no-op save keeps list and order', eq(await listOf(S1), l5.settings.selectedAnnouncementIds))
  // E6: an editor reorder with no concurrent change is applied.
  if (l5.settings.selectedAnnouncementIds.length > 1) {
    const rev = [...l5.settings.selectedAnnouncementIds].reverse()
    await editorSave(single.screen, secS1, l5, rev)
    t('editor reorder applied when nothing changed meanwhile', eq(await listOf(S1), rev))
    await editorSave(single.screen, secS1, { ...l5, settings: { ...l5.settings, selectedAnnouncementIds: rev } }, l5.settings.selectedAnnouncementIds)
  }
  // E7: truly parallel: 4 Announcements-page assignments + 3 stale editor saves each adding an id.
  const extra = []
  for (let i = 0; i < 3; i++) { const id = (await call(A, '/api/announcements', 'POST', ann('Ed' + i))).j.data.id; created.anns.push(id); extra.push(id) }
  const l7 = await editorLoad(multi.screen, secM2)
  const par = await Promise.all([
    ...Array.from({ length: 4 }, (_, i) => call(A, '/api/announcements', 'POST', ann('Par' + i, { regionIds: [M2] }))),
    ...extra.map(id => editorSave(multi.screen, secM2, l7, [...l7.settings.selectedAnnouncementIds, id])),
  ])
  for (const r of par.slice(0, 4)) if (r.j?.data?.id) created.anns.push(r.j.data.id)
  const m2p = await listOf(M2)
  t('parallel editor + API: all requests succeeded', par.every(r => r.s === 201), par.map(r => r.s).join(','))
  t('parallel editor + API: every API assignment kept', par.slice(0, 4).every(r => m2p.includes(r.j.data.id)), JSON.stringify(m2p))
  t('parallel editor + API: every editor addition kept', extra.every(id => m2p.includes(id)))
  t('parallel editor + API: no duplicates, earlier entries first', new Set(m2p).size === m2p.length && eq(m2p.slice(0, l7.settings.selectedAnnouncementIds.length), l7.settings.selectedAnnouncementIds))
  // E8: ordinary layout edit keeps assignments and order.
  const before8 = { M1: await listOf(M1), M2: await listOf(M2), S1: await listOf(S1) }
  const lay = await db.screenLayout.findUnique({ where: { screenId: multi.screen.id } })
  const { id: _lid, screenId: _sid, ...layout } = lay
  const secs = (await db.screenSection.findMany({ where: { screenId: multi.screen.id }, orderBy: { position: 'asc' } })).map(s => ({ position: s.position, widthPct: s.widthPct }))
  const lr = await call(A, `/api/screens/${multi.screen.id}/layout`, 'PUT', { layout: { ...layout, headerHeight: 100 }, sections: secs })
  t('layout edit: 200', lr.s === 200, lr.text.slice(0, 200))
  t('layout edit: assignments and order unchanged', eq(before8, { M1: await listOf(M1), M2: await listOf(M2), S1: await listOf(S1) }))
  t('layout edit: region ids unchanged', !!(await db.contentItem.findUnique({ where: { id: M1 } })) && !!(await db.contentItem.findUnique({ where: { id: M2 } })))
  // E9: isolation of the editor path.
  t('B cannot save into A region via editor path', (await call(B, contentUrl(multi.screen, secM2), 'POST', { contentType: 'ANNOUNCEMENT', settings: { selectedAnnouncementIds: [] }, baseAnnouncementIds: [] })).s === 404)
  t('A cannot add B announcement via editor (with base)', (await editorSave(multi.screen, secM2, await editorLoad(multi.screen, secM2), [ids.annB])).s === 400)
  t('VIEWER-level path: anonymous editor save rejected', (await call(null, contentUrl(multi.screen, secM2), 'POST', { contentType: 'ANNOUNCEMENT', settings: {} })).s === 401)

  // ---- delete shared: removed from all regions (including hidden sections), then deleted
  await db.contentItem.update({ where: { id: H2 }, data: { settings: { selectedAnnouncementIds: [X], rotationSecs: 5 } } })
  t('delete shared: 200', (await call(A, '/api/announcements/' + X, 'DELETE')).s === 200)
  t('delete shared: record gone', !(await db.announcement.findUnique({ where: { id: X } })))
  t('delete shared: id cleaned from every region', !(await listOf(S1)).includes(X) && !(await listOf(M1)).includes(X) && !(await listOf(M2)).includes(X) && !(await listOf(H2)).includes(X))
  t('delete shared: unrelated ids and settings kept', eq(await listOf(S1), existing) && (await settingsOf(S1)).rotationSecs === 7)

  // ---- compatibility: existing schedule preserved exactly; EMERGENCY editable
  const custom = await call(A, '/api/announcements', 'POST', ann('Custom', { startAt: '2026-11-05T06:30:00.000Z', endAt: '2026-11-20T15:45:00.000Z', priority: 'EMERGENCY' }))
  created.anns.push(custom.j?.data?.id)
  await db.announcement.update({ where: { id: custom.j.data.id }, data: { daysOfWeek: [0, 1], startTime: '08:00', endTime: '12:00' } })
  const cu = await put(custom.j.data.id, ann('Custom edited', { startAt: '2026-11-05T06:30:00.000Z', endAt: '2026-11-20T15:45:00.000Z', priority: 'EMERGENCY' }))
  const cr = await db.announcement.findUnique({ where: { id: custom.j.data.id } })
  t('compat: EMERGENCY record saves', cu.s === 200 && cr.priority === 'EMERGENCY')
  t('compat: dates kept exactly', cr.startAt.toISOString() === '2026-11-05T06:30:00.000Z' && cr.endAt.toISOString() === '2026-11-20T15:45:00.000Z')
  t('compat: day/time limits untouched by edit', eq(cr.daysOfWeek, [0, 1]) && cr.startTime === '08:00' && cr.endTime === '12:00')

  // ---- TV endpoint: the new announcement plays last in the rotation of the region
  const tv = await call(null, '/api/public/announcements/' + M2)
  const tvIds = tv.j?.data?.map(a => a.id) ?? []
  t('TV endpoint: order follows the region list', tv.s === 200 && tvIds.length >= 7 && eq(tvIds, (await listOf(M2)).filter(id => tvIds.includes(id))), JSON.stringify(tvIds))
} catch (e) {
  out.push('ERROR  ' + (e?.stack || e))
} finally {
  // cleanup: announcements first (removes ids), then screens (cascade sections/items)
  for (const id of created.anns.filter(Boolean)) {
    await db.contentItem.findMany({ where: { contentType: 'ANNOUNCEMENT' } }).then(items => Promise.all(items.filter(i => (i.settings?.selectedAnnouncementIds ?? []).includes(id)).map(i => db.contentItem.update({ where: { id: i.id }, data: { settings: { ...i.settings, selectedAnnouncementIds: i.settings.selectedAnnouncementIds.filter(x => x !== id) } } }))))
    await db.announcement.deleteMany({ where: { id } })
  }
  await db.announcement.deleteMany({ where: { title: { startsWith: TAG } } })
  await db.screen.deleteMany({ where: { id: { in: created.screens } } })
  const left = await db.screen.count({ where: { name: { startsWith: TAG } } }) + await db.announcement.count({ where: { title: { startsWith: TAG } } })
  out.push(`${left === 0 ? 'PASS' : 'FAIL'}  cleanup: no QA-UI2 fixtures left (${left})`)
  await db.$disconnect()
  console.log(out.join('\n'))
  const failed = out.filter(l => !l.startsWith('PASS')).length
  console.log(`\n${out.length - failed} passed, ${failed} failed`)
  process.exitCode = failed ? 1 : 0
}
