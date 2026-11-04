import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { storeScreenSnapshot, deleteScreenSnapshot } from '@/lib/storage'
import { snapshotSize, SNAPSHOT_MAX_BYTES } from '@/lib/screenSnapshotCapture'

// Screen snapshots against a stubbed fetch: no network, no real Cloudinary.
const realFetch = globalThis.fetch
const env = { ...process.env }
afterEach(() => { globalThis.fetch = realFetch; process.env = { ...env } })
const cloudinary = () => Object.assign(process.env, { STORAGE_PROVIDER: 'cloudinary', CLOUDINARY_CLOUD_NAME: 'demo', CLOUDINARY_API_KEY: 'key', CLOUDINARY_API_SECRET: 'secret' })
const ID = 'cmojs2rrb0004z3wz0nk12vyc'
const jpeg = () => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'snapshot.jpg', { type: 'image/jpeg' })

test('snapshot size: long side 1280, aspect ratio kept', () => {
  assert.deepEqual(snapshotSize(1920, 1080), { width: 1280, height: 720, scale: 1280 / 1920 })
  const p = snapshotSize(1080, 1920)
  assert.equal(p.width, 720); assert.equal(p.height, 1280)
  assert.ok(SNAPSHOT_MAX_BYTES < 500 * 1024) // the client stays under the server limit
})

test('cloudinary: one fixed public id per screen (replaced on every capture), versioned URL returned', async () => {
  cloudinary()
  const calls: { url: string; form: FormData }[] = []
  globalThis.fetch = (async (url: string, init: RequestInit) => { calls.push({ url, form: init.body as FormData }); return new Response(JSON.stringify({ secure_url: `https://res.cloudinary.com/demo/image/upload/v${calls.length}/schoolscreen/snapshots/${ID}.jpg` }), { status: 200 }) }) as typeof fetch
  const a = await storeScreenSnapshot(jpeg(), ID)
  const b = await storeScreenSnapshot(jpeg(), ID)
  assert.equal(calls[0].url, 'https://api.cloudinary.com/v1_1/demo/image/upload')
  assert.equal(calls[0].form.get('public_id'), `schoolscreen/snapshots/${ID}`)
  assert.equal(calls[1].form.get('public_id'), `schoolscreen/snapshots/${ID}`)
  assert.notEqual(a, b) // a new version → a new URL, so no cache shows the old image
})

test('local: fixed file per screen, URL changes per capture', async () => {
  Object.assign(process.env, { STORAGE_PROVIDER: 'local' })
  const fs = await import('node:fs'), path = await import('node:path')
  const id = 'cqatestsnapshot0000000001'
  const a = await storeScreenSnapshot(jpeg(), id)
  await new Promise(r => setTimeout(r, 5))
  const b = await storeScreenSnapshot(jpeg(), id)
  assert.match(a, new RegExp(`^/uploads/snapshots/${id}\\.jpg\\?v=\\d+$`))
  assert.notEqual(a, b)
  const file = path.join(process.cwd(), 'public', 'uploads', 'snapshots', `${id}.jpg`)
  assert.ok(fs.existsSync(file))
  await deleteScreenSnapshot(id)
  assert.equal(fs.existsSync(file), false)
  await deleteScreenSnapshot(id) // already gone: no error
})

test('cloudinary delete: signed destroy of the screen snapshot with CDN invalidation', async () => {
  cloudinary()
  const calls: { url: string; form: FormData }[] = []
  globalThis.fetch = (async (url: string, init: RequestInit) => { calls.push({ url, form: init.body as FormData }); return new Response(JSON.stringify({ result: 'ok' }), { status: 200 }) }) as typeof fetch
  await deleteScreenSnapshot(ID)
  const f = calls[0].form
  assert.equal(calls[0].url, 'https://api.cloudinary.com/v1_1/demo/image/destroy')
  assert.equal(f.get('public_id'), `schoolscreen/snapshots/${ID}`)
  assert.equal(f.get('invalidate'), 'true')
  assert.equal(f.get('signature'), createHash('sha1').update(`invalidate=true&public_id=schoolscreen/snapshots/${ID}&timestamp=${f.get('timestamp')}secret`).digest('hex'))
})

test('snapshot storage refuses ids that are not screen ids (no network call)', async () => {
  cloudinary()
  let called = false
  globalThis.fetch = (async () => { called = true; return new Response('{}') }) as typeof fetch
  for (const bad of ['../x', 'a/b', '', 'SHORT', `${ID}.jpg`]) {
    await assert.rejects(storeScreenSnapshot(jpeg(), bad))
    await assert.rejects(deleteScreenSnapshot(bad))
  }
  assert.equal(called, false)
})
