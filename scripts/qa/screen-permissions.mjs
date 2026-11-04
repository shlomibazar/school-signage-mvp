// Integration tests: who may delete (and disable) a screen.
//
// LOCAL TEST ENVIRONMENT ONLY (see ./_local.mjs). Creates temporary screens and two temporary
// users of school A (EDITOR, VIEWER, random passwords that are never printed), and removes all
// of them at the end.
//
//   QA_CREDS_FILE=/path/outside/repo/qa-users.json npm run test:qa:permissions
import crypto from 'node:crypto'
import path from 'node:path'
import { createRequire } from 'node:module'
import { ROOT, creds, db, ids, login, call, reporter } from './_local.mjs'

const require = createRequire(path.join(ROOT, 'package.json'))
const bcrypt = require('bcryptjs')
const { t, finish } = reporter()
const TAG = 'QA-PERM'
const created = { screens: [], users: [] }
const screen = async name => {
  const s = await db.screen.create({ data: { schoolId: ids.schoolA, name: `${TAG} ${name}`, slug: `qa-perm-${name.toLowerCase()}-${Date.now()}`, layout: { create: { headerEnabled: true, footerEnabled: true, mainSections: 1 } }, sections: { create: [{ position: 0, widthPct: 100 }] } } })
  created.screens.push(s.id); return s
}
const tempUser = async role => {
  const password = crypto.randomBytes(18).toString('base64url')
  const email = `qa-perm-${role.toLowerCase()}-${Date.now()}@qa.local`
  const u = await db.user.create({ data: { email, name: `${TAG} ${role}`, role, schoolId: ids.schoolA, passwordHash: await bcrypt.hash(password, 10) } })
  created.users.push(u.id)
  return login({ email, password })
}
const exists = async id => !!(await db.screen.findUnique({ where: { id } }))

try {
  const A = await login(creds.A), B = await login(creds.B)
  const E = await tempUser('EDITOR'), V = await tempUser('VIEWER')
  const s1 = await screen('One'), s2 = await screen('Two')

  t('anonymous cannot delete a screen (401)', (await call(null, `/api/screens/${s1.id}`, 'DELETE')).s === 401)
  const ve = await call(V, `/api/screens/${s1.id}`, 'DELETE')
  t('VIEWER cannot delete a screen (403)', ve.s === 403, `${ve.s}`)
  const ed = await call(E, `/api/screens/${s1.id}`, 'DELETE')
  t('EDITOR cannot delete a screen (403)', ed.s === 403, `${ed.s}`)
  t('…and the screen still exists', await exists(s1.id))
  t('another school\'s admin cannot delete it (404)', (await call(B, `/api/screens/${s1.id}`, 'DELETE')).s === 404 && await exists(s1.id))
  t('EDITOR cannot disable a screen (403, unchanged)', (await call(E, `/api/screens/${s1.id}/active`, 'PATCH', { active: false })).s === 403)
  t('EDITOR still edits content: short link (unchanged)', [200, 201].includes((await call(E, `/api/screens/${s2.id}/short-link`, 'POST')).s))

  // Screens page: the delete button only for SCHOOL_ADMIN and up.
  const pageE = await call(E, '/admin/screens'), pageA = await call(A, '/admin/screens')
  t('screens page: no delete button for EDITOR', pageE.s === 200 && !pageE.text.includes(`מחיקת המסך ${TAG} One`))
  t('screens page: delete button for SCHOOL_ADMIN', pageA.text.includes(`מחיקת המסך ${TAG} One`))
  t('screens page: no disable button for EDITOR', !pageE.text.includes('השבתת מסך'))

  const ad = await call(A, `/api/screens/${s1.id}`, 'DELETE')
  t('SCHOOL_ADMIN deletes a screen of its school (200)', ad.s === 200 && !(await exists(s1.id)), `${ad.s}`)
  t('deleting again: 404', (await call(A, `/api/screens/${s1.id}`, 'DELETE')).s === 404)
  created.screens = created.screens.filter(id => id !== s1.id)
  t('other screens untouched', await exists(s2.id))
} catch (e) {
  t('no unexpected error', false, e?.stack || String(e))
} finally {
  await db.screen.deleteMany({ where: { id: { in: created.screens } } })
  await db.user.deleteMany({ where: { id: { in: created.users } } })
  t('cleanup: no QA-PERM screens or users left', (await db.screen.count({ where: { name: { startsWith: TAG } } })) + (await db.user.count({ where: { name: { startsWith: TAG } } })) === 0)
  await db.$disconnect()
  finish()
}
