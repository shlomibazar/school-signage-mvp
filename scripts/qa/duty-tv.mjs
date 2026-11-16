// TV checks of the duty roster region in a real browser (headless Chrome): region sizes of real
// screen templates (full, half, one-third; 1920×1080 and 1280×720), long Hebrew names, scrolling of
// long content, and a controlled network interruption (offline, then back online with a newer
// publication). Uses the realistic one-school data of duty-perf.mjs; everything is removed at the end.
//
// LOCAL TEST ENVIRONMENT ONLY (see ./_local.mjs).
//   QA_CREDS_FILE=/path/outside/repo/qa-users.json npm run test:qa:duty-tv [-- --shots=DIR]
import { spawn } from 'node:child_process'
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'
import { BASE, creds, db, ids, login, call, reporter } from './_local.mjs'
import { seed, cleanup } from './duty-perf.mjs'

const { t, finish } = reporter()
const shotsDir = process.argv.find(a => a.startsWith('--shots='))?.slice(8)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(p => [p.type, p.value]))
const today = `${parts.year}-${parts.month}-${parts.day}`
const W0 = new Date(Date.parse(today + 'T00:00:00Z') - new Date(today + 'T00:00:00Z').getUTCDay() * 864e5).toISOString().slice(0, 10)
const LONG = ['אלכסנדרה-מרגריטה בן שושן-אברמוביץ', 'עמנואל יהושע קרמרמן-רוזנבלום', 'Christopher Montgomery-Abernathy']
let seeded, chrome, ws

