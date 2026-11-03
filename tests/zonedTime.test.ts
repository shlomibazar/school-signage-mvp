import { test } from 'node:test'
import assert from 'node:assert/strict'
import { zonedParts, zonedClock, inDailyWindow, clockMinutes } from '@/lib/zonedTime'
import { isActiveNow, resolveActiveContent } from '@/lib/scheduling'
import { isScreenInOperatingHours } from '@/lib/screenSchedule'
import type { ContentItem } from '@/types'

// Fixed instants (UTC) and what they are in Israel. 2026: IDT (UTC+3) from Fri 27 Mar 02:00 to Sun 25 Oct 02:00.
const WED_0030_WINTER = new Date('2026-11-03T22:30:00Z') // Wed 4 Nov 00:30 IST (UTC Tue 22:30)
const THU_0030_SUMMER = new Date('2026-07-01T21:30:00Z') // Thu 2 Jul 00:30 IDT (UTC Wed 21:30)
const MON_0100 = new Date('2026-11-08T23:00:00Z')       // Mon 9 Nov 01:00 IST
const MON_2300 = new Date('2026-11-09T21:00:00Z')       // Mon 9 Nov 23:00 IST
const SUN_2300 = new Date('2026-11-08T21:00:00Z')       // Sun 8 Nov 23:00 IST

const item = (over: Partial<ContentItem>): ContentItem => ({ id: 'x', active: true, startDate: null, endDate: null, startTime: null, endTime: null, daysOfWeek: [], contentType: 'TEXT', ...over } as ContentItem)

test('Israeli weekday and hour, not the server (UTC) one, around midnight', () => {
  assert.deepEqual([zonedParts(WED_0030_WINTER).weekday, zonedParts(WED_0030_WINTER).hour, zonedParts(WED_0030_WINTER).date], [3, 0, '2026-11-04'])
  assert.deepEqual([zonedParts(THU_0030_SUMMER).weekday, zonedParts(THU_0030_SUMMER).hour], [4, 0])
})

test('daylight saving: clock jumps 02:00 → 03:00 on 27 Mar 2026 and back on 25 Oct 2026', () => {
  assert.equal(zonedClock(new Date('2026-03-26T23:59:00Z')), '01:59')
  assert.equal(zonedClock(new Date('2026-03-27T00:00:00Z')), '03:00')
  assert.equal(zonedClock(new Date('2026-10-24T22:59:00Z')), '01:59')
  assert.equal(zonedClock(new Date('2026-10-24T23:00:00Z')), '01:00')
})

test('unknown time zone falls back to Asia/Jerusalem', () => {
  assert.equal(zonedClock(WED_0030_WINTER, 'Not/AZone'), '00:30')
})

test('daily windows: open bounds, same-day, overnight, whole day', () => {
  assert.equal(clockMinutes('25:00'), null)
  assert.equal(inDailyWindow(600, null, null), true)
  assert.equal(inDailyWindow(600, clockMinutes('08:00'), clockMinutes('14:00')), true)
  assert.equal(inDailyWindow(840, clockMinutes('08:00'), clockMinutes('14:00')), false) // end is exclusive
  assert.equal(inDailyWindow(60, clockMinutes('22:00'), clockMinutes('06:00')), true)
  assert.equal(inDailyWindow(720, clockMinutes('22:00'), clockMinutes('06:00')), false)
  assert.equal(inDailyWindow(5, clockMinutes('07:00'), clockMinutes('07:00')), true)
})

test('content item days follow Israeli time after midnight', () => {
  assert.equal(isActiveNow(item({ daysOfWeek: [3] }), WED_0030_WINTER, 'Asia/Jerusalem', 'day'), true)
  assert.equal(isActiveNow(item({ daysOfWeek: [2] }), WED_0030_WINTER, 'Asia/Jerusalem', 'day'), false)
})

test('overnight window belongs to the day it started', () => {
  const sundayNight = item({ daysOfWeek: [0], startTime: '22:00', endTime: '06:00' })
  assert.equal(isActiveNow(sundayNight, SUN_2300, null, 'day'), true)
  assert.equal(isActiveNow(sundayNight, MON_0100, null, 'day'), true)
  assert.equal(isActiveNow(sundayNight, MON_2300, null, 'day'), false)
})

