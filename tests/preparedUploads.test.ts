import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'crypto'
import { SignJWT } from 'jose'
import { signPreparedUpload, verifyPreparedUpload, isPreparedFileName } from '@/lib/preparedUploads'

// The signing key is read when a token is signed or verified, so setting it here is enough.
process.env.JWT_SECRET = 'unit-test-secret-0123456789-abcdefghijklmnopqrstuvwxyz'

const upload = { schoolId: 'school-a', url: '/uploads/announcements/prepared/0b6f2a8e-1c2d-4e5f-8a9b-0c1d2e3f4a5b.png', name: 'page 1.png', mime: 'image/png', kind: 'PDF_PAGE' as const, file: '0b6f2a8e-1c2d-4e5f-8a9b-0c1d2e3f4a5b.png' }

test('prepared upload token: round trip for the same school', async () => {
  const token = await signPreparedUpload(upload)
  assert.deepEqual(await verifyPreparedUpload(token, 'school-a'), upload)
})
test('prepared upload token: another school is rejected', async () => {
  assert.equal(await verifyPreparedUpload(await signPreparedUpload(upload), 'school-b'), null)
})
test('prepared upload token: tampering and junk are rejected', async () => {
  const token = await signPreparedUpload(upload)
  const [h, p, s] = token.split('.')
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString())
  const forged = `${h}.${Buffer.from(JSON.stringify({ ...payload, url: 'https://evil.example/x.png' })).toString('base64url')}.${s}`
  assert.equal(await verifyPreparedUpload(forged, 'school-a'), null)
  for (const junk of ['', 'abc', 5, null, undefined, 'a'.repeat(5000)]) assert.equal(await verifyPreparedUpload(junk, 'school-a'), null)
})
test('prepared upload token: a token signed with the session key is rejected', async () => {
  const sessionKey = new TextEncoder().encode(process.env.JWT_SECRET)
  const token = await new SignJWT({ sid: 'school-a', url: upload.url, file: upload.file, kind: 'IMAGE' }).setProtectedHeader({ alg: 'HS256' }).setAudience('announcement-prepared-upload').setExpirationTime('1h').sign(sessionKey)
  assert.equal(await verifyPreparedUpload(token, 'school-a'), null)
})
test('prepared upload token: expired tokens are rejected', async () => {
  const key = createHash('sha256').update(`${process.env.JWT_SECRET}:announcement-prepared-upload`).digest()
  const token = await new SignJWT({ sid: 'school-a', url: upload.url, file: upload.file, kind: 'IMAGE' }).setProtectedHeader({ alg: 'HS256' }).setAudience('announcement-prepared-upload').setExpirationTime(Math.floor(Date.now() / 1000) - 60).sign(key)
  assert.equal(await verifyPreparedUpload(token, 'school-a'), null)
})
test('prepared file names: server-chosen uuid names only', () => {
  assert.equal(isPreparedFileName(upload.file), true)
  for (const bad of ['../x.png', 'a.png', '0b6f2a8e-1c2d-4e5f-8a9b-0c1d2e3f4a5b.pdf', '0b6f2a8e-1c2d-4e5f-8a9b-0c1d2e3f4a5b.png/..']) assert.equal(isPreparedFileName(bad), false)
})
