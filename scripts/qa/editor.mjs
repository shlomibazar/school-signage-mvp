// Integration tests: the screen editor page and the content rules its dialogs rely on.
//
// LOCAL TEST ENVIRONMENT ONLY (see ./_local.mjs). Creates a temporary screen (two regions), a
// temporary announcement and two temporary users of school A (EDITOR, VIEWER; random passwords
// that are never printed), and removes all of them at the end.
//
//   QA_CREDS_FILE=/path/outside/repo/qa-users.json npm run test:qa:editor
import crypto from 'node:crypto'
import path from 'node:path'
import { createRequire } from 'node:module'
import { ROOT, creds, db, ids, login, call, reporter } from './_local.mjs'

const require = createRequire(path.join(ROOT, 'package.json'))
const bcrypt = require('bcryptjs')
const { t, finish } = reporter()
const TAG = 'QA-EDIT'
const created = { screens: [], users: [], announcements: [] }

const tempUser = async role => {
  const password = crypto.randomBytes(18).toString('base64url')
  const email = `qa-edit-${role.toLowerCase()}-${Date.now()}@qa.local`
  const u = await db.user.create({ data: { email, name: `${TAG} ${role}`, role, schoolId: ids.schoolA, passwordHash: await bcrypt.hash(password, 10) } })
  created.users.push(u.id)
  return login({ email, password })
}
const items = sectionId => db.contentItem.findMany({ where: { sectionId } })
const layoutBody = (l, mainSections, sections) => ({
  layout: { ...Object.fromEntries(Object.entries(l).filter(([k]) => !['id', 'screenId'].includes(k))), mainSections },
  sections,
})

try {
  const A = await login(creds.A), B = await login(creds.B)
  const E = await tempUser('EDITOR'), V = await tempUser('VIEWER')
  const s = await db.screen.create({
    data: { schoolId: ids.schoolA, name: `${TAG} Screen`, slug: `qa-edit-${Date.now()}`,
      layout: { create: { headerEnabled: true, footerEnabled: true, mainSections: 2 } },
      sections: { create: [{ position: 0, widthPct: 50 }, { position: 1, widthPct: 50 }] } },
    include: { sections: { orderBy: { position: 'asc' } }, layout: true },
  })
  created.screens.push(s.id)
  const [r1, r2] = s.sections
  const ann = await db.announcement.create({ data: { schoolId: ids.schoolA, title: `${TAG} announcement`, body: 'x', active: true, startAt: new Date(), endAt: new Date(Date.now() + 864e5) } })
  created.announcements.push(ann.id)

  // ── Editor page ────────────────────────────────────────────────────────────────────────────
  const page = await call(E, `/admin/editor?screen=${s.id}`)
  t('editor (EDITOR): four tabs, "תוכן" selected by default', page.s === 200 && ['תוכן', 'כותרת עליונה', 'כותרת תחתונה', 'עיצוב'].every(l => page.text.includes(l)) &&
    /id="editor-tab-content"[^>]*aria-selected="true"|aria-selected="true"[^>]*id="editor-tab-content"/.test(page.text), `${page.s}`)
  t('editor: layout save and region selector present', page.text.includes('שמירת פריסה') && page.text.includes('אזורי תוכן') && page.text.includes('בחירת אזור לעריכה'))
  t('editor: empty region offers the content types (טקסט back, events under "תוכן נוסף")', page.text.includes('גלריית תמונות') && page.text.includes('שינויי מערכת') && page.text.includes('טקסט') && page.text.includes('תוכן נוסף'))
  const pv = await call(V, `/admin/editor?screen=${s.id}`)
  t('editor (VIEWER): view-only notice, no editor', pv.s === 200 && pv.text.includes('להרשאת צפייה') && !pv.text.includes('שמירת פריסה'))
  t('editor: another school\'s screen is not shown', !(await call(B, `/admin/editor?screen=${s.id}`)).text.includes(`${TAG} Screen`))

  // ── Content rules behind the confirmation dialogs ──────────────────────────────────────────
  const base = `/api/screens/${s.id}/sections`
  const annBody = { contentType: 'ANNOUNCEMENT', settings: { selectedAnnouncementIds: [ann.id], items: [], showSectionTitle: true, sectionTitle: 'הודעות' } }
  const c1 = await call(E, `${base}/${r1.id}/content`, 'POST', annBody)
  t('EDITOR saves announcements in region 1', [200, 201].includes(c1.s) && (await items(r1.id)).length === 1, c1.text)
  const c2 = await call(E, `${base}/${r1.id}/content`, 'POST', { contentType: 'TEXT', textContent: 'שלום' })
  const after = await items(r1.id)
  t('saving another type REPLACES the stored content (why the editor asks first)', [200, 201].includes(c2.s) && after.length === 1 && after[0].contentType === 'TEXT', c2.text)
  t('…the announcement itself is not deleted', !!(await db.announcement.findUnique({ where: { id: ann.id } })))
  const itemId = after[0].id
  t('clearing a region: VIEWER 403', (await call(V, `${base}/${r1.id}/content/${itemId}`, 'DELETE')).s === 403)
  t('clearing a region: another school 404', (await call(B, `${base}/${r1.id}/content/${itemId}`, 'DELETE')).s === 404)
  t('…content still there after rejected requests', (await items(r1.id)).length === 1)
  const del = await call(E, `${base}/${r1.id}/content/${itemId}`, 'DELETE')
  t('clearing a region: EDITOR 200, region empty', del.s === 200 && (await items(r1.id)).length === 0, `${del.s}`)

  // ── Fewer regions hides, never deletes ─────────────────────────────────────────────────────
  await call(E, `${base}/${r2.id}/content`, 'POST', { contentType: 'TEXT', textContent: 'אזור 2' })
  const lay = await db.screenLayout.findUnique({ where: { screenId: s.id } })
  const hide = await call(E, `/api/screens/${s.id}/layout`, 'PUT', layoutBody(lay, 1, [{ position: 0, widthPct: 100 }, { position: 1, widthPct: 50 }]))
  t('layout with one region: saved', hide.s === 200, hide.text.slice(0, 200))
  t('…region 2 and its content are kept (hidden, not deleted)', (await db.screenSection.count({ where: { screenId: s.id } })) === 2 && (await items(r2.id)).length === 1)
  const show = await call(E, `/api/screens/${s.id}/layout`, 'PUT', layoutBody(lay, 2, [{ position: 0, widthPct: 50 }, { position: 1, widthPct: 50 }]))
  t('…and it is back with its content when two regions are shown again', show.s === 200 && (await items(r2.id))[0]?.textContent === 'אזור 2')
  t('layout save: VIEWER 403', (await call(V, `/api/screens/${s.id}/layout`, 'PUT', layoutBody(lay, 2, [{ position: 0, widthPct: 50 }, { position: 1, widthPct: 50 }]))).s === 403)
} catch (e) {
  t('no unexpected error', false, e?.stack || String(e))
} finally {
  await db.screen.deleteMany({ where: { id: { in: created.screens } } })
  await db.announcement.deleteMany({ where: { id: { in: created.announcements } } })
  await db.user.deleteMany({ where: { id: { in: created.users } } })
  t('cleanup: no QA-EDIT records left', (await db.screen.count({ where: { name: { startsWith: TAG } } })) + (await db.user.count({ where: { name: { startsWith: TAG } } })) +
    (await db.announcement.count({ where: { title: { startsWith: TAG } } })) === 0)
  await db.$disconnect()
  finish()
}