test('date range in days includes the end day (Israeli calendar)', () => {
  const nov4 = item({ startDate: '2026-11-04T00:00:00.000Z', endDate: '2026-11-04T00:00:00.000Z' })
  assert.equal(isActiveNow(nov4, WED_0030_WINTER, null, 'day'), true)
  assert.equal(isActiveNow(nov4, new Date('2026-11-04T21:59:00Z'), null, 'day'), true)  // 23:59 IST
  assert.equal(isActiveNow(nov4, new Date('2026-11-04T22:00:00Z'), null, 'day'), false) // 00:00 IST on the 5th
})

test('no fallback to an item outside its schedule', () => {
  const morning = item({ id: 'm', startTime: '08:00', endTime: '12:00' })
  const evening = item({ id: 'e', startTime: '18:00', endTime: '22:00' })
  assert.equal(resolveActiveContent([morning, evening], new Date('2026-11-04T08:00:00Z'), null)?.id, 'm') // 10:00
  assert.equal(resolveActiveContent([morning, evening], new Date('2026-11-04T17:00:00Z'), null)?.id, 'e') // 19:00
  assert.equal(resolveActiveContent([morning, evening], new Date('2026-11-04T12:00:00Z'), null), null)    // 14:00
  assert.equal(resolveActiveContent([item({ active: false })], WED_0030_WINTER, null), null)
})

test('operating hours (screenSchedule) agree with the shared helper', () => {
  const schedule = { enabled: true, startTime: '22:00', endTime: '06:00', days: [0], standbyMode: 'logo' as const }
  assert.equal(isScreenInOperatingHours(schedule, 'Asia/Jerusalem', MON_0100), true)
  assert.equal(isScreenInOperatingHours(schedule, 'Asia/Jerusalem', MON_2300), false)
  assert.equal(isScreenInOperatingHours({ ...schedule, enabled: false, days: [] }, 'Asia/Jerusalem', MON_2300), true)
})

test('Friday → Saturday at midnight, and the week starting on Sunday', () => {
  const fri2359 = new Date('2026-11-06T21:59:00Z'), sat0000 = new Date('2026-11-06T22:00:00Z')
  assert.equal(zonedParts(fri2359).weekday, 5)
  assert.equal(zonedParts(sat0000).weekday, 6)
  const schoolDays = item({ daysOfWeek: [0, 1, 2, 3, 4, 5] })
  assert.equal(isActiveNow(schoolDays, fri2359, null, 'day'), true)
  assert.equal(isActiveNow(schoolDays, sat0000, null, 'day'), false)
  assert.equal(isActiveNow(schoolDays, new Date('2026-11-07T22:00:00Z'), null, 'day'), true) // Sun 00:00
})

test('several scheduled items: the first eligible one, switching on time', () => {
  const weekdayMorning = item({ id: 'a', daysOfWeek: [0, 1, 2, 3, 4], startTime: '07:00', endTime: '13:00' })
  const always = item({ id: 'b' })
  assert.equal(resolveActiveContent([weekdayMorning, always], new Date('2026-11-04T06:30:00Z'), null)?.id, 'a') // Wed 08:30
  assert.equal(resolveActiveContent([weekdayMorning, always], new Date('2026-11-04T11:00:00Z'), null)?.id, 'b') // Wed 13:00 (end exclusive)
  assert.equal(resolveActiveContent([weekdayMorning, always], new Date('2026-11-07T06:30:00Z'), null)?.id, 'b') // Sat 08:30
})

test('result does not depend on the process time zone', () => {
  // Run with TZ=UTC / America/New_York / Asia/Tokyo etc.: the answers above stay the same.
  assert.equal(new Intl.DateTimeFormat().resolvedOptions().timeZone.length > 0, true)
  assert.equal(zonedClock(new Date('2026-07-01T21:30:00Z')), '00:30')
})
