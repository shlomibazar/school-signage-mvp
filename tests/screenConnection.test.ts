import { test } from 'node:test'
import assert from 'node:assert/strict'
import { connectionStatus, relativeTimeHe, CONNECTED_WITHIN_MS, CONNECTION_LABELS, HEARTBEAT_INTERVAL_MS, HEARTBEAT_MIN_WRITE_GAP_MINUTES } from '@/lib/screenConnection'

const now = new Date('2026-11-09T12:00:00Z')
const ago = (ms: number) => new Date(now.getTime() - ms)

test('connection status: 2-hour boundary, never connected', () => {
  assert.equal(connectionStatus(null, now), 'never')
  assert.equal(connectionStatus(undefined, now), 'never')
  assert.equal(CONNECTION_LABELS.never, 'טרם התחבר')
  assert.equal(connectionStatus(ago(45 * 60_000), now), 'connected')
  assert.equal(connectionStatus(ago(CONNECTED_WITHIN_MS), now), 'connected', 'exactly 2 hours: still connected')
  assert.equal(connectionStatus(ago(CONNECTED_WITHIN_MS + 1000), now), 'disconnected', 'just over 2 hours')
  assert.equal(connectionStatus(ago(3 * 24 * 3600_000).toISOString(), now), 'disconnected')
  // hourly reports keep a screen connected even when one report is lost; writes are at most hourly
  assert.ok(2 * HEARTBEAT_INTERVAL_MS <= CONNECTED_WITHIN_MS)
  assert.ok(HEARTBEAT_MIN_WRITE_GAP_MINUTES * 60_000 < HEARTBEAT_INTERVAL_MS)
})

test('relative time in Hebrew', () => {
  assert.equal(relativeTimeHe(ago(30_000), now), 'לפני פחות מדקה')
  assert.equal(relativeTimeHe(ago(45 * 60_000), now), 'לפני 45 דקות')
  assert.equal(relativeTimeHe(ago(2 * 3600_000), now), 'לפני שעתיים')
  assert.equal(relativeTimeHe(ago(5 * 3600_000), now), 'לפני 5 שעות')
  assert.equal(relativeTimeHe(ago(3 * 86400_000), now), 'לפני 3 ימים')
})
