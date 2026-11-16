// Real-browser test of the duty roster admin page (headless Chrome via the DevTools protocol):
// clicks, typing and drag the way an administrator would, then checks the page, the API and the
// public screen endpoint.
//
// LOCAL TEST ENVIRONMENT ONLY (see ./_local.mjs). In school A it creates temporary staff, locations,
// periods, a screen with a duty region and two temporary users (roster VIEW and NONE). Everything
// created is removed at the end.
//
//   QA_CREDS_FILE=/path/outside/repo/qa-users.json npm run test:qa:duty-ui
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { ROOT, BASE, creds, db, ids, login, call, reporter } from './_local.mjs'

const require = createRequire(path.join(ROOT, 'package.json'))
const bcrypt = require('bcryptjs')
const { t, finish } = reporter()
const TAG = 'QA-DUI'
const started = new Date()
const made = { users: [], screens: [] }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const CHROME = process.env.QA_CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => fs.existsSync(p))
const settingsBefore = await db.dutySettings.findUnique({ where: { schoolId: ids.schoolA } })

const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(p => [p.type, p.value]))
const today = `${parts.year}-${parts.month}-${parts.day}`
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10)
const week = addDays(today, -new Date(today + 'T00:00:00Z').getUTCDay())

let chrome, ws, send, ev
async function openBrowser(cookie) {
  chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9349', `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'qa-dui-'))}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' })
  for (let i = 0; i < 50 && !ws; i++) { await sleep(200); try { const p = (await (await fetch('http://127.0.0.1:9349/json/list')).json()).find(x => x.type === 'page'); if (p) ws = new WebSocket(p.webSocketDebuggerUrl) } catch {} }
  await new Promise(r => { ws.onopen = r })
  let n = 0; const pend = new Map()
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id) } }
  send = (m, p = {}) => new Promise(r => { const i = ++n; pend.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params: p })) })
  ev = async x => { const r = await send('Runtime.evaluate', { expression: `(async () => { const v = await (0, eval)(${JSON.stringify(x)}); return v instanceof Node ? true : v })()`, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description?.slice(0, 300) ?? 'evaluate'); return r.result?.result?.value }
  await send('Network.enable'); await send('Page.enable')
  await setCookie(cookie)
}
async function setCookie(cookie) { await send('Network.clearBrowserCookies'); const [name, value] = cookie.split('='); await send('Network.setCookie', { name, value, url: BASE }) }
async function open(width = 1600, height = 1000) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: BASE + '/admin/duty' })
  for (let i = 0; i < 80; i++) { await sleep(250); if (await ev(`!!document.querySelector('[data-slot]') || /אין לך הרשאה|כדי לבנות לוח/.test(document.body.innerText)`).catch(() => false)) break }
  await ev(HELPERS)
}
// In-page helpers: React-friendly typing, clicking by text, waiting for a condition.
const HELPERS = `
window.q = s => document.querySelector(s);
window.qa = s => [...document.querySelectorAll(s)];
window.byText = (sel, text) => qa(sel).find(e => e.textContent.trim().includes(text));
window.type = (el, v) => { const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })) };
window.untilClick = async (fn, ms) => { const el = await until(fn, ms); el?.click(); return !!el };
window.untilText = async (fn, ms) => (await until(fn, ms))?.textContent ?? null;
window.until = async (fn, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { try { const v = fn(); if (v) return v } catch {} await new Promise(r => setTimeout(r, 100)) } return null };
window.cell = slot => q('[data-slot="' + slot + '"]');
// Confirmed chips only (an optimistic chip is data-assignment="pending" until the server answers).
window.chips = slot => qa('[data-slot="' + slot + '"] [data-assignment]:not([data-assignment="pending"])').map(c => c.textContent.trim());
window.settled = () => !q('[data-assignment="pending"]') && !qa('span').some(s => /^(שומר…|מתעדכן…)$/.test(s.textContent.trim())) && !qa('[data-slot] button').some(b => b.disabled && !b.closest('[aria-label="בחירת איש צוות"]'));
window.untilSettled = () => until(() => settled(), 10000);
`

