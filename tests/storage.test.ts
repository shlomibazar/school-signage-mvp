import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { storeUpload } from '@/lib/storage'

// The Cloudinary branch is checked against a stubbed fetch: no network, no real Cloudinary.
const realFetch = globalThis.fetch
const env = { ...process.env }
afterEach(() => { globalThis.fetch = realFetch; process.env = { ...env } })

function captureCloudinary(secureUrl = 'https://res.cloudinary.com/demo/image/upload/v1/schoolscreen/x.png') {
  const calls: { url: string; form: FormData }[] = []
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, form: init.body as FormData })
    return new Response(JSON.stringify({ secure_url: secureUrl }), { status: 200 })
  }) as typeof fetch
  return calls
}

test('cloudinary: signed upload to the endpoint matching the type, file passed as is', async () => {
  Object.assign(process.env, { STORAGE_PROVIDER: 'cloudinary', CLOUDINARY_CLOUD_NAME: 'demo', CLOUDINARY_API_KEY: 'key', CLOUDINARY_API_SECRET: 'secret' })
  const calls = captureCloudinary()
  const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'logo.png', { type: 'image/png' })
  const url = await storeUpload(file, { folder: '', name: 'school-logo-1.png', mime: 'image/png' })
  assert.equal(url, 'https://res.cloudinary.com/demo/image/upload/v1/schoolscreen/x.png')
  assert.equal(calls[0].url, 'https://api.cloudinary.com/v1_1/demo/image/upload')
  const form = calls[0].form
  assert.equal(form.get('public_id'), 'schoolscreen/school-logo-1')
  assert.equal(form.get('api_key'), 'key')
  const expected = createHash('sha1').update(`public_id=schoolscreen/school-logo-1&timestamp=${form.get('timestamp')}secret`).digest('hex')
  assert.equal(form.get('signature'), expected)
  assert.equal(form.get('api_secret'), null) // the secret itself is never sent
  assert.equal((form.get('file') as File).size, 4)

  await storeUpload(new File(['x'], 'v.mp4'), { folder: '', name: 'v.mp4', mime: 'video/mp4' })
  assert.equal(calls[1].url, 'https://api.cloudinary.com/v1_1/demo/video/upload')
  await storeUpload(new File(['x'], 'a.pdf'), { folder: 'announcements', name: 'a.pdf', mime: 'application/pdf' })
  assert.equal(calls[2].url, 'https://api.cloudinary.com/v1_1/demo/raw/upload')
  assert.equal(calls[2].form.get('public_id'), 'schoolscreen/announcements/a')
})

test('cloudinary: failures throw (routes answer with a generic message)', async () => {
  Object.assign(process.env, { STORAGE_PROVIDER: 'cloudinary', CLOUDINARY_CLOUD_NAME: 'demo', CLOUDINARY_API_KEY: 'key', CLOUDINARY_API_SECRET: 'secret' })
  globalThis.fetch = (async () => new Response(JSON.stringify({ error: { message: 'Invalid signature' } }), { status: 401 })) as unknown as typeof fetch
  await assert.rejects(storeUpload(new File(['x'], 'a.png'), { folder: '', name: 'a.png', mime: 'image/png' }), /Cloudinary upload failed \(401\)/)
  delete process.env.CLOUDINARY_API_SECRET
  await assert.rejects(storeUpload(new File(['x'], 'a.png'), { folder: '', name: 'a.png', mime: 'image/png' }), /not configured/)
  process.env.STORAGE_PROVIDER = 's3'
  await assert.rejects(storeUpload(new File(['x'], 'a.png'), { folder: '', name: 'a.png', mime: 'image/png' }), /Unsupported STORAGE_PROVIDER/)
})

test('cloudinary: the upload request has a timeout signal', async () => {
  Object.assign(process.env, { STORAGE_PROVIDER: 'cloudinary', CLOUDINARY_CLOUD_NAME: 'demo', CLOUDINARY_API_KEY: 'key', CLOUDINARY_API_SECRET: 'secret' })
  let signal: AbortSignal | undefined
  globalThis.fetch = (async (_url: string, init: RequestInit) => { signal = init.signal ?? undefined; return new Response(JSON.stringify({ secure_url: 'https://res.cloudinary.com/demo/x' }), { status: 200 }) }) as typeof fetch
  await storeUpload(new File(['x'], 'a.png'), { folder: '', name: 'a.png', mime: 'image/png' })
  assert.ok(signal instanceof AbortSignal)
  assert.equal(signal!.aborted, false)
})
