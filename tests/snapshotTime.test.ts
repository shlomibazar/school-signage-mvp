import { test } from 'node:test'
import assert from 'node:assert/strict'
import { snapshotShortTime, snapshotStamp } from '@/lib/snapshotTime'

// 14:16 UTC on 4.11.2026 is 16:16 in Israel (winter time, UTC+2) — the tooltip used to show 14:16.
test('snapshot time is shown in Israel time, whatever the process time zone', () => {
  assert.match(snapshotShortTime('2026-11-04T14:16:00.000Z'), /16:16/)
  assert.match(snapshotStamp('2026-11-04T14:16:00.000Z'), /4\.11\.26.*16:16/)
  // Summer time (UTC+3).
  assert.match(snapshotShortTime('2026-07-01T09:05:00.000Z'), /12:05/)
})
