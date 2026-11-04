import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { storeUpload, deletePreparedUpload } from '@/lib/storage'
import { PREPARED_FOLDER, PREPARED_TTL_HOURS } from '@/lib/preparedUploads'
import { thumbnailImageUrl } from '@/lib/imageDelivery'
import { sweep, isCloudinaryCandidate, isLocalCandidate, uuidOf, TOKEN_TTL_HOURS, MIN_AGE_MS, CLOUDINARY_PREFIX } from '../scripts/lib/preparedSweep.mjs'

// Production-compatibility checks of prepared uploads against a stubbed fetch (no network, no
// real Cloudinary): public ids, endpoints, signatures, delivery URLs, and the sweep's rules.
const realFetch = globalThis.fetch
const env = { ...process.env }
afterEach(() => { globalThis.fetch = realFetch; process.env = { ...env } })
const cloudinary = () => Object.assign(process.env, { STORAGE_PROVIDER: 'cloudinary', CLOUDINARY_CLOUD_NAME: 'demo', CLOUDINARY_API_KEY: 'key', CLOUDINARY_API_SECRET: 'secret' })
const UUID = '0b6f2a8e-1c2d-4e5f-8a9b-0c1d2e3f4a5b'

test('cloudinary: prepared upload goes to image/upload with public id schoolscreen/announcements/prepared/<uuid>', async () => {
  cloudinary()
  const calls: { url: string; form: FormData }[] = []
  globalThis.fetch = (async (url: string, init: RequestInit) => { calls.push({ url, form: init.body as FormData }); return new Response(JSON.stringify({ secure_url: `https://res.cloudinary.com/demo/image/upload/v17/schoolscreen/announcements/prepared/${UUID}.png` }), { status: 200 }) }) as typeof fetch
  const url = await storeUpload(new File([new Uint8Array([1, 2, 3])], `${UUID}.png`), { folder: PREPARED_FOLDER, name: `${UUID}.png`, mime: 'image/png' })
  assert.equal(calls[0].url, 'https://api.cloudinary.com/v1_1/demo/image/upload')
  assert.equal(calls[0].form.get('public_id'), `schoolscreen/announcements/prepared/${UUID}`)
  assert.equal(isCloudinaryCandidate(calls[0].form.get('public_id')), true)
  // The TV and admin previews get resized delivery URLs for it, like every other Cloudinary image.
  assert.match(thumbnailImageUrl(url), /^https:\/\/res\.cloudinary\.com\/demo\/image\/upload\/c_limit,[^/]+\/v17\/schoolscreen\/announcements\/prepared\//)
})

test('cloudinary: delete is a signed image/destroy of exactly the prepared public id', async () => {
  cloudinary()
  const calls: { url: string; form: FormData }[] = []
  globalThis.fetch = (async (url: string, init: RequestInit) => { calls.push({ url, form: init.body as FormData }); return new Response(JSON.stringify({ result: 'ok' }), { status: 200 }) }) as typeof fetch
  await deletePreparedUpload(`${UUID}.png`)
  assert.equal(calls[0].url, 'https://api.cloudinary.com/v1_1/demo/image/destroy')
  const form = calls[0].form
  assert.equal(form.get('public_id'), `schoolscreen/announcements/prepared/${UUID}`)
  assert.equal(form.get('signature'), createHash('sha1').update(`public_id=schoolscreen/announcements/prepared/${UUID}&timestamp=${form.get('timestamp')}secret`).digest('hex'))
  assert.equal(form.get('api_secret'), null)
})

test('cloudinary: delete treats "not found" as done and other results as errors', async () => {
  cloudinary()
  globalThis.fetch = (async () => new Response(JSON.stringify({ result: 'not found' }), { status: 200 })) as typeof fetch
  await deletePreparedUpload(`${UUID}.png`)
  globalThis.fetch = (async () => new Response(JSON.stringify({ error: { message: 'Invalid Signature' } }), { status: 401 })) as typeof fetch
  await assert.rejects(deletePreparedUpload(`${UUID}.png`))
})

test('delete refuses anything but a server-chosen prepared name (no network call)', async () => {
  cloudinary()
  let called = false
  globalThis.fetch = (async () => { called = true; return new Response('{}') }) as typeof fetch
  for (const bad of ['../logo.png', 'logo.png', `${UUID}.pdf`, `x/${UUID}.png`, '']) await assert.rejects(deletePreparedUpload(bad))
  assert.equal(called, false)
})

test('sweep: retention equals the token lifetime plus grace', () => {
  assert.equal(TOKEN_TTL_HOURS, PREPARED_TTL_HOURS)
  assert.ok(MIN_AGE_MS > PREPARED_TTL_HOURS * 3600_000)
})

test('sweep: only uuid files directly in the prepared folder are candidates', () => {
  assert.equal(CLOUDINARY_PREFIX, 'schoolscreen/announcements/prepared/')
  assert.equal(isCloudinaryCandidate(`schoolscreen/announcements/prepared/${UUID}`), true)
  for (const id of [`schoolscreen/${UUID}`, `schoolscreen/announcements/${UUID}`, 'schoolscreen/school-logo-1', `schoolscreen/announcements/prepared/sub/${UUID}`, `schoolscreen/announcements/prepared/${UUID}x`, 'schoolscreen/announcements/prepared/']) assert.equal(isCloudinaryCandidate(id), false, id)
  assert.equal(isLocalCandidate(`${UUID}.png`), true)
  for (const n of ['logo.png', `${UUID}.pdf`, `../${UUID}.png`]) assert.equal(isLocalCandidate(n), false, n)
  assert.equal(uuidOf(`schoolscreen/announcements/prepared/${UUID}`), UUID)
})

test('sweep: keeps recent and referenced files, deletes only old unreferenced ones, survives failures', async () => {
  const now = Date.now()
  const removed: string[] = []
  const file = (n: string, ageH: number, fail = false) => ({ id: `schoolscreen/announcements/prepared/${n}`, created: now - ageH * 3600_000, remove: async () => { if (fail) throw new Error('boom'); removed.push(n) } })
  const a = UUID, b = UUID.replace('0b6f', '1b6f'), c = UUID.replace('0b6f', '2b6f'), d = UUID.replace('0b6f', '3b6f'), e = UUID.replace('0b6f', '4b6f')
  const files = [file(a, 1), file(b, 25), file(c, 30), file(d, 30, true), file(e, 40)]
  const referenced = new Set([e])
  const dry = await sweep({ files, isReferenced: async (u: string) => referenced.has(u), now })
  assert.deepEqual({ recent: dry.recent, referenced: dry.referenced, toDelete: dry.toDelete, deleted: dry.deleted }, { recent: 2, referenced: 1, toDelete: 2, deleted: 0 })
  assert.deepEqual(removed, []) // dry run deletes nothing
  const run = await sweep({ files, isReferenced: async (u: string) => referenced.has(u), now, apply: true })
  assert.deepEqual(removed, [c]) // 1h and 25h are too recent (24h + 2h grace), e is saved
  assert.equal(run.failed, 1)
  assert.equal(run.deleted, 1)
})
