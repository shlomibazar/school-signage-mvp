import { test } from 'node:test'
import assert from 'node:assert/strict'
import { displayState, endLabel } from '@/lib/announcementDashboard'

const TZ = 'Asia/Jerusalem'
// Wednesday 4.11.2026, 12:00 in Israel (10:00 UTC).
const now = new Date('2026-11-04T10:00:00Z')
const base = { active: true, startAt: '2026-11-01T00:00:00Z', endAt: '2099-12-31T21:59:00Z', startTime: null, endTime: null, daysOfWeek: [] as number[] }
const on = [{ screenActive: true, regionActive: true }]

test('dashboard: active, assigned, in dates → live', () => {
  assert.deepEqual(displayState(base, on, now, TZ), { state: 'live' })
})
test('dashboard: inactive is never live (even if assigned)', () => {
  assert.deepEqual(displayState({ ...base, active: false }, on, now, TZ), { state: 'inactive' })
})
test('dashboard: unassigned (draft) is never counted as displayed', () => {
  assert.deepEqual(displayState(base, [], now, TZ), { state: 'draft' })
})
test('dashboard: expired, even if assigned', () => {
  assert.deepEqual(displayState({ ...base, endAt: '2026-11-03T00:00:00Z' }, on, now, TZ), { state: 'expired' })
  assert.deepEqual(displayState({ ...base, endAt: '2026-11-03T00:00:00Z' }, [], now, TZ), { state: 'expired' })
})
test('dashboard: future start → waiting (starts later)', () => {
  assert.deepEqual(displayState({ ...base, startAt: '2026-11-10T00:00:00Z' }, on, now, TZ), { state: 'waiting', reason: 'starts-later' })
})
test('dashboard: outside its daily hours or days (school time zone) → waiting', () => {
  assert.deepEqual(displayState({ ...base, startTime: '14:00', endTime: '16:00' }, on, now, TZ), { state: 'waiting', reason: 'outside-hours' })
  assert.deepEqual(displayState({ ...base, startTime: '11:30', endTime: '12:30' }, on, now, TZ), { state: 'live' })
  assert.deepEqual(displayState({ ...base, daysOfWeek: [0, 1] }, on, now, TZ), { state: 'waiting', reason: 'outside-hours' }) // Wednesday = 3
  assert.deepEqual(displayState({ ...base, daysOfWeek: [3] }, on, now, TZ), { state: 'live' })
})
test('dashboard: only on screens or regions that are off → waiting', () => {
  assert.deepEqual(displayState(base, [{ screenActive: false, regionActive: true }, { screenActive: true, regionActive: false }], now, TZ), { state: 'waiting', reason: 'screens-off' })
  assert.deepEqual(displayState(base, [{ screenActive: false, regionActive: true }, { screenActive: true, regionActive: true }], now, TZ), { state: 'live' })
})
test('dashboard: end label', () => {
  assert.equal(endLabel('2099-12-31T21:59:00Z'), 'ללא תאריך סיום')
  assert.equal(endLabel('2026-11-30T10:00:00Z', TZ), `עד ${new Date('2026-11-30T10:00:00Z').toLocaleDateString('he-IL', { timeZone: TZ })}`)
})
