// Browser test: pasting Office-shaped clipboard HTML into the announcement editor, and the TV
// rendering of the result, in headless Chrome against the local app.
//
// LOCAL TEST ENVIRONMENT ONLY (see ./_local.mjs). Uses the fixtures in tests/fixtures/office.mjs
// (Office-shaped HTML, not a real Word/Excel clipboard: that still needs a manual check). Creates one
// temporary announcement through the API (save and reopen check) and deletes it at the end.
//
//   QA_CREDS_FILE=/path/outside/repo/qa-users.json npm run test:qa:office-paste
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { BASE, creds, db, login, call, reporter } from './_local.mjs'
import { EXCEL_TABLE, WORD_DOCUMENT } from '../../tests/fixtures/office.mjs'

const { t, finish } = reporter()
const CHROME = process.env.QA_CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => fs.existsSync(p))
const sleep = ms => new Promise(r => setTimeout(r, ms))
const created = []
let chrome, ws

async function browser() {
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-paste-'))
  chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9347', `--user-data-dir=${prof}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' })
  for (let i = 0; i < 50 && !ws; i++) {
    await sleep(200)
    try { const p = (await (await fetch('http://127.0.0.1:9347/json/list')).json()).find(x => x.type === 'page'); if (p) ws = new WebSocket(p.webSocketDebuggerUrl) } catch {}
  }
  await new Promise(r => { ws.onopen = r })
  let id = 0; const pending = new Map()
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
  const ev = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'evaluate failed')
    return r.result?.result?.value
  }
  return { send, ev }
}

// In-page helpers: wait for the hydrated editor, paste, measure the preview.
const PAGE_HELPERS = `
window.qaWait = async () => { for (let i = 0; i < 120; i++) { const ed = document.querySelector('.ann-editor'); if (ed && Object.keys(ed).some(k => k.startsWith('__react'))) return true; await new Promise(r => setTimeout(r, 250)) } return false };
window.qaPaste = async (html, text, selectAll) => { const ed = document.querySelector('.ann-editor'); ed.focus(); const s = getSelection(); s.selectAllChildren(ed); if (!selectAll) s.collapseToEnd(); const dt = new DataTransfer(); if (html) dt.setData('text/html', html); dt.setData('text/plain', text || ''); ed.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); await new Promise(r => setTimeout(r, 300)); return ed.innerHTML };
window.qaMode = async label => { [...document.querySelectorAll('[aria-label="אופן ההדבקה"] [role=radio]')].find(b => b.textContent === label).click(); await new Promise(r => setTimeout(r, 300)) };
window.qaPreview = async label => {
  if (!document.querySelector('[aria-label="גודל האזור בתצוגה המקדימה"]')) [...document.querySelectorAll('button')].find(b => b.textContent === 'תצוגה מקדימה').click();
  await new Promise(r => setTimeout(r, 800));
  [...document.querySelectorAll('[aria-label="גודל האזור בתצוגה המקדימה"] [role=radio]')].find(b => b.textContent === label).click();
  await new Promise(r => setTimeout(r, 3000));
  const body = document.querySelector('.tv-ann-body'), room = body.clientWidth;
  const P = s => { const m = /rgba?\\(([\\d.]+)[, ]+([\\d.]+)[, ]+([\\d.]+)(?:[, /]+([\\d.]+))?/.exec(s); return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null };
  const L = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]) };
  const contrasts = [...body.querySelectorAll('td')].filter(td => td.textContent.trim()).map(td => { let bg = null; for (let n = td; n && n !== body; n = n.parentElement) { const c = P(getComputedStyle(n).backgroundColor); if (c && c[3] > .5) { bg = c; break } } if (!bg) return 99; const fg = L(P(getComputedStyle(td).color)), b = L(bg); return (Math.max(fg, b) + .05) / (Math.min(fg, b) + .05) });
  return { rich: body.classList.contains('tv-ann-rich'), room, widest: Math.max(0, ...[...body.querySelectorAll('table')].map(x => x.offsetWidth)), minContrast: Math.min(99, ...contrasts), fontPct: Math.min(100, ...[...body.querySelectorAll('table')].map(x => Math.round(parseFloat(getComputedStyle(x).fontSize) / parseFloat(getComputedStyle(body).fontSize) * 100))), pageOverflow: document.documentElement.scrollWidth > innerWidth + 1 };
};`

