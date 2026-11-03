import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sniffMime, checkUpload } from '@/lib/uploadValidation'

const bytes = (...b: number[]) => new Uint8Array(b)
const text = (s: string) => new TextEncoder().encode(s)
const file = (content: Uint8Array | string, name: string, type = 'application/octet-stream') =>
  new File([(typeof content === 'string' ? text(content) : content) as BlobPart], name, { type })
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0)
const MP4 = bytes(0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d)
const IMAGES_AND_VIDEO = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'video/mp4', 'video/webm']

test('signatures decide the type', () => {
  assert.equal(sniffMime(PNG), 'image/png')
  assert.equal(sniffMime(bytes(0xff, 0xd8, 0xff, 0xe0)), 'image/jpeg')
  assert.equal(sniffMime(text('GIF89a....')), 'image/gif')
  assert.equal(sniffMime(text('RIFF\0\0\0\0WEBPVP8 ')), 'image/webp')
  assert.equal(sniffMime(text('%PDF-1.7')), 'application/pdf')
  assert.equal(sniffMime(MP4), 'video/mp4')
  assert.equal(sniffMime(bytes(0x1a, 0x45, 0xdf, 0xa3)), 'video/webm')
  assert.equal(sniffMime(text('﻿<?xml version="1.0"?>\n<!-- logo --><svg xmlns="http://www.w3.org/2000/svg"/>')), 'image/svg+xml')
})

test('look-alikes are not accepted', () => {
  assert.equal(sniffMime(text('hello world')), null)
  assert.equal(sniffMime(text('<html><svg></svg></html>')), null)
  assert.equal(sniffMime(bytes(0, 0, 0, 0x18, ...text('ftypheic'))), null) // HEIC image, not mp4
  assert.equal(sniffMime(bytes(0, 0, 0, 0x14, ...text('ftypqt  '))), null) // QuickTime
})

test('the browser MIME type is ignored; the content and extension decide', async () => {
  assert.deepEqual(await checkUpload(file('not an image', 'a.png', 'image/png'), IMAGES_AND_VIDEO), { ok: false, error: 'סוג הקובץ אינו נתמך' })
  assert.deepEqual(await checkUpload(file(PNG, 'a.jpg', 'image/jpeg'), IMAGES_AND_VIDEO), { ok: false, error: 'סיומת הקובץ אינה תואמת את תוכנו' })
  assert.deepEqual(await checkUpload(file(PNG, 'scan', ''), IMAGES_AND_VIDEO), { ok: true, type: { mime: 'image/png', ext: 'png', kind: 'image' } })
  assert.deepEqual(await checkUpload(file(MP4, 'clip.MP4', 'video/quicktime'), IMAGES_AND_VIDEO), { ok: true, type: { mime: 'video/mp4', ext: 'mp4', kind: 'video' } })
})

test('allowed list and size limits per type', async () => {
  assert.equal((await checkUpload(file(text('%PDF-1.4'), 'a.pdf'), IMAGES_AND_VIDEO)).ok, false)
  assert.equal((await checkUpload(file('', 'empty.png'), IMAGES_AND_VIDEO)).ok, false)
  const big = new Uint8Array(10 * 1024 * 1024 + 1); big.set(PNG)
  assert.deepEqual(await checkUpload(file(big, 'big.png'), IMAGES_AND_VIDEO), { ok: false, error: 'הקובץ גדול מדי (עד 10MB לתמונה)' })
  const bigVideo = new Uint8Array(10 * 1024 * 1024 + 1); bigVideo.set(MP4)
  assert.equal((await checkUpload(file(bigVideo, 'v.mp4'), IMAGES_AND_VIDEO)).ok, true) // videos may be up to 100 MB
})

test('request size cap is checked from Content-Length, before the body is read', async () => {
  const { requestTooLarge, MAX_REQUEST_BYTES } = await import('@/lib/uploadValidation')
  const req = (length?: number) => new Request('http://x/api/media', { method: 'POST', headers: length === undefined ? {} : { 'content-length': String(length) } })
  assert.equal(requestTooLarge(req(MAX_REQUEST_BYTES)), false)
  assert.equal(requestTooLarge(req(MAX_REQUEST_BYTES + 1)), true)
  assert.equal(requestTooLarge(req()), false)
})
