import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeAnnouncementIds, editorAnnouncementSettings, announcementIdsOf } from '@/lib/announcementMerge'

test('merge: no concurrent change → the editor list as is, including order', () => {
  assert.deepEqual(mergeAnnouncementIds(['a', 'b', 'c'], ['a', 'b', 'c'], ['c', 'a']), ['c', 'a'])
})
test('merge: stale editor save keeps an assignment added concurrently', () => {
  // Announcements page added X after the editor loaded [a, b]; the editor added c.
  assert.deepEqual(mergeAnnouncementIds(['a', 'b', 'X'], ['a', 'b'], ['a', 'b', 'c']), ['a', 'b', 'X', 'c'])
})
test('merge: a concurrently removed announcement is not resurrected', () => {
  // b was removed (or deleted) elsewhere; the stale editor still lists it but did not add it.
  assert.deepEqual(mergeAnnouncementIds(['a'], ['a', 'b'], ['a', 'b', 'c']), ['a', 'c'])
})
test('merge: an intentional removal in the editor wins', () => {
  assert.deepEqual(mergeAnnouncementIds(['a', 'b', 'X'], ['a', 'b'], ['b']), ['b', 'X'])
})
test('merge: no-op editor save leaves concurrent changes untouched (order kept)', () => {
  assert.deepEqual(mergeAnnouncementIds(['b', 'a', 'X'], ['a', 'b'], ['a', 'b']), ['b', 'a', 'X'])
})
test('merge: both sides add the same id → once', () => {
  assert.deepEqual(mergeAnnouncementIds(['a', 'c'], ['a'], ['a', 'c']), ['a', 'c'])
})
test('merge: duplicates in input are dropped', () => {
  assert.deepEqual(mergeAnnouncementIds(['a', 'a', 'X'], ['a'], ['a', 'b', 'b']), ['a', 'X', 'b'])
})

const stored = { contentType: 'ANNOUNCEMENT', settings: { selectedAnnouncementIds: ['a', 'X'], rotationSecs: 9 } }
test('editor settings: with base → merged, other settings from the request', () => {
  const r = editorAnnouncementSettings(stored, 'ANNOUNCEMENT', { selectedAnnouncementIds: ['a', 'c'], rotationSecs: 12 }, ['a'])
  assert.deepEqual(r, { settings: { selectedAnnouncementIds: ['a', 'X', 'c'], rotationSecs: 12 } })
})
test('editor settings: without base and a different list → conflict (no blind overwrite)', () => {
  assert.deepEqual(editorAnnouncementSettings(stored, 'ANNOUNCEMENT', { selectedAnnouncementIds: ['a'] }, undefined), { conflict: true })
})
test('editor settings: without base, same list or no list → accepted, list kept', () => {
  assert.deepEqual(editorAnnouncementSettings(stored, 'ANNOUNCEMENT', { selectedAnnouncementIds: ['a', 'X'] }, undefined), { settings: { selectedAnnouncementIds: ['a', 'X'] } })
  assert.deepEqual(editorAnnouncementSettings(stored, 'ANNOUNCEMENT', { rotationSecs: 5 }, undefined), { settings: { rotationSecs: 5, selectedAnnouncementIds: ['a', 'X'] } })
})
test('editor settings: new region or another content type → the request as is', () => {
  assert.deepEqual(editorAnnouncementSettings(null, 'ANNOUNCEMENT', { selectedAnnouncementIds: ['a'] }, undefined), { settings: { selectedAnnouncementIds: ['a'] } })
  assert.deepEqual(editorAnnouncementSettings({ contentType: 'TEXT', settings: null }, 'ANNOUNCEMENT', { selectedAnnouncementIds: ['a'] }, ['z']), { settings: { selectedAnnouncementIds: ['a'] } })
  assert.deepEqual(editorAnnouncementSettings(stored, 'CLOCK', { format: '24h' }, undefined), { settings: { format: '24h' } })
})
test('announcementIdsOf: tolerant of bad data', () => {
  assert.deepEqual(announcementIdsOf(null), [])
  assert.deepEqual(announcementIdsOf({ selectedAnnouncementIds: ['a', 3, null, 'b'] }), ['a', 'b'])
  assert.deepEqual(announcementIdsOf([1]), [])
})