try {
  seeded = await seed()
  const A = await login(creds.A)
  // Long names on people on duty today.
  const todays = await db.dutyAssignment.findMany({ where: { schoolId: ids.schoolA, date: new Date(today + 'T00:00:00Z') }, select: { staffId: true }, distinct: ['staffId'], skip: 8, take: 3 }) // not the absent ones (the seed marks the first 5 absent)
  for (const [i, a] of todays.entries()) await db.dutyStaff.update({ where: { id: a.staffId }, data: { firstName: LONG[i] + ' QA-PERF', lastName: '' } })
  await call(A, '/api/duty/publish', 'POST', { weekStart: W0 })
  const screen = async (name, template, sections) => (await db.screen.create({ data: { schoolId: ids.schoolA, name: `QA-PERF ${name}`, slug: `qa-perf-${name}-${Date.now()}`,
    layout: { create: { mainSections: sections.length, headerEnabled: true, headerHeight: 100, footerEnabled: true, footerHeight: 60, bgColor: `${template ? `layout:${template}|` : ''}surface:unified|theme:midnight-gold` } },
    sections: { create: sections.map((s, i) => ({ position: i, widthPct: Math.round(100 / sections.length), contentItems: { create: [{ contentType: s.t, active: true, settings: s.s, textContent: s.text ?? null }] } })) } } })).slug
  const roster = { t: 'DUTY_ROSTER', s: { title: 'תורנויות היום', mode: 'day' } }
  const text = { t: 'TEXT', s: null, text: '<p>אזור טקסט לבדיקה</p>' }
  const full = await screen('full', null, [roster])
  const half = await screen('half', null, [roster, text])
  const third = await screen('third', null, [roster, text, text])

  chrome = spawn(process.env.QA_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=9353', `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'qa-tv-'))}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' })
  for (let i = 0; i < 50 && !ws; i++) { await sleep(200); try { const p = (await (await fetch('http://127.0.0.1:9353/json/list')).json()).find(x => x.type === 'page'); if (p) ws = new WebSocket(p.webSocketDebuggerUrl) } catch {} }
  await new Promise(r => { ws.onopen = r })
  let n = 0; const pend = new Map(); const exceptions = []; const dutyRequests = []
  ws.onmessage = e => {
    const m = JSON.parse(e.data)
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) }
    if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails?.exception?.description?.slice(0, 160))
    if (m.method === 'Network.requestWillBeSent' && m.params.request.url.includes('/api/public/duty/')) dutyRequests.push(Date.now())
  }
  const send = (m, p = {}) => new Promise(r => { const i = ++n; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
  const ev = async x => (await send('Runtime.evaluate', { expression: `(async () => { const v = await (0, eval)(${JSON.stringify(x)}); return v instanceof Node ? true : v })()`, awaitPromise: true, returnByValue: true })).result?.result?.value
  await send('Network.enable'); await send('Page.enable'); await send('Runtime.enable')
  const shot = async f => { if (!shotsDir) return; const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(shotsDir, f), Buffer.from(r.result.data, 'base64')) }
  const measure = `(() => { const d = document.querySelector('.tv-duty'); if (!d) return null; const r = d.getBoundingClientRect(); const names = [...d.querySelectorAll('li > span:first-child')];
    return { w: Math.round(r.width), h: Math.round(r.height), screenW: innerWidth, overflowX: d.scrollWidth > d.clientWidth + 1, pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      clippedNames: names.filter(s => { const r = document.createRange(); r.selectNodeContents(s); return r.getBoundingClientRect().bottom - s.getBoundingClientRect().bottom > parseFloat(getComputedStyle(s).lineHeight) * 0.5 }).length /* a hidden line, not glyph overhang */, longShown: names.filter(s => /אלכסנדרה|עמנואל|Christopher/.test(s.textContent)).length,
      nameFont: names[0] ? parseFloat(getComputedStyle(names[0]).fontSize) : null, sections: d.querySelectorAll('section').length,
      scrolls: !!d.querySelector('[style*="translateY"]') && (d.querySelector('[style*="translateY"]').scrollHeight > d.querySelector('[style*="translateY"]').parentElement.clientHeight + 4) } })()`
  const cases = [['full', full, 1920, 1080, 1], ['half', half, 1920, 1080, 2], ['third', third, 1920, 1080, 3], ['full', full, 1280, 720, 1], ['third', third, 1280, 720, 3]]
  for (const [label, slug, w, h, parts] of cases) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })
    await send('Page.navigate', { url: `${BASE}/screen/${slug}` })
    let m = null
    for (let i = 0; i < 100 && !(m?.sections); i++) { await sleep(300); m = await ev(measure).catch(() => null) }
    await sleep(800); m = await ev(measure)
    const expected = w / parts
    t(`TV ${w}×${h} ${label}: region ${m?.w}px (≈${Math.round(expected)}px expected)`, !!m && Math.abs(m.w - expected) < expected * 0.12, JSON.stringify(m))
    t(`TV ${w}×${h} ${label}: no horizontal overflow, long names wrapped not cut`, !!m && !m.overflowX && !m.pageOverflow && m.clippedNames === 0 && m.longShown > 0, JSON.stringify(m))
    t(`TV ${w}×${h} ${label}: readable text (names ≥ 18px), long day scrolls`, !!m && m.nameFont >= 18 && m.scrolls, JSON.stringify(m))
    await shot(`tv-${label}-${w}x${h}.png`)
  }

  // ── Network interruption ──
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: `${BASE}/screen/${half}` })
  for (let i = 0; i < 60 && !(await ev(`document.querySelectorAll('.tv-duty li').length`)); i++) await sleep(300)
  await sleep(1500)
  const before = await ev(`document.querySelector('.tv-duty').innerText`)
  const textRegion = `[...document.querySelectorAll('.tv-content-panel')].some(p => p.innerText.includes('אזור טקסט לבדיקה'))`
  dutyRequests.length = 0; exceptions.length = 0
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
  await sleep(70000) // longer than one roster refresh (60 s)
  const offline = await ev(`document.querySelector('.tv-duty')?.innerText`)
  t('offline: the last published roster stays on screen (not blank)', !!offline && offline === before && offline.length > 100)
  t('offline: the other region still works', await ev(textRegion))
  t('offline: no JavaScript exceptions', exceptions.length === 0, exceptions.join(' | '))
  // A newer publication while the screen is offline, then the network returns.
  const changed = await db.dutyAssignment.findFirst({ where: { schoolId: ids.schoolA, date: new Date(today + 'T00:00:00Z') }, orderBy: { id: 'asc' } })
  await call(A, `/api/duty/assign?id=${changed.id}`, 'DELETE')
  await call(A, '/api/duty/publish', 'POST', { weekStart: W0 })
  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
  const t0 = Date.now(); let after = offline
  while (Date.now() - t0 < 75000 && after === offline) { await sleep(2000); after = await ev(`document.querySelector('.tv-duty')?.innerText`) }
  t(`back online: the newer publication appears (${Math.round((Date.now() - t0) / 1000)}s)`, after !== offline && after.length > 100)
  const span = (Date.now() - (dutyRequests[0] ?? Date.now())) / 60000
  t(`no duplicate polling: ${dutyRequests.length} roster requests in ${(span).toFixed(1)} min (one per minute)`, dutyRequests.length <= Math.ceil(span) + 2, dutyRequests.map(x => x - dutyRequests[0]).join(','))
  // Steady state after reconnecting: one request per minute, no duplicate loops.
  dutyRequests.length = 0
  await sleep(125000)
  t(`steady polling after reconnect: ${dutyRequests.length} roster requests in 125 s (expected 2)`, dutyRequests.length >= 1 && dutyRequests.length <= 3, dutyRequests.join(','))
  t('no JavaScript exceptions during the test', exceptions.length === 0, exceptions.join(' | '))
  await shot('tv-after-reconnect.png')
} catch (e) {
  t('run', false, e.stack?.split('\n').slice(0, 2).join(' '))
} finally {
  try { ws?.close() } catch {}
  chrome?.kill()
  await db.screen.deleteMany({ where: { schoolId: ids.schoolA, name: { startsWith: 'QA-PERF' } } }).catch(() => {})
  await cleanup()
  await db.dutyAuditEvent.deleteMany({ where: { schoolId: ids.schoolA } }).catch(() => {})
  if (seeded?.settingsBefore) { const { id: _i, updatedAt: _u, ...rest } = seeded.settingsBefore; await db.dutySettings.update({ where: { schoolId: ids.schoolA }, data: rest }).catch(() => {}) }
  else await db.dutySettings.deleteMany({ where: { schoolId: ids.schoolA } }).catch(() => {})
  await db.$disconnect()
  finish()
}
