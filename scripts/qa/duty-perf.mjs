// Local UI performance check of the duty roster admin page with a realistic school: 80 teachers,
// 8 locations, 5 periods a day, three fully planned weeks with some gaps, temporary teachers,
// absences and substitutions. Measures real interactions in headless Chrome (DevTools protocol)
// and prints the timings. All seeded data is removed at the end.
//
// LOCAL TEST ENVIRONMENT ONLY (see ./_local.mjs).
//   QA_CREDS_FILE=/path/outside/repo/qa-users.json npm run test:qa:duty-perf [-- --keep] [-- --shots=DIR]
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { BASE, creds, db, ids, login, call } from './_local.mjs'

const TAG = 'QA-PERF'
const keep = process.argv.includes('--keep')
const shotsDir = process.argv.find(a => a.startsWith('--shots='))?.slice(8)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const school = ids.schoolA
const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(p => [p.type, p.value]))
const today = `${parts.year}-${parts.month}-${parts.day}`
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10)
const week0 = addDays(today, -new Date(today + 'T00:00:00Z').getUTCDay())
const D = d => new Date(d + 'T00:00:00Z')

const FIRST = ['דנה', 'יוסי', 'מיכל', 'רונית', 'אבי', 'נועה', 'עידו', 'שירה', 'אורית', 'גלעד', 'הדס', 'טל', 'ליאור', 'מאיה', 'נתן', 'ענבל', 'רועי', 'שקד', 'תמר', 'אלון']
const LAST = ['כהן', 'לוי', 'מזרחי', 'פרץ', 'ביטון', 'אברהם', 'פרידמן', 'שפירא']

export async function seed() {
  await cleanup()
  const settingsBefore = await db.dutySettings.findUnique({ where: { schoolId: school } })
  await db.dutySettings.upsert({ where: { schoolId: school }, update: { schoolDays: [0, 1, 2, 3, 4, 5] }, create: { schoolId: school, schoolDays: [0, 1, 2, 3, 4, 5] } })
  const staff = []
  for (let i = 0; i < 80; i++) {
    const temp = i >= 74
    staff.push(await db.dutyStaff.create({ data: { schoolId: school, firstName: `${FIRST[i % 20]} ${TAG}`, lastName: `${LAST[Math.floor(i / 20) % 8]}${i >= 40 ? ' ' + LAST[i % 8] : ''}`, kind: temp ? 'TEMPORARY' : i >= 70 ? 'MANUAL' : 'REGULAR', notes: temp ? 'מחליף/ה זמני/ת' : null, validUntil: temp ? D(addDays(week0, 20)) : null } }))
  }
  const locs = []
  for (const [i, n] of ['חצר מרכזית', 'מגרש ספורט', 'מסדרון קומה א׳', 'מסדרון קומה ב׳', 'כניסה ראשית', 'ספרייה', 'קפטריה', 'חצר אחורית'].entries())
    locs.push(await db.dutyLocation.create({ data: { schoolId: school, name: `${n} ${TAG}`, sortOrder: i, required: i < 7 } }))
  const periods = []
  for (const [i, [n, s, e]] of [['לפני הלימודים', '07:45', '08:00'], ['הפסקה ראשונה', '09:30', '09:45'], ['הפסקה גדולה', '10:30', '10:50'], ['הפסקת צהריים', '12:15', '12:35'], ['אחרי הלימודים', '13:50', '14:05']].entries())
    periods.push(await db.dutyPeriod.create({ data: { schoolId: school, name: `${n} ${TAG}`, startTime: s, endTime: e, weekdays: i === 4 ? [0, 1, 2, 3, 4] : [0, 1, 2, 3, 4, 5], sortOrder: i } }))
  // Three planned weeks: every slot except ~8% gaps; people rotate so nobody is double-booked.
  let n = 0
  for (const w of [0, 7, 14]) {
    const weekStart = addDays(week0, w)
    const week = await db.dutyWeek.create({ data: { schoolId: school, weekStart: D(weekStart) } })
    const rows = []
    for (let d = 0; d < 6; d++) {
      const date = addDays(weekStart, d)
      for (const p of periods) {
        if (!p.weekdays.includes(d)) continue
        locs.forEach((l, li) => { if ((n++ % 13) === 5) return; rows.push({ schoolId: school, weekId: week.id, date: D(date), periodId: p.id, locationId: l.id, staffId: staff[(d * 37 + p.sortOrder * 8 + li + w) % 80].id }) })
      }
    }
    await db.dutyAssignment.createMany({ data: rows, skipDuplicates: true })
  }
  // Absences this week and two approved substitutes.
  const thisWeek = await db.dutyWeek.findFirst({ where: { schoolId: school, weekStart: D(week0) } })
  const sample = await db.dutyAssignment.findMany({ where: { weekId: thisWeek.id, date: D(today) }, take: 5 })
  for (const a of sample) await db.dutyAbsence.create({ data: { schoolId: school, staffId: a.staffId, date: a.date, periodId: null, reason: 'מחלה' } })
  const busy = new Set((await db.dutyAssignment.findMany({ where: { weekId: thisWeek.id, date: D(today) }, select: { staffId: true } })).map(a => a.staffId))
  const free = staff.filter(s => !busy.has(s.id) && s.kind === 'REGULAR')
  for (const [i, a] of sample.slice(0, 2).entries()) await db.dutySubstitution.create({ data: { schoolId: school, assignmentId: a.id, substituteStaffId: free[i].id, occurrenceKey: a.id } }).catch(() => db.dutySubstitution.create({ data: { schoolId: school, assignmentId: a.id, substituteStaffId: free[i].id } }))
  return { staff, locs, periods, settingsBefore }
}

