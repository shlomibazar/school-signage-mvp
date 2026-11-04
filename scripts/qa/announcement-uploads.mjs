// Integration tests: attachments uploaded before a NEW announcement is saved
// (POST /api/announcement-uploads, POST /api/announcement-uploads/discard, and the
// "attachments" field of POST /api/announcements).
//
// LOCAL TEST ENVIRONMENT ONLY (see ./_local.mjs). Creates its own fixtures (tagged "QA-UPL")
// and removes them at the end.
//
//   QA_CREDS_FILE=/path/outside/repo/qa-users.json npm run test:qa:uploads
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, creds, db, ids, login, call, reporter } from './_local.mjs'

const { t, finish } = reporter()
const TAG = 'QA-UPL'
// Smallest valid PNG (1×1).
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n')
const upload = (cookie, bytes, name, type, extra = {}) => {
  const form = new FormData()
  form.append('file', new Blob([bytes], { type }), name)
  for (const [k, v] of Object.entries(extra)) form.append(k, v)
  return call(cookie, '/api/announcement-uploads', 'POST', form)
}
const fileOf = url => path.join(ROOT, 'public', url.replace(/^\//, ''))
const local = url => url.startsWith('/uploads/announcements/prepared/')
const start = new Date().toISOString(), openEnd = new Date('2099-12-31T23:59').toISOString()
const ann = (title, extra = {}) => ({ title: `${TAG} ${title}`, body: '', showTitle: true, priority: 'LOW', active: true, attachmentDisplayMode: 'slideshow', attachmentSlideSeconds: 8, startAt: start, endAt: openEnd, ...extra })
const tokens = []

try {
  const A = await login(creds.A), B = await login(creds.B)

  // ---- upload before the announcement exists
  const u1 = await upload(A, PNG, 'photo.png', 'image/png')
  t('upload image: 201 with token and url', u1.s === 201 && !!u1.j?.data?.token && !!u1.j?.data?.url, u1.text)
  tokens.push(u1.j?.data?.token)
  t('upload image: stored in the prepared folder', local(u1.j.data.url) && fs.existsSync(fileOf(u1.j.data.url)), u1.j.data.url)
  t('upload image: kind IMAGE', u1.j.data.kind === 'IMAGE')
  t('upload image: no database record yet', (await db.announcementAttachment.count({ where: { url: u1.j.data.url } })) === 0)
  const p1 = await upload(A, PNG, 'doc - עמוד 1.png', 'image/png', { pdfPage: '1', originalName: 'doc - עמוד 1.png' })
  const p2 = await upload(A, PNG, 'doc - עמוד 2.png', 'image/png', { pdfPage: '1', originalName: 'doc - עמוד 2.png' })
  tokens.push(p1.j?.data?.token, p2.j?.data?.token)
  t('upload PDF page: kind PDF_PAGE', p1.s === 201 && p1.j.data.kind === 'PDF_PAGE' && p2.j.data.kind === 'PDF_PAGE')

  // ---- validation and access
  t('raw PDF rejected (pages are converted in the browser)', (await upload(A, PDF, 'doc.pdf', 'application/pdf')).s === 400)
  t('non-image rejected', (await upload(A, Buffer.from('hello'), 'x.png', 'image/png')).s === 400)
  t('mismatched extension rejected', (await upload(A, PNG, 'x.gif', 'image/gif')).s === 400)
  t('empty file rejected', (await upload(A, Buffer.alloc(0), 'x.png', 'image/png')).s === 400)
  t('anonymous upload rejected (401)', (await upload(null, PNG, 'x.png', 'image/png')).s === 401)

  // ---- save: attachments created with the announcement, in order
  const media = await db.mediaFile.findFirst({ where: { schoolId: ids.schoolA, mediaType: 'IMAGE', mimeType: { startsWith: 'image/' } } })
  const items = [{ token: p1.j.data.token }, { token: p2.j.data.token }, { token: u1.j.data.token }, ...(media ? [{ mediaId: media.id }] : [])]
  const c = await call(A, '/api/announcements', 'POST', ann('Saved', { attachments: items }))
  const annId = c.j?.data?.id
  t('save with prepared attachments: 201 (no text needed)', c.s === 201, c.text)
  const rows = await db.announcementAttachment.findMany({ where: { announcementId: annId }, orderBy: { sortOrder: 'asc' } })
  t('save: one attachment per page/image, in order', rows.length === items.length && rows[0].url === p1.j.data.url && rows[1].url === p2.j.data.url && rows[2].url === u1.j.data.url, JSON.stringify(rows.map(r => r.url)))
  t('save: kinds kept (PDF_PAGE, PDF_PAGE, IMAGE)', rows[0].kind === 'PDF_PAGE' && rows[1].kind === 'PDF_PAGE' && rows[2].kind === 'IMAGE')
  t('save: names kept', rows[0].originalName === 'doc - עמוד 1.png')
  if (media) t('save: gallery image attached by reference', rows[3].url === media.url)
  t('saved attachment listed by the existing API', (await call(A, `/api/announcements/${annId}/attachments`)).j?.data?.length === items.length)

  // ---- TV: the public endpoint serves the attachments of an assigned announcement
  const region = (await call(A, '/api/announcement-regions')).j.data.flatMap(s => s.regions)[0]
  if (region) {
    const tvUpload = await upload(A, PNG, 'tv.png', 'image/png', { pdfPage: '1' })
    const assigned = await call(A, '/api/announcements', 'POST', ann('On TV', { attachments: [{ token: tvUpload.j.data.token }], regionIds: [region.id] }))
    const tv = await call(null, `/api/public/announcements/${region.id}`)
    const shown = tv.j?.data?.find(a => a.id === assigned.j?.data?.id)
    t('TV endpoint shows the prepared PDF page', shown?.attachments?.length === 1 && shown.attachments[0].kind === 'PDF_PAGE', JSON.stringify(shown))
    await call(A, `/api/announcements/${assigned.j.data.id}`, 'DELETE')
    // Deleting an announcement never deletes files; this run's file is discarded in the cleanup.
    tokens.push(tvUpload.j.data.token)
  }

  // ---- discard: unsaved files deleted, saved ones never
  t('discard of saved uploads: files kept', (await call(A, '/api/announcement-uploads/discard', 'POST', { tokens: [u1.j.data.token, p1.j.data.token] })).j?.data?.deleted === 0 && fs.existsSync(fileOf(u1.j.data.url)))
  const d1 = await upload(A, PNG, 'unsaved.png', 'image/png'); tokens.push(d1.j.data.token)
  t('discard by another school: not deleted', (await call(B, '/api/announcement-uploads/discard', 'POST', { tokens: [d1.j.data.token] })).j?.data?.deleted === 0 && fs.existsSync(fileOf(d1.j.data.url)))
  const dd = await call(A, '/api/announcement-uploads/discard', 'POST', { tokens: [d1.j.data.token] })
  t('discard of an unsaved upload: file deleted', dd.j?.data?.deleted === 1 && !fs.existsSync(fileOf(d1.j.data.url)), dd.text)
  t('discard again: nothing to do, no error', (await call(A, '/api/announcement-uploads/discard', 'POST', { tokens: [d1.j.data.token] })).s === 200)
  t('discard with junk tokens: 200, nothing deleted', (await call(A, '/api/announcement-uploads/discard', 'POST', { tokens: ['x', 5, null] })).j?.data?.deleted === 0)

  // ---- tokens cannot be forged or used by another school
  const u2 = await upload(A, PNG, 'cross.png', 'image/png'); tokens.push(u2.j.data.token)
  const cross = await call(B, '/api/announcements', 'POST', ann('Cross', { attachments: [{ token: u2.j.data.token }] }))
  t('school B cannot attach school A upload (400)', cross.s === 400 && !(await db.announcement.findFirst({ where: { title: `${TAG} Cross` } })))
  const forged = u2.j.data.token.slice(0, -4) + (u2.j.data.token.endsWith('AAAA') ? 'BBBB' : 'AAAA')
  t('tampered token rejected (400)', (await call(A, '/api/announcements', 'POST', ann('Forged', { attachments: [{ token: forged }] }))).s === 400)
  const session = A.split('=')[1]
  t('a session token is not an upload token (400)', (await call(A, '/api/announcements', 'POST', ann('Session', { attachments: [{ token: session }] }))).s === 400)
  const bMedia = await db.mediaFile.findFirst({ where: { schoolId: ids.schoolB, mediaType: 'IMAGE' } })
  if (bMedia) t('another school gallery image rejected (400)', (await call(A, '/api/announcements', 'POST', ann('BMedia', { attachments: [{ mediaId: bMedia.id }] }))).s === 400)
  t('more than 30 attachments rejected (400)', (await call(A, '/api/announcements', 'POST', ann('Many', { attachments: Array.from({ length: 31 }, () => ({ token: u2.j.data.token })) }))).s === 400)
  t('nothing created by rejected saves', (await db.announcement.count({ where: { title: { in: ['Cross', 'Forged', 'Session', 'BMedia', 'Many'].map(x => `${TAG} ${x}`) } } })) === 0)

  // ---- compatibility
  t('save without attachments and without text rejected (400)', (await call(A, '/api/announcements', 'POST', ann('Empty'))).s === 400)
  const plain = await call(A, '/api/announcements', 'POST', ann('Text', { body: '<p>טקסט</p>' }))
  t('text-only announcement still saves', plain.s === 201)
  const direct = new FormData(); direct.append('file', new Blob([PNG], { type: 'image/png' }), 'direct.png')
  const da = await call(A, `/api/announcements/${plain.j.data.id}/attachments`, 'POST', direct)
  t('existing announcement: direct upload still works', da.s === 201 && da.j?.data?.kind === 'IMAGE')
} catch (e) {
  t('no unexpected error', false, e?.stack || String(e))
} finally {
  // Remove fixture announcements (attachments cascade) and any prepared file of this run.
  for (const a of await db.announcement.findMany({ where: { title: { startsWith: TAG } }, select: { id: true, attachments: { select: { url: true } } } })) {
    for (const x of a.attachments) if (local(x.url)) fs.rmSync(fileOf(x.url), { force: true })
    for (const x of a.attachments) if (x.url.startsWith('/uploads/announcements/') && !local(x.url)) fs.rmSync(fileOf(x.url), { force: true })
  }
  await db.announcement.deleteMany({ where: { title: { startsWith: TAG } } })
  const A2 = await login(creds.A).catch(() => null)
  if (A2) await call(A2, '/api/announcement-uploads/discard', 'POST', { tokens: tokens.filter(Boolean) })
  t('cleanup: no QA-UPL announcements left', (await db.announcement.count({ where: { title: { startsWith: TAG } } })) === 0)
  await db.$disconnect()
  finish()
}
