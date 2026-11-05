// Integration tests: the "אתר חיצוני" (IFRAME) content type — URL policy enforced by the API,
// permissions, school isolation, what is stored, and what the public screen receives.
//
// LOCAL TEST ENVIRONMENT ONLY (see ./_local.mjs). Creates a temporary screen and two temporary
// users of school A (EDITOR, VIEWER; random passwords that are never printed), and removes them.
// Needs DNS (the API checks where host names resolve); nothing is fetched from the sites.
//
//   QA_CREDS_FILE=/path/outside/repo/qa-users.json npm run test:qa:iframe
import crypto from 'node:crypto'
import path from 'node:path'
import { createRequire } from 'node:module'
import { ROOT, BASE, db, ids, creds, login, call, reporter } from './_local.mjs'

const require = createRequire(path.join(ROOT, 'package.json'))
const bcrypt = require('bcryptjs')
const { t, finish } = reporter()
const TAG = 'QA-IFRAME'
const created = { screens: [], users: [] }
const tempUser = async role => {
  const password = crypto.randomBytes(18).toString('base64url')
  const email = `qa-iframe-${role.toLowerCase()}-${Date.now()}@qa.local`
  const u = await db.user.create({ data: { email, name: `${TAG} ${role}`, role, schoolId: ids.schoolA, passwordHash: await bcrypt.hash(password, 10) } })
  created.users.push(u.id)
  return login({ email, password })
}
const GOOD = 'https://www.wikipedia.org/'

