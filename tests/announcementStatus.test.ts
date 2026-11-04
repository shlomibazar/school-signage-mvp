import { test } from 'node:test'
import assert from 'node:assert/strict'
import { announcementStatus, isOpenEnded, presetEnd, presetFor, toLocalInput, OPEN_END_LOCAL } from '@/lib/announcementStatus'
import { positionLabel } from '@/lib/announcementRegions'
import { regionIdsSchema, schema } from '@/lib/announcementSchema'

const now = new Date('2026-11-04T10:00:00Z')
const base = { active: true, startAt: '2026-11-01T00:00:00Z', endAt: '2026-11-30T00:00:00Z' }

test('status: draft when not assigned to any region', () => {
  assert.equal(announcementStatus(base, false, now), 'draft')
})
test('status: live when assigned and within dates', () => {
  assert.equal(announcementStatus(base, true, now), 'live')
})
test('status: scheduled when assigned and start is ahead', () => {
  assert.equal(announcementStatus({ ...base, startAt: '2026-11-10T00:00:00Z' }, true, now), 'scheduled')
})
test('status: expired wins over draft; inactive wins over everything', () => {
  assert.equal(announcementStatus({ ...base, endAt: '2026-11-02T00:00:00Z' }, false, now), 'expired')
  assert.equal(announcementStatus({ ...base, active: false, endAt: '2026-11-02T00:00:00Z' }, true, now), 'inactive')
})
test('no end date: the existing 2099 convention is open-ended', () => {
  assert.equal(isOpenEnded(new Date(OPEN_END_LOCAL)), true)
  assert.equal(isOpenEnded('2099-12-31T21:59:00.000Z'), true)
  assert.equal(isOpenEnded('2027-06-30T21:00:00.000Z'), false)
  assert.equal(announcementStatus({ ...base, endAt: new Date(OPEN_END_LOCAL) }, true, now), 'live')
})
test('presets: none → open end, custom → null', () => {
  assert.equal(presetEnd('none', '2026-11-04T08:00'), OPEN_END_LOCAL)
  assert.equal(presetEnd('custom', '2026-11-04T08:00'), null)
})
test('presets: week → 7 days later at 23:59', () => {
  assert.equal(presetEnd('week', '2026-11-04T08:00'), '2026-11-11T23:59')
  assert.equal(presetEnd('week', '2026-12-28T08:00'), '2027-01-04T23:59')
})
test('presets: month → same day next month, clamped to month end', () => {
  assert.equal(presetEnd('month', '2026-11-04T08:00'), '2026-12-04T23:59')
  assert.equal(presetEnd('month', '2027-01-31T08:00'), '2027-02-28T23:59')
  assert.equal(presetEnd('month', '2026-12-15T08:00'), '2027-01-15T23:59')
})
test('presets: existing schedules map to none or custom (kept exactly)', () => {
  assert.equal(presetFor(new Date(OPEN_END_LOCAL)), 'none')
  assert.equal(presetFor('2026-12-01T10:00:00Z'), 'custom')
})
test('toLocalInput round-trips a local datetime', () => {
  assert.equal(toLocalInput(new Date('2026-11-04T08:05')), '2026-11-04T08:05')
  assert.equal(toLocalInput('not a date'), '')
})
test('positionLabel: words by orientation and count', () => {
  assert.equal(positionLabel(0, 1, false), 'האזור המרכזי')
  assert.equal(positionLabel(0, 2, false), 'צד ימין')
  assert.equal(positionLabel(1, 2, false), 'צד שמאל')
  assert.equal(positionLabel(1, 3, false), 'באמצע')
  assert.equal(positionLabel(0, 2, true), 'למעלה')
  assert.equal(positionLabel(2, 3, true), 'למטה')
})
test('regionIds: duplicates removed, order kept, bad input rejected', () => {
  assert.deepEqual(regionIdsSchema.parse(['b', 'a', 'b']), ['b', 'a'])
  assert.equal(regionIdsSchema.safeParse('x').success, false)
  assert.equal(regionIdsSchema.safeParse(['']).success, false)
})
test('compatibility: EMERGENCY records still validate', () => {
  const v = schema.parse({ title: 't', body: 'b', priority: 'EMERGENCY', startAt: '2026-11-04T00:00:00.000Z', endAt: '2099-12-31T21:59:00.000Z' })
  assert.equal(v.priority, 'EMERGENCY')
})