export async function cleanup() {
  await db.dutyStaff.deleteMany({ where: { schoolId: school, firstName: { contains: TAG } } })
  await db.dutyLocation.deleteMany({ where: { schoolId: school, name: { contains: TAG } } })
  await db.dutyPeriod.deleteMany({ where: { schoolId: school, name: { contains: TAG } } })
  await db.dutyWeek.deleteMany({ where: { schoolId: school, assignments: { none: {} } } })
  if (db.dutyTemplate) await db.dutyTemplate.deleteMany({ where: { schoolId: school, name: { contains: TAG } } })
  if (db.dutyCalendarDay) await db.dutyCalendarDay.deleteMany({ where: { schoolId: school, name: { contains: TAG } } })
}

// ── Browser ─────────────────────────────────────────────────────────────────────
let chrome, ws, send
const pageErrors = []
async function browser() {
  chrome = spawn(process.env.QA_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=9351', `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'qa-perf-'))}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' })
  for (let i = 0; i < 50 && !ws; i++) { await sleep(200); try { const p = (await (await fetch('http://127.0.0.1:9351/json/list')).json()).find(x => x.type === 'page'); if (p) ws = new WebSocket(p.webSocketDebuggerUrl) } catch {} }
  await new Promise(r => { ws.onopen = r })
  let k = 0; const pend = new Map()
  ws.onmessage = e => {
    const m = JSON.parse(e.data)
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) }
    // Real JavaScript exceptions and console errors of the page (not network failures).
    if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails?.exception?.description?.slice(0, 160) ?? 'exception')
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') pageErrors.push(String(m.params.args?.[0]?.value ?? 'console.error').slice(0, 160))
  }
  send = (m, p = {}) => new Promise(r => { const i = ++k; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
}
const ev = async x => { const r = await send('Runtime.evaluate', { expression: `(async () => { const v = await (0, eval)(${JSON.stringify(x)}); return v instanceof Node ? true : v })()`, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description?.slice(0, 300)); return r.result?.result?.value }
const HELPERS = `
window.q = s => document.querySelector(s); window.qa = s => [...document.querySelectorAll(s)];
window.byText = (sel, t) => qa(sel).find(e => e.textContent.trim().includes(t));
window.type = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) };
window.frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
window.until = async (fn, ms = 15000) => { const end = performance.now() + ms; while (performance.now() < end) { try { const v = fn(); if (v) return v } catch {} await new Promise(r => setTimeout(r, 5)) } return null };
window.timeIt = async (act, done) => { const t0 = performance.now(); await act(); const ok = await until(done); await frame(); return ok ? Math.round(performance.now() - t0) : -1 };
window.longTasks = []; try { new PerformanceObserver(l => l.getEntries().forEach(e => longTasks.push(Math.round(e.duration)))).observe({ type: 'longtask', buffered: true }) } catch {}
window.weekLabel = () => qa('span').find(s => /^\\d+\\.\\d+–\\d+\\.\\d+$/.test(s.textContent.trim()))?.textContent.trim();
window.boardReady = () => qa('[data-slot]').length > 100 && qa('[data-assignment]').length > 50;
`
const median = a => { const s = [...a].filter(x => x >= 0).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : -1 }

export async function measure(label) {
  const results = {}
  await browser()
  const A = await login(creds.A)
  const [name, value] = A.split('=')
  // Recurring data: next week follows a template made from this week, with two one-time changes.
  const W1 = addDays(week0, 7)
  await call(A, '/api/duty/settings', 'POST', { schoolDays: [0, 1, 2, 3, 4, 5], maxPerDay: null, maxPerWeek: null, allowOverride: true, scheduleMode: 'HYBRID' })
  const tplId = (await call(A, '/api/duty/template', 'POST', { name: TAG + ' קבוע', effectiveFrom: W1, effectiveUntil: null, fromWeekStart: week0 })).j?.data?.id
  await call(A, '/api/duty/week-template', 'POST', { weekStart: W1, useTemplate: true })
  const w1 = (await call(A, '/api/duty/week?start=' + W1)).j?.data
  const mon = (w1?.assignments ?? []).filter(a => a.date === addDays(W1, 1))
  const busyMon = new Set(mon.map(a => a.staffId))
  const freeIds = (await db.dutyStaff.findMany({ where: { schoolId: school, firstName: { contains: TAG } }, select: { id: true } })).map(x => x.id).filter(x => !busyMon.has(x))
  if (mon.length > 9) { await call(A, '/api/duty/move', 'POST', { id: mon[0].id, weekStart: W1, staffId: freeIds[0] }); await call(A, '/api/duty/move', 'POST', { id: mon[9].id, weekStart: W1, staffId: freeIds[1] }) }
  results.recurringWeek = { templateDuties: (w1?.assignments ?? []).filter(a => a.origin === 'template').length, template: !!tplId }
  await send('Network.enable'); await send('Runtime.enable'); await send('Network.setCookie', { name, value, url: BASE })
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false })
  await send('Page.enable')
  const shot = async file => { if (!shotsDir) return; const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(shotsDir, file), Buffer.from(r.result.data, 'base64')) }
  // Open (warm up once: the first dev compile is not a UI cost).
  await send('Page.navigate', { url: BASE + '/admin/duty' }); await sleep(8000)
  const opens = []
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now(); await send('Page.navigate', { url: BASE + '/admin/duty' })
    for (let k = 0; k < 600; k++) { await sleep(20); if (await ev(`(window.qa ? true : (${JSON.stringify(HELPERS)}, eval(${JSON.stringify(HELPERS)}), true)) && [...document.querySelectorAll('[data-slot]')].length > 100 && document.querySelectorAll('[data-assignment]').length > 50`).catch(() => false)) break }
    opens.push(Date.now() - t0)
  }
  results.openRoster = { median: median(opens), runs: opens }
  await ev(HELPERS)
  await shot(`${label}-board.png`)
  // Switch weeks (next, next, prev, prev …): until the new week's board is shown.
  const sw = []
  for (const dir of ['השבוע הבא', 'השבוע הבא', 'השבוע הקודם', 'השבוע הקודם', 'השבוע הבא', 'השבוע הקודם']) {
    sw.push(await ev(`(async () => { const before = weekLabel(); return timeIt(() => q('[aria-label="${dir}"]').click(), () => weekLabel() !== before && boardReady() && !byText('p', 'טוען')) })()`))
  }
  results.switchWeek = { median: median(sw), runs: sw }
  // Rapid switching: 6 clicks without waiting, then the board must show the last week's data.
  results.rapidSwitch = await ev(`(async () => { const start = weekLabel(); for (let i = 0; i < 6; i++) { q('[aria-label="השבוע הבא"]').click(); await new Promise(r => setTimeout(r, 30)) } for (let i = 0; i < 6; i++) { q('[aria-label="השבוע הקודם"]').click(); await new Promise(r => setTimeout(r, 30)) } await until(() => weekLabel() === start && boardReady()); await new Promise(r => setTimeout(r, 1500)); return { backAtStart: weekLabel() === start, chips: qa('[data-assignment]').length } })()`)
  // Picker: open (gap button), type, close.
  const opensP = [], keys = []
  for (let i = 0; i < 5; i++) {
    opensP.push(await ev(`timeIt(() => qa('[data-slot] button').find(b => b.textContent.includes('שיבוץ'))?.click(), () => q('[aria-label="בחירת איש צוות"] input'))`))
    for (const term of ['ד', 'דנ', 'דנה', 'דנה כ', '']) keys.push(await ev(`(async () => { const i = q('[aria-label="בחירת איש צוות"] input'); const t0 = performance.now(); type(i, ${JSON.stringify(term)}); await frame(); return Math.round(performance.now() - t0) })()`))
    if (i === 0) await shot(`${label}-picker.png`)
    await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`); await sleep(100)
  }
  results.openPicker = { median: median(opensP), runs: opensP }
  results.searchKeystroke = { median: median(keys), max: Math.max(...keys) }
  // Assign and remove (network included): until the chip appears / disappears.
  const asg = [], asgSeen = [], rem = []
  for (let i = 0; i < 3; i++) {
    const slot = await ev(`qa('[data-slot]').find(c => [...c.querySelectorAll('button')].some(b => b.textContent.includes('לא שובץ')))?.dataset.slot`)
    if (!slot) break
    await ev(`byText('[data-slot="${slot}"] button', 'שיבוץ').click()`); await ev(`until(() => q('[aria-label="בחירת איש צוות"] input'))`)
    // Visible feedback (the chip appears, optimistic) and confirmed save (the server's chip).
    const both = await ev(`(async () => { const t0 = performance.now(); q('[aria-label="בחירת איש צוות"] [role=option] button:not([disabled])').click(); await until(() => q('[data-slot="${slot}"] [data-assignment]')); await frame(); const seen = performance.now() - t0; await until(() => q('[data-slot="${slot}"] [data-assignment]:not([data-assignment="pending"])') && !q('[data-assignment="pending"]')); await frame(); return [Math.round(seen), Math.round(performance.now() - t0)] })()`)
    asgSeen.push(both[0]); asg.push(both[1])
    await ev(`until(() => !qa('[data-slot] button').some(b => b.disabled))`)
    rem.push(await ev(`timeIt(() => q('[data-slot="${slot}"] [aria-label^="הסרת"]').click(), () => !q('[data-slot="${slot}"] [data-assignment]'))`))
    await ev(`until(() => !qa('[data-slot] button').some(b => b.disabled))`)
  }
  results.assignVisible = { median: median(asgSeen), runs: asgSeen }
  results.assign = { median: median(asg), runs: asg }
  results.remove = { median: median(rem), runs: rem }
  // Drag and drop: a confirmed chip onto an empty slot of the same week (server confirmed).
  results.dragDrop = await ev(`(async () => {
    // A gap and a duty of the same date and period: moving the person there cannot conflict.
    const dst = qa('[data-slot]').find(c => [...c.querySelectorAll('button')].some(b => b.textContent.includes('לא שובץ')) && !c.querySelector('[data-assignment]'))
    const [d, per] = dst ? dst.dataset.slot.split('|') : []
    const src = dst && qa('[data-slot^="' + d + '|' + per + '|"] [data-assignment]:not([data-assignment="pending"])').find(x => !x.closest('td').querySelector('[aria-label="נעדר/ת"]'))
    if (!src || !dst) return -1
    const id = src.dataset.assignment, key = dst.dataset.slot, dt = new DataTransfer(), t0 = performance.now()
    src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt })); dst.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }))
    dst.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })); src.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }))
    await until(() => q('[data-slot="' + key + '"] [data-assignment]')); await frame(); const seen = Math.round(performance.now() - t0)
    await until(() => q('[data-slot="' + key + '"] [data-assignment="' + id + '"]') && !q('[data-assignment="pending"]')); await frame()
    return { visible: seen, confirmed: Math.round(performance.now() - t0) } })()`)
  await ev(`until(() => !qa('[data-slot] button').some(b => b.disabled))`)
  // Publish (through the confirmation dialog), until the status says published.
  results.publish = await ev(`(async () => { byText('button', 'פרסום').click(); await until(() => byText('[role=alertdialog] button, [role=dialog] button', 'פרסום')); const t0 = performance.now(); byText('[role=alertdialog] button, [role=dialog] button', 'פרסום').click(); await until(() => byText('span', 'פורסם') && !byText('span', 'טיוטה') && !byText('span', 'שינויים שלא')); await frame(); return Math.round(performance.now() - t0) })()`)
  // Scroll the page through the board: frame times and long tasks.
  results.scroll = await ev(`(async () => { longTasks.length = 0; const frames = []; let last = performance.now(); const main = q('main'); for (let i = 0; i < 90; i++) { main.scrollBy(0, i < 45 ? 40 : -40); await new Promise(r => requestAnimationFrame(r)); const now = performance.now(); frames.push(now - last); last = now } frames.sort((a, b) => a - b); return { p50: Math.round(frames[45]), p95: Math.round(frames[85]), max: Math.round(frames[89]), longTasks: longTasks.length } })()`)
  // Tab switching.
  const tabs = []
  for (const t of ['צוות', 'היעדרויות והחלפות', 'הגדרות', 'לוח שבועי']) tabs.push(await ev(`timeIt(() => byText('[role=tab]', ${JSON.stringify(t)}).click(), () => byText('[role=tab][aria-selected=true]', ${JSON.stringify(t)}))`))
  results.tabSwitch = { median: median(tabs), runs: tabs }
  // Template editor: open the tab (until its grid is filled), then replace one recurring duty.
  results.openTemplate = await ev(`timeIt(() => byText('[role=tab]', 'תבנית קבועה').click(), () => qa('[data-entry]').length > 100)`)
  results.editTemplate = await ev(`(async () => {
    const chip = qa('[data-entry] button')[2]; if (!chip) return -1
    chip.click(); await until(() => q('[aria-label="בחירת איש צוות"] [role=option] button:not([disabled])'))
    const before = qa('[data-entry]').map(e => e.textContent).join('|'), t0 = performance.now()
    q('[aria-label="בחירת איש צוות"] [role=option] button:not([disabled])').click()
    await until(() => qa('[data-entry]').map(e => e.textContent).join('|') !== before); await frame()
    return Math.round(performance.now() - t0) })()`)
  if (shotsDir) {
    await ev(`(async () => { const b = qa('[data-tslot] button').find(x => /הוספה|שיבוץ קבוע/.test(x.textContent)); b.click(); await until(() => byText('[aria-label="בחירת איש צוות"] button', 'הוסף מורה ידנית')); byText('[aria-label="בחירת איש צוות"] button', 'הוסף מורה ידנית').click(); await until(() => q('[aria-label="בחירת איש צוות"] form input')); type(q('[aria-label="בחירת איש צוות"] form input'), 'מיכאלה אורחת – מדריכת רובוטיקה'); byText('[aria-label="בחירת איש צוות"] label', 'זמני').querySelector('input').click(); await new Promise(r => setTimeout(r, 300)) })()`)
    await shot(`${label}-template-manual-teacher.png`)
    await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`)
  }
  await ev(`byText('[role=tab]', 'לוח שבועי').click()`)
  if (shotsDir) { await ev(`(async () => { q('[aria-label="השבוע הבא"]').click(); await until(() => qa('[data-origin="override"]').length >= 2 && qa('[data-origin="template"]').length > 50); await new Promise(r => setTimeout(r, 600)) })()`); await shot(`${label}-hybrid-overrides.png`); await ev(`q('[aria-label="השבוע הקודם"]').click()`); await sleep(800) }
  // Requests: open the board and stay 10 s; nothing should poll.
  results.idleRequests = await ev(`(async () => { const n0 = performance.getEntriesByType('resource').filter(e => e.name.includes('/api/duty/')).length; await new Promise(r => setTimeout(r, 10000)); return performance.getEntriesByType('resource').filter(e => e.name.includes('/api/duty/')).length - n0 })()`)
  results.pageErrors = { count: pageErrors.length, sample: pageErrors.slice(0, 3) }
  results.heapMB = await ev(`performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null`)
  ws.close(); chrome.kill(); ws = null
  return results
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1].endsWith('duty-perf.mjs')) {
  let seeded
  try {
    seeded = await seed()
    const r = await measure(process.env.QA_LABEL || 'run')
    console.log(JSON.stringify(r, null, 1))
  } catch (e) { console.error('FAILED', e.message) }
  finally {
    if (!keep) {
      await cleanup()
      if (seeded?.settingsBefore) { const { id: _i, updatedAt: _u, ...rest } = seeded.settingsBefore; await db.dutySettings.update({ where: { schoolId: school }, data: rest }).catch(() => {}) }
      else await db.dutySettings.deleteMany({ where: { schoolId: school } }).catch(() => {})
    }
    await db.$disconnect()
  }
}
