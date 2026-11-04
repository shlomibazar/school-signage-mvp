// Integration tests: screen snapshots (POST /api/screens/[id]/snapshot).
//
// LOCAL TEST ENVIRONMENT ONLY (see ./_local.mjs). Uses its own temporary screen (tagged
// "QA-SNAP") and removes it at the end; other screens are only read.
//
//   QA_CREDS_FILE=/path/outside/repo/qa-users.json npm run test:qa:snapshots
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, creds, db, ids, login, call, reporter } from './_local.mjs'

const { t, finish } = reporter()
const TAG = 'QA-SNAP'
// A JPEG header followed by marker bytes (the server sniffs the type; it does not decode).
const jpeg = (marker, size = 2048) => { const b = Buffer.alloc(size, marker); Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]).copy(b); return b }
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const send = (cookie, screenId, bytes, name = 'snapshot.jpg', type = 'image/jpeg') => {
  const form = new FormData(); form.append('file', new Blob([bytes], { type }), name)
  return call(cookie, `/api/screens/${screenId}/snapshot`, 'POST', form)
}
const fileOf = url => path.join(ROOT, 'public', url.replace(/^\//, '').replace(/\?.*$/, ''))
let screenId = null

try {
  const s = await db.screen.create({ data: { schoolId: ids.schoolA, name: `${TAG} Screen`, slug: `qa-snap-${Date.now()}`, layout: { create: { headerEnabled: true, footerEnabled: true, mainSections: 2, bgColor: 'theme:aurora' } }, sections: { create: [{ position: 0, widthPct: 50 }, { position: 1, widthPct: 50 }] } } })
  screenId = s.id
  const layoutBefore = JSON.stringify(await db.screen.findUnique({ where: { id: screenId }, include: { layout: true, sections: { orderBy: { position: 'asc' } } } }), (k, v) => k === 'updatedAt' ? undefined : v)
  const othersBefore = await db.screen.findMany({ where: { id: { not: screenId } }, select: { id: true, snapshotUrl: true, snapshotAt: true } })
  const A = await login(creds.A), B = await login(creds.B)

  t('anonymous: 401', (await send(null, screenId, jpeg(1))).s === 401)
  t('another school: 404, nothing stored', (await send(B, screenId, jpeg(1))).s === 404 && !(await db.screen.findUnique({ where: { id: screenId } })).snapshotUrl)
  t('unknown screen: 404', (await send(A, 'cnotarealscreen00000000000', jpeg(1))).s === 404)

  const r1 = await send(A, screenId, jpeg(1))
  const row1 = await db.screen.findUnique({ where: { id: screenId } })
  t('upload: 200 with url and time', r1.s === 200 && !!r1.j?.data?.snapshotUrl && !!r1.j?.data?.snapshotAt, r1.text)
  t('upload: snapshotUrl and snapshotAt saved', row1.snapshotUrl === r1.j.data.snapshotUrl && !!row1.snapshotAt)
  t('upload: stored as the screen\'s fixed file', /\/uploads\/snapshots\/[a-z0-9]+\.jpg\?v=\d+$/.test(row1.snapshotUrl) && fs.existsSync(fileOf(row1.snapshotUrl)))
  await new Promise(r => setTimeout(r, 20))
  const r2 = await send(A, screenId, jpeg(2))
  const row2 = await db.screen.findUnique({ where: { id: screenId } })
  t('refresh: new URL (cache-safe) and newer time', row2.snapshotUrl !== row1.snapshotUrl && row2.snapshotAt > row1.snapshotAt)
  t('refresh: replaced in place (one file per screen)', fs.readdirSync(path.join(ROOT, 'public', 'uploads', 'snapshots')).filter(n => n.startsWith(screenId)).length === 1 && fs.readFileSync(fileOf(row2.snapshotUrl))[20] === 2)

  // ---- validation: nothing changes on a rejected upload
  const big = await send(A, screenId, jpeg(3, 501 * 1024))
  t('over 500 KB: 413', big.s === 413, `${big.s}`)
  t('PNG: 400 (JPEG only)', (await send(A, screenId, PNG, 'x.png', 'image/png')).s === 400)
  t('not an image: 400', (await send(A, screenId, Buffer.from('hello world'), 'x.jpg')).s === 400)
  t('empty: 400', (await send(A, screenId, Buffer.alloc(0))).s === 400)
  t('missing file: 400', (await call(A, `/api/screens/${screenId}/snapshot`, 'POST', new FormData())).s === 400)
  const row3 = await db.screen.findUnique({ where: { id: screenId } })
  t('rejected uploads: snapshot unchanged', row3.snapshotUrl === row2.snapshotUrl && fs.readFileSync(fileOf(row3.snapshotUrl))[20] === 2)

  // ---- concurrency: the stored image always belongs to the saved reference
  const par = await Promise.all([11, 12, 13, 14].map(m => send(A, screenId, jpeg(m)).then(r => ({ m, r }))))
  const row4 = await db.screen.findUnique({ where: { id: screenId } })
  const latest = par.filter(p => p.r.s === 200).sort((a, b) => new Date(b.r.j.data.snapshotAt) - new Date(a.r.j.data.snapshotAt))[0]
  t('parallel uploads: all succeed', par.every(p => p.r.s === 200), par.map(p => p.r.s).join(','))
  t('parallel uploads: database holds the latest one', row4.snapshotUrl === latest.r.j.data.snapshotUrl)
  t('parallel uploads: stored image is that same latest capture', fs.readFileSync(fileOf(row4.snapshotUrl))[20] === latest.m, `file=${fs.readFileSync(fileOf(row4.snapshotUrl))[20]} latest=${latest.m}`)

  // ---- nothing else changed
  const layoutAfter = JSON.stringify(await db.screen.findUnique({ where: { id: screenId }, include: { layout: true, sections: { orderBy: { position: 'asc' } } } }), (k, v) => k === 'updatedAt' || k === 'snapshotUrl' || k === 'snapshotAt' ? undefined : v)
  t('layout, sections and theme unchanged', layoutAfter === layoutBefore.replace(/,"snapshotUrl":null,"snapshotAt":null/, ''), 'diff')
  const othersAfter = await db.screen.findMany({ where: { id: { not: screenId } }, select: { id: true, snapshotUrl: true, snapshotAt: true } })
  t('other screens untouched', JSON.stringify(othersAfter) === JSON.stringify(othersBefore))

  // ---- screens list shows it; another school does not
  const pageA = await call(A, '/admin/screens')
  t('screens list (school A) shows the snapshot', pageA.s === 200 && pageA.text.includes(`snapshots/${screenId}.jpg`))
  const pageB = await call(B, '/admin/screens')
  t('screens list (school B) does not', !pageB.text.includes(screenId))

  // ---- deleting the screen removes its snapshot file
  const file = fileOf(row4.snapshotUrl)
  t('delete screen: 200', (await call(A, `/api/screens/${screenId}`, 'DELETE')).s === 200)
  t('delete screen: snapshot file removed', !fs.existsSync(file))
  screenId = null
} catch (e) {
  t('no unexpected error', false, e?.stack || String(e))
} finally {
  if (screenId) {
    const row = await db.screen.findUnique({ where: { id: screenId } })
    if (row?.snapshotUrl) fs.rmSync(fileOf(row.snapshotUrl), { force: true })
    await db.screen.deleteMany({ where: { id: screenId } })
  }
  t('cleanup: no QA-SNAP screens left', (await db.screen.count({ where: { name: { startsWith: TAG } } })) === 0)
  await db.$disconnect()
  finish()
}