try {
  if (!CHROME) throw new Error('Chrome not found (set QA_CHROME)')
  const cookie = await login(creds.A)
  const { send, ev } = await browser()
  await send('Network.enable')
  const [name, value] = cookie.split('=')
  await send('Network.setCookie', { name, value: value, url: BASE })
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false })
  await send('Page.enable')
  await send('Page.navigate', { url: BASE + '/admin/announcements/new' })
  await sleep(2000)
  await ev(PAGE_HELPERS)
  t('editor loads and hydrates', await ev('qaWait()'))

  // Excel (default mode "מותאם למסך").
  const excel = await ev(`qaPaste(${JSON.stringify(EXCEL_TABLE)}, 'x')`)
  const dom = s => `(() => { const d = document.createElement('div'); d.innerHTML = ${JSON.stringify(s)}; return d })()`
  const xl = await ev(`(() => { const d = ${dom(excel)}; const tds = [...d.querySelectorAll('td')]; return { tables: d.querySelectorAll('table').length, rows: d.querySelectorAll('tr').length, colspan: !!d.querySelector('td[colspan="4"]'), rowspan: !!d.querySelector('td[rowspan="2"]'), colored: tds.filter(td => td.style.backgroundColor).length, classes: !!d.querySelector('[class]'), header: tds[0].style.textAlign, white: tds[0].style.color, text: d.textContent } })()`)
  t('Excel: one table, 5 rows, merged cells kept', xl.tables === 1 && xl.rows === 5 && xl.colspan && xl.rowspan, JSON.stringify(xl))
  t('Excel: class colors inlined on cells, no class attributes', xl.colored >= 14 && !xl.classes, `colored ${xl.colored}`)
  t('Excel: header alignment and white text kept', xl.header === 'center' && xl.white === 'white', `${xl.header} ${xl.white}`)
  t('Excel: displayed values (no formulas)', ['87%', '1,234.50', '12/11/2026'].every(v => xl.text.includes(v)) && !xl.text.includes('=B3'))

  // Word, pasted over the Excel table (select all): replaces it.
  const word = await ev(`qaPaste(${JSON.stringify(WORD_DOCUMENT)}, 'x', true)`)
  const wd = await ev(`(() => { const d = ${dom(word)}; return { tables: d.querySelectorAll('table').length, ul: d.querySelectorAll('ul > li').length, ol: d.querySelectorAll('ol > li').length, bullet: d.textContent.includes('·'), link: d.textContent.includes('אתר בית הספר') && !d.querySelector('a'), heading: !!d.querySelector('p > b') && d.textContent.includes('ערב הורים'), leftRtl: [...d.querySelectorAll('[dir=rtl]')].some(e => e.style.textAlign === 'left'), excelGone: !d.textContent.includes('Room 214') } })()`)
  t('Word: pasting over a selection replaces it', wd.excelGone && wd.tables === 1, JSON.stringify(wd))
  t('Word: bulleted and numbered lists become real lists, markers removed', wd.ul === 2 && wd.ol === 2 && !wd.bullet, JSON.stringify(wd))
  t('Word: heading kept as bold, link text kept without the link', wd.heading && wd.link)
  t('Word: no contradicting left alignment on RTL paragraphs', !wd.leftRtl)

  // Plain-text mode.
  await ev(`qaMode('טקסט בלבד')`)
  const plain = await ev(`qaPaste('<p><b style="color:red">X</b></p>', 'שורה 1\\nשורה 2\\n\\nפסקה', false)`)
  t('plain mode: text only', /שורה 1/.test(plain) && !/color:red/.test(plain))
  await ev(`qaMode('מותאם למסך')`)

  // Repeated paste (Excel twice more) and TV preview in the three region sizes.
  await ev(`qaPaste(${JSON.stringify(EXCEL_TABLE)}, 'x')`)
  await ev(`qaPaste(${JSON.stringify(EXCEL_TABLE)}, 'x')`)
  for (const region of ['מסך מלא', 'חצי מסך', 'שליש מסך']) {
    const m = await ev(`qaPreview(${JSON.stringify(region)})`)
    t(`TV ${region}: rich layout, tables inside the region, no page overflow`, m.rich && m.widest <= m.room + 1 && !m.pageOverflow, JSON.stringify(m))
    t(`TV ${region}: table text readable (contrast ≥ 4.5, size ≥ 60%)`, m.minContrast >= 4.5 && m.fontPct >= 60, JSON.stringify(m))
  }

  // Save and reopen: the stored body is what the editor shows again.
  const body = await ev(`document.querySelector('.ann-editor').innerHTML`)
  const now = Date.now()
  const r = await call(cookie, '/api/announcements', 'POST', { title: 'QA-PASTE temporary', showTitle: true, body, priority: 'LOW', active: false, startAt: new Date(now).toISOString(), endAt: new Date(now + 864e5).toISOString() })
  const id = r.j?.data?.id
  if (id) created.push(id)
  t('save: announcement created', r.s === 201 || r.s === 200, `${r.s} ${r.text.slice(0, 200)}`)
  if (id) {
    const stored = (await db.announcement.findUnique({ where: { id }, select: { body: true } }))?.body ?? ''
    t('save: no unsafe markup stored', !/<(script|style|a|img)\b|\son\w+=|class=/i.test(stored))
    await send('Page.navigate', { url: `${BASE}/admin/announcements/${id}/edit` })
    await sleep(2000); await ev(PAGE_HELPERS); await ev('qaWait()')
    const reopened = await ev(`(() => { const ed = document.querySelector('.ann-editor'); return { tables: ed.querySelectorAll('table').length, colored: [...ed.querySelectorAll('td')].filter(td => td.style.backgroundColor).length, ul: ed.querySelectorAll('ul > li').length } })()`)
    t('reopen: tables, colors and lists come back', reopened.tables === 3 && reopened.colored >= 28 && reopened.ul === 2, JSON.stringify(reopened))
  }
} catch (e) {
  t('run', false, e.message)
} finally {
  for (const id of created) await db.announcement.delete({ where: { id } }).catch(() => {})
  try { ws?.close() } catch {}
  chrome?.kill()
  await db.$disconnect()
  finish()
}