try {
  const A = await login(creds.A), B = await login(creds.B)
  const E = await tempUser('EDITOR'), V = await tempUser('VIEWER')
  const s = await db.screen.create({
    data: { schoolId: ids.schoolA, name: `${TAG} Screen`, slug: `qa-iframe-${Date.now()}`,
      layout: { create: { headerEnabled: true, footerEnabled: true, mainSections: 1 } }, sections: { create: [{ position: 0, widthPct: 100 }] } },
    include: { sections: true },
  })
  created.screens.push(s.id)
  const sec = s.sections[0]
  const url = `/api/screens/${s.id}/sections/${sec.id}/content`
  const post = (who, u, extra = {}) => call(who, url, 'POST', { contentType: 'IFRAME', settings: { url: u, ...extra } })
  const stored = () => db.contentItem.findMany({ where: { sectionId: sec.id } })

  // Permissions and isolation
  t('anonymous cannot create (401)', (await post(null, GOOD)).s === 401)
  t('VIEWER cannot create (403)', (await post(V, GOOD)).s === 403)
  t('another school cannot create (404)', (await post(B, GOOD)).s === 404)
  t('nothing stored after rejected requests', (await stored()).length === 0)

  // Malicious and invalid URLs (API is the authority)
  const evil = ['http://example.org/', 'javascript:alert(document.cookie)', 'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd',
    'https://user:pw@example.org/', 'https://localhost/', 'https://127.0.0.1/', 'https://2130706433/', 'https://[::1]/', 'https://169.254.169.254/latest/meta-data/',
    'https://192.168.1.1/', 'https://intranet/', 'https://printer.local/', 'https://example.org:8443/', 'https://example.org/?token=abc',
    `https://${new URL(BASE).host}/admin/settings`, '<iframe src="https://example.org"></iframe>', '', 'https://no-such-host-qa-iframe.invalid/']
  const results = await Promise.all(evil.map(u => post(E, u)))
  const accepted = evil.filter((u, i) => results[i].s !== 400)
  t(`${evil.length} malicious or invalid URLs rejected with 400`, accepted.length === 0, accepted.join(' | '))
  t('…with a Hebrew message for the user', results.every(r => typeof r.j?.error === 'string' && /[֐-׿]/.test(r.j.error)))
  const rebind = await post(E, 'https://localtest.me/')
  t('a public name resolving to 127.0.0.1 is rejected (DNS check)', rebind.s === 400, `${rebind.s} ${rebind.text}`)
  t('still nothing stored', (await stored()).length === 0)

  // Valid URL: stored normalized, only the URL is kept
  const ok = await post(E, '  https://WWW.Wikipedia.org  ', { extra: '<script>', allow: 'allow-top-navigation', sandbox: 'none' })
  const rows = await stored()
  t('EDITOR saves a valid https URL', [200, 201].includes(ok.s) && rows.length === 1 && rows[0].contentType === 'IFRAME', ok.text)
  t('…stored normalized, and ONLY the url (no extra settings such as sandbox)', JSON.stringify(rows[0]?.settings) === JSON.stringify({ url: GOOD }), JSON.stringify(rows[0]?.settings))
  const reload = await call(E, url)
  t('reload returns the saved URL', reload.j?.data?.settings?.url === GOOD)

  // Updating an existing IFRAME item through PUT cannot bypass the policy
  const item = rows[0]
  const putBad = await call(E, `${url}/${item.id}`, 'PUT', { settings: { url: 'javascript:alert(1)' } })
  t('PUT with an unsafe URL is rejected (400), item unchanged', putBad.s === 400 && JSON.stringify((await stored())[0].settings) === JSON.stringify({ url: GOOD }), `${putBad.s}`)
  const putPrivate = await call(E, `${url}/${item.id}`, 'PUT', { settings: { url: 'https://10.0.0.1/' } })
  t('PUT with a private address is rejected (400)', putPrivate.s === 400)
  t('PUT by VIEWER 403, by another school 404', (await call(V, `${url}/${item.id}`, 'PUT', { settings: { url: GOOD } })).s === 403 && (await call(B, `${url}/${item.id}`, 'PUT', { settings: { url: GOOD } })).s === 404)
  const putOk = await call(A, `${url}/${item.id}`, 'PUT', { settings: { url: 'https://he.wikipedia.org/wiki/', note: 'x' } })
  t('PUT with a valid URL by SCHOOL_ADMIN: saved, only the url', putOk.s === 200 && JSON.stringify((await stored())[0].settings) === JSON.stringify({ url: 'https://he.wikipedia.org/wiki/' }), putOk.text)

  // Regression (reported 400): a public site that forbids embedding (its own CSP frame-ancestors)
  // is still a valid URL — saving must work; only the browser refuses to show it.
  const YNET = 'https://www.ynet.co.il/news/article/example'
  const putYnet = await call(E, `${url}/${item.id}`, 'PUT', { settings: { url: YNET } })
  t('PUT: a site that blocks embedding (ynet) is saved', putYnet.s === 200 && (await stored())[0].settings?.url === YNET, `${putYnet.s} ${putYnet.text}`)
  const postYnet = await post(E, YNET)
  t('POST: a site that blocks embedding (ynet) is saved', [200, 201].includes(postYnet.s) && (await stored())[0].settings?.url === YNET, `${postYnet.s} ${postYnet.text}`)
  // An out-of-range number (beyond INT4) used to reach the database and fail with a 500; it is now a
  // validation error (400). (The editor turns any non-Hebrew error into a Hebrew message: see
  // tests/saveErrors.test.ts, which also covers Prisma's "Invalid request" case.)
  const refused = await call(E, url, 'POST', { contentType: 'TEXT', textContent: 'x', fontSize: 2 ** 40 })
  t('POST with an out-of-range number → 400 (not 500)', refused.s === 400, `${refused.s} ${refused.text}`)
  t('…and the stored content is unchanged', (await stored())[0].contentType === 'IFRAME')
  const putRefused = await call(E, `${url}/${(await stored())[0].id}`, 'PUT', { fontSize: 2 ** 40 })
  t('PUT with an out-of-range number → 400 (not 500)', putRefused.s === 400, `${putRefused.s} ${putRefused.text}`)
  await call(A, `${url}/${(await stored())[0].id}`, 'PUT', { settings: { url: 'https://he.wikipedia.org/wiki/' } })

  // Public screen: receives the URL, nothing else of the region's private data
  const tv = await call(null, `/screen/${s.slug}`)
  t('public screen renders (200) and carries the URL', tv.s === 200 && tv.text.includes('he.wikipedia.org'))
  t('…and no admin data (no session, no ids of users)', !tv.text.includes('ss_token') && !tv.text.includes('passwordHash'))

  // Clickjacking protection: admin and sign-in pages refuse every frame (so a sandboxed "אתר חיצוני"
  // frame cannot be redirected to them either); public TV pages stay embeddable as before.
  const head = async (p, cookie) => (await fetch(BASE + p, { headers: cookie ? { Cookie: cookie } : {}, redirect: 'manual' })).headers
  const noFrame = h => (h.get('content-security-policy') ?? '').includes("frame-ancestors 'none'") && h.get('x-frame-options') === 'DENY'
  t('admin pages: frame-ancestors none + X-Frame-Options DENY', noFrame(await head('/admin/settings', E)) && noFrame(await head(`/admin/editor?screen=${s.id}`, A)) && noFrame(await head('/admin', A)))
  t('sign-in page: frame-ancestors none + X-Frame-Options DENY', noFrame(await head('/auth/login')))
  const tvHeaders = await head(`/screen/${s.slug}`)
  t('public TV page: still embeddable (no frame-ancestors, no X-Frame-Options)', !(tvHeaders.get('content-security-policy') ?? '').includes('frame-ancestors') && !tvHeaders.get('x-frame-options'))
  const fs = await import('node:fs'), pathMod = await import('node:path')
  const svgName = `qa-iframe-${Date.now()}.svg`, svgPath = pathMod.join(ROOT, 'public', 'uploads', svgName)
  fs.mkdirSync(pathMod.dirname(svgPath), { recursive: true })
  fs.writeFileSync(svgPath, '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
  try {
    const sh = await head(`/uploads/${svgName}`)
    t('uploaded SVG: attachment + nosniff + CSP sandbox (no script on our origin)', sh.get('content-disposition') === 'attachment' && sh.get('x-content-type-options') === 'nosniff' && /sandbox/.test(sh.get('content-security-policy') ?? '') && /default-src 'none'/.test(sh.get('content-security-policy') ?? ''))
  } finally { fs.rmSync(svgPath, { force: true }) }

  // Replacement and clearing
  const rep = await call(E, url, 'POST', { contentType: 'TEXT', textContent: 'שלום' })
  t('saving another type replaces the IFRAME content', [200, 201].includes(rep.s) && (await stored()).length === 1 && (await stored())[0].contentType === 'TEXT')
  const back = await post(E, GOOD)
  const id2 = (await stored())[0].id
  const del = await call(E, `${url}/${id2}`, 'DELETE')
  t('clearing the region removes it', [200, 201].includes(back.s) && del.s === 200 && (await stored()).length === 0)
} catch (e) {
  t('no unexpected error', false, e?.stack || String(e))
} finally {
  await db.screen.deleteMany({ where: { id: { in: created.screens } } })
  await db.user.deleteMany({ where: { id: { in: created.users } } })
  t('cleanup: no QA-IFRAME records left', (await db.screen.count({ where: { name: { startsWith: TAG } } })) + (await db.user.count({ where: { name: { startsWith: TAG } } })) === 0)
  await db.$disconnect()
  finish()
}