try {
  if (!CHROME) throw new Error('Chrome not found (set QA_CHROME)')
  const A = await login(creds.A)
  const temp = async dutyAccess => {
    const password = crypto.randomBytes(18).toString('base64url'), email = `qa-dui-${dutyAccess.toLowerCase()}-${Date.now()}@qa.local`
    const u = await db.user.create({ data: { email, name: `${TAG} ${dutyAccess}`, role: 'EDITOR', dutyAccess, schoolId: ids.schoolA, passwordHash: await bcrypt.hash(password, 10) } })
    made.users.push(u.id); return login({ email, password })
  }
  const VIEW = await temp('VIEW'), NONE = await temp('NONE')
  await call(A, '/api/duty/settings', 'POST', { schoolDays: [0, 1, 2, 3, 4, 5, 6], maxPerDay: null, maxPerWeek: null, allowOverride: true })
  const mk = async (kind, body) => (await call(A, '/api/duty/' + kind, 'POST', body)).j?.data?.id
  const staff = {}
  for (const n of ['דנה לוי', 'יוסי כהן', 'מיכל אברהם']) staff[n] = await mk('staff', { firstName: `${TAG} ${n}`, lastName: '' })
  const yard = await mk('location', { name: `${TAG} חצר`, staffNeeded: 1, required: true })
  const hall = await mk('location', { name: `${TAG} מסדרון`, staffNeeded: 1, required: true })
  const all = [0, 1, 2, 3, 4, 5, 6]
  const p1 = await mk('period', { name: `${TAG} הפסקה 1`, startTime: '10:00', endTime: '10:20', weekdays: all })
  const p2 = await mk('period', { name: `${TAG} הפסקה 2`, startTime: '12:00', endTime: '12:15', weekdays: all })
  const S = (loc, per, d = today) => `${d}|${per}|${loc}`
  const screen = await db.screen.create({ data: { schoolId: ids.schoolA, name: `${TAG} screen`, slug: `qa-dui-${Date.now()}`, layout: { create: { mainSections: 1 } },
    sections: { create: [{ position: 0, widthPct: 100, contentItems: { create: [{ contentType: 'DUTY_ROSTER', active: true, settings: { title: 'תורנויות', mode: 'day' } }] } }] } }, include: { sections: { include: { contentItems: true } } } })
  made.screens.push(screen.id)
  const itemId = screen.sections[0].contentItems[0].id
  const tv = async () => ((await call(null, `/api/public/duty/${itemId}`)).j?.data?.periods ?? []).filter(p => [p1, p2].includes(p.periodId))

  await openBrowser(A)
  await open()
  t('page loads: draft status, uncovered slots marked', await ev(`!!until(() => settled() && byText('span', 'טיוטה – לא פורסם')) && !!cell(${JSON.stringify(S(yard, p1))})?.textContent.includes('לא שובץ')`))
  t('RTL and no horizontal page overflow (1600px)', await ev(`document.documentElement.dir === 'rtl' || getComputedStyle(q('main')).direction === 'rtl'`) && await ev(`document.documentElement.scrollWidth <= innerWidth + 1`))

  // 1–2. Assign through the picker (search + click).
  const pickInto = async (slot, name, search = name.split(' ')[0]) => {
    await ev(`byText('[data-slot="${slot}"] button', 'שיבוץ')?.click() ?? byText('[data-slot="${slot}"] button', 'הוספה')?.click()`)
    await ev(`until(() => q('[aria-label="בחירת איש צוות"] input'))`)
    await ev(`type(q('[aria-label="בחירת איש צוות"] input'), ${JSON.stringify(search)})`)
    await sleep(150)
    await ev(`byText('[aria-label="בחירת איש צוות"] [role=option] button', ${JSON.stringify(name)})?.click()`)
    return ev(`until(() => settled() && !q('[aria-label="בחירת איש צוות"]') && chips(${JSON.stringify(slot)}).some(c => c.includes(${JSON.stringify(name)})))`)
  }
  t('assign a teacher with the searchable picker', !!(await pickInto(S(yard, p1), `${TAG} דנה לוי`)))
  t('assign a second slot', !!(await pickInto(S(hall, p2), `${TAG} יוסי כהן`)))

  // 6. Conflict visible in the picker before choosing.
  await ev(`byText('[data-slot="${S(hall, p1)}"] button', 'שיבוץ')?.click()`)
  const warn = await ev(`untilText(() => byText('[aria-label="בחירת איש צוות"] [role=option]', ${JSON.stringify(`${TAG} דנה לוי`)}))`)
  t('overlap shown in the picker (same person, same time)', /כבר בתורנות/.test(warn ?? ''), warn)
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`)
  await sleep(200)

  // 3. Change an assignment (click the name → pick another).
  const aid = await ev(`q('[data-slot="${S(yard, p1)}"] [data-assignment]').dataset.assignment`)
  await ev(`q('[data-slot="${S(yard, p1)}"] [data-assignment] button').click()`)
  await ev(`until(() => q('[aria-label="בחירת איש צוות"] input'))`)
  await ev(`byText('[aria-label="בחירת איש צוות"] [role=option] button', ${JSON.stringify(`${TAG} מיכל אברהם`)})?.click()`)
  const changed = await ev(`until(() => settled() && chips(${JSON.stringify(S(yard, p1))}).some(c => c.includes('מיכל')))`)
  const row = await db.dutyAssignment.findUnique({ where: { id: aid } })
  t('change an assignment (same record, new person)', !!changed && row?.staffId === staff['מיכל אברהם'])

  // Drag and drop: move the hall/p2 assignment to yard/p2.
  const moveId = await ev(`q('[data-slot="${S(hall, p2)}"] [data-assignment]').dataset.assignment`)
  await ev(`(() => { const src = q('[data-assignment="${moveId}"]'), dst = cell(${JSON.stringify(S(yard, p2))}); const dt = new DataTransfer();
    src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt })); dst.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    dst.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })); src.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt })) })()`)
  t('drag and drop moves an assignment', !!(await ev(`until(() => settled() && chips(${JSON.stringify(S(yard, p2))}).some(c => c.includes('יוסי')) && !chips(${JSON.stringify(S(hall, p2))}).length)`)))

  // 7. Uncovered count shown.
  const gapsBadge = await ev(`byText('span', 'ללא שיבוץ')?.textContent`)
  t('uncovered locations counted in the header', /\d+ ללא שיבוץ/.test(gapsBadge ?? ''), gapsBadge)

  // Manual teacher: add from the picker, then the duplicate check.
  await ev(`byText('[data-slot="${S(hall, p1)}"] button', 'שיבוץ')?.click()`)
  await ev(`untilClick(() => byText('[aria-label="בחירת איש צוות"] button', 'הוסף מורה ידנית'))`)
  await ev(`until(() => q('[aria-label="בחירת איש צוות"] form input'))`)
  await ev(`type(q('[aria-label="בחירת איש צוות"] form input'), ${JSON.stringify(`${TAG} מדריך אורח`)})`)
  await ev(`byText('[aria-label="בחירת איש צוות"] label', 'זמני')?.querySelector('input').click()`)
  await ev(`byText('[aria-label="בחירת איש צוות"] button', 'הוספה ושיבוץ').click()`)
  const manualShown = await ev(`until(() => settled() && chips(${JSON.stringify(S(hall, p1))}).some(c => c.includes('מדריך אורח')))`)
  const manual = await db.dutyStaff.findFirst({ where: { schoolId: ids.schoolA, firstName: `${TAG} מדריך אורח` } })
  t('"הוסף מורה ידנית": created (only the name) and assigned at once', !!manualShown && manual?.kind === 'TEMPORARY' && manual?.source === 'MANUAL')
  t('manual teacher marked on the board', /זמני/.test((await ev(`chips(${JSON.stringify(S(hall, p1))}).join(' ')`)) ?? ''))
  await ev(`byText('[data-slot="${S(hall, p2)}"] button', 'שיבוץ')?.click()`)
  await ev(`untilClick(() => byText('[aria-label="בחירת איש צוות"] button', 'הוסף מורה ידנית'))`)
  await ev(`until(() => q('[aria-label="בחירת איש צוות"] form input'))`)
  await ev(`type(q('[aria-label="בחירת איש צוות"] form input'), ${JSON.stringify(`${TAG}  מדריך  אורח`)})`)
  await ev(`byText('[aria-label="בחירת איש צוות"] button', 'הוספה ושיבוץ').click()`)
  const dupShown = await ev(`until(() => byText('[aria-label="בחירת איש צוות"] p', 'כבר יש איש צוות בשם'))`)
  t('duplicate name: warning with the existing record', !!dupShown)
  await ev(`byText('[aria-label="בחירת איש צוות"] button', 'בחירה').click()`)
  await ev(`until(() => !q('[aria-label="בחירת איש צוות"]'))`)
  const manualCount = await db.dutyStaff.count({ where: { schoolId: ids.schoolA, firstName: { contains: 'מדריך' } } })
  t('choosing the existing record does not create a duplicate', manualCount === 1)
  const dupApi = await call(A, '/api/duty/staff', 'POST', { firstName: `${TAG} מדריך אורח`, lastName: '', kind: 'MANUAL', confirmDuplicate: true })
  t('a distinct person with the same name is allowed when confirmed', dupApi.s === 201)
  if (dupApi.j?.data?.id) await call(A, '/api/duty/staff?id=' + dupApi.j.data.id, 'DELETE')

  // 4. Remove an assignment.
  const before = await ev(`chips(${JSON.stringify(S(hall, p2))}).length`)
  await ev(`q('[data-slot="${S(hall, p2)}"] [aria-label^="הסרת"]').click()`)
  t('remove an assignment', before === 1 && !!(await ev(`until(() => settled() && chips(${JSON.stringify(S(hall, p2))}).length === 0)`)))

  // 11. Draft without publishing: nothing on the screen.
  t('draft saved without publishing (screen shows nothing)', (await tv()).length === 0 && await ev(`!!byText('span', 'טיוטה – לא פורסם')`))

  // 12. Publish through the confirmation dialog.
  await ev(`byText('button', 'פרסום').click()`)
  await ev(`untilClick(() => byText('[role=alertdialog] button, [role=dialog] button', 'פרסום'))`)
  t('publish (with confirmation)', !!(await ev(`until(() => settled() && byText('span', 'פורסם') && !byText('span', 'טיוטה'))`)))
  const tv1 = await tv()
  t('screen shows the published roster, including the manual teacher', tv1.some(p => p.entries.some(e => e.staffName?.includes('מדריך אורח'))) && tv1.some(p => p.entries.some(e => e.staffName?.includes('מיכל'))))

  // 13. Change after publishing: the screen keeps the published version.
  await ev(`q('[data-slot="${S(yard, p1)}"] [aria-label^="הסרת"]').click()`)
  t('change after publishing marks unpublished changes', !!(await ev(`until(() => settled() && byText('span', 'יש שינויים שלא פורסמו'))`)))
  const tv2 = await tv()
  t('screen still shows the previously published version', JSON.stringify(tv2) === JSON.stringify(tv1))

  // 14. Refresh: data persists.
  await open()
  t('after refresh the draft is kept', (await ev(`chips(${JSON.stringify(S(yard, p1))}).length`)) === 0 && (await ev(`chips(${JSON.stringify(S(hall, p1))}).some(c => c.includes('מדריך'))`)) && !!(await ev(`byText('span', 'יש שינויים שלא פורסמו')`)))

  // 5. Copy to the next week (button).
  await ev(`byText('button', 'העתקה לשבוע הבא').click()`)
  await sleep(1500)
  const next = await call(A, `/api/duty/week?start=${addDays(week, 7)}`)
  t('copy to the following week', (next.j?.data?.assignments ?? []).length >= 2, `${(next.j?.data?.assignments ?? []).length}`)

  // 8–10. Absence → "טרם שובץ מחליף" → suggestion → approve (absences tab).
  await ev(`byText('[role=tab]', 'היעדרויות והחלפות').click()`)
  await ev(`until(() => q('#abs-staff'))`)
  await ev(`type(q('#abs-staff'), ${JSON.stringify(manual.id)}); type(q('#abs-date'), ${JSON.stringify(today)})`)
  await ev(`byText('button', 'שמירת היעדרות').click()`)
  t('mark the manual teacher absent: assignment needs a substitute', !!(await ev(`until(() => settled() && byText('span', 'טרם שובץ מחליף'))`)))
  await ev(`byText('button', 'הצעת מחליף/ה').click()`)
  const suggested = await ev(`until(() => qa('button').filter(b => b.textContent.trim() === 'אישור').length) || 0`)
  t('replacement suggestions offered', suggested > 0)
  await ev(`qa('button').find(b => b.textContent.trim() === 'אישור').click()`)
  t('approve a replacement', !!(await ev(`until(() => settled() && byText('span', 'מחליף/ה:'))`)))
  const tv3 = await tv()
  t('screen shows the substitute without republishing', tv3.some(p => p.entries.some(e => e.status === 'substitute')))

  // Temporary teacher whose dates ended: not selectable for new assignments.
  await call(A, '/api/duty/staff', 'PATCH', { id: manual.id, validUntil: addDays(today, -1), validFrom: null })
  await open()
  await ev(`byText('[data-slot="${S(yard, p1)}"] button', 'שיבוץ')?.click()`)
  const expired = await ev(`until(() => byText('[aria-label="בחירת איש צוות"] [role=option]', 'מדריך אורח'))`).then(() => ev(`(() => { const o = byText('[aria-label="בחירת איש צוות"] [role=option]', 'מדריך אורח'); return { disabled: o.querySelector('button').disabled, text: o.textContent } })()`))
  t('ended temporary teacher: blocked for new assignments, with the reason', expired?.disabled && /זמין\/ה לשיבוץ רק/.test(expired.text), JSON.stringify(expired))
  t('…and the existing assignment stays', (await ev(`chips(${JSON.stringify(S(hall, p1))}).some(c => c.includes('מדריך'))`)) === true)
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`)

  // Recurring template: "הוסף מורה ידנית" inside the template picker.
  await call(A, '/api/duty/settings', 'POST', { schoolDays: [0, 1, 2, 3, 4, 5, 6], maxPerDay: null, maxPerWeek: null, allowOverride: true, scheduleMode: 'RECURRING' })
  await open()
  await ev(`byText('[role=tab]', 'תבנית קבועה').click()`)
  await ev(`untilClick(() => byText('button', 'תבנית חדשה'))`)
  await ev(`until(() => q('#tp-n'))`)
  await ev(`type(q('#tp-n'), ${JSON.stringify(TAG + " קבוע")}); q('#tp-f') && type(q('#tp-f'), ${JSON.stringify(week)})`)
  await ev(`byText('label', 'להתחיל מהשיבוצים')?.querySelector('input')?.checked && byText('label', 'להתחיל מהשיבוצים').querySelector('input').click()`)
  await ev(`byText('button', 'יצירה').click()`)
  const wd = new Date(today + 'T00:00:00Z').getUTCDay()
  const tslot = `${wd}|${p1}|${yard}`
  t('template created from the UI', !!(await ev(`until(() => q('[data-tslot="${tslot}"]'))`)))
  const addTemplateManual = async name => {
    await ev(`byText('[data-tslot="${tslot}"] button', 'שיבוץ קבוע')?.click() ?? byText('[data-tslot="${tslot}"] button', 'הוספה')?.click()`)
    await ev(`untilClick(() => byText('[aria-label="בחירת איש צוות"] button', 'הוסף מורה ידנית'))`)
    await ev(`until(() => q('[aria-label="בחירת איש צוות"] form input'))`)
    await ev(`type(q('[aria-label="בחירת איש צוות"] form input'), ${JSON.stringify(name)}); byText('[aria-label="בחירת איש צוות"] label', 'זמני').querySelector('input').click()`)
    await sleep(100)
    await ev(`byText('[aria-label="בחירת איש צוות"] button', 'הוספה ושיבוץ').click()`)
  }
  await addTemplateManual(`${TAG} מדריכה קבועה`)
  const tplManual = await ev(`until(() => qa('[data-tslot="${tslot}"] [data-entry]').some(e => e.textContent.includes('מדריכה קבועה')))`)
  const tplStaff = await db.dutyStaff.findFirst({ where: { schoolId: ids.schoolA, firstName: `${TAG} מדריכה קבועה` } })
  t('template picker: "הוסף מורה ידנית" creates the teacher (name only) and adds the recurring duty', !!tplManual && tplStaff?.kind === 'TEMPORARY' && tplStaff?.source === 'MANUAL')
  await ev(`byText('[data-tslot="${tslot}"] button', 'הוספה')?.click()`)
  await ev(`untilClick(() => byText('[aria-label="בחירת איש צוות"] button', 'הוסף מורה ידנית'))`)
  await ev(`until(() => q('[aria-label="בחירת איש צוות"] form input'))`)
  await ev(`type(q('[aria-label="בחירת איש צוות"] form input'), ${JSON.stringify(TAG + ' מדריכה  קבועה')})`)
  await ev(`byText('[aria-label="בחירת איש צוות"] button', 'הוספה ושיבוץ').click()`)
  t('template picker: duplicate name warned, existing record offered', !!(await ev(`until(() => byText('[aria-label="בחירת איש צוות"] p', 'כבר יש איש צוות בשם'))`)))
  await ev(`byText('[aria-label="בחירת איש צוות"] button', 'ביטול')?.click() ?? document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`)
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`)
  t('…no duplicate staff record', (await db.dutyStaff.count({ where: { schoolId: ids.schoolA, firstName: { contains: 'מדריכה' } } })) === 1)
  // This week and the next were planned on their own before the switch (weekly mode, copy to next week),
  // so they stay as planned; two weeks ahead follows the template.
  const ahead = async () => { for (let i = 0; i < 2; i++) { await ev(`q('[aria-label="השבוע הבא"]').click()`); await sleep(400) } }
  await ev(`byText('[role=tab]', 'לוח שבועי').click()`)
  await ahead()
  t('the recurring duty of the manual teacher shows on the weekly board', !!(await ev(`until(() => qa('[data-origin="template"]').some(c => c.textContent.includes('מדריכה קבועה')))`)))
  await call(A, '/api/duty/staff', 'PATCH', { id: tplStaff.id, validUntil: addDays(today, -1) })
  await open(); await ahead(); await sleep(1500)
  t('…and stops after the temporary teacher’s end date (slot uncovered)', !(await ev(`qa('[data-origin="template"]').some(c => c.textContent.includes('מדריכה קבועה'))`)))
  await db.dutyTemplate.deleteMany({ where: { schoolId: ids.schoolA, name: { startsWith: TAG } } })

  // Narrow window: no page overflow (the board scrolls inside its card).
  await open(1100, 800)
  t('no horizontal page overflow at 1100px (board scrolls in its card)', await ev(`document.documentElement.scrollWidth <= innerWidth + 1`))

  // 15. Permissions in the browser.
  await setCookie(VIEW); await open()
  t('VIEW user: board readable, no edit or publish controls', await ev(`!!q('[data-slot]') && !byText('button', 'פרסום') && !qa('[data-slot] button').some(b => !b.disabled) && !byText('button', 'העתקה')`))
  await setCookie(NONE); await open()
  t('no roster permission: page says so, no board', await ev(`/אין לך הרשאה/.test(document.body.innerText) && !q('[data-slot]')`))
  t('no roster permission: sidebar has no roster link', await ev(`!q('a[href="/admin/duty"]')`))
} catch (e) {
  t('run', false, e.message)
} finally {
  try { ws?.close() } catch {}
  chrome?.kill()
  await db.screen.deleteMany({ where: { id: { in: made.screens } } }).catch(() => {})
  await db.dutyStaff.deleteMany({ where: { schoolId: ids.schoolA, firstName: { startsWith: TAG } } }).catch(() => {})
  await db.dutyLocation.deleteMany({ where: { schoolId: ids.schoolA, name: { startsWith: TAG } } }).catch(() => {})
  await db.dutyPeriod.deleteMany({ where: { schoolId: ids.schoolA, name: { startsWith: TAG } } }).catch(() => {})
  await db.dutyWeek.deleteMany({ where: { schoolId: ids.schoolA, assignments: { none: {} }, createdAt: { gte: started } } }).catch(() => {})
  await db.dutyAuditEvent.deleteMany({ where: { schoolId: ids.schoolA, createdAt: { gte: started } } }).catch(() => {})
  await db.user.deleteMany({ where: { id: { in: made.users } } }).catch(() => {})
  if (settingsBefore) { const { id: _i, updatedAt: _u, ...rest } = settingsBefore; await db.dutySettings.update({ where: { schoolId: ids.schoolA }, data: rest }).catch(() => {}) }
  else await db.dutySettings.deleteMany({ where: { schoolId: ids.schoolA } }).catch(() => {})
  await db.$disconnect()
  finish()
}
