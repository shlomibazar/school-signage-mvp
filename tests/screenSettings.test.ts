import { test } from 'node:test'
import assert from 'node:assert/strict'
import { daysLabel, scheduleSummary, refreshLabel, isRefreshChoice, validateSchedule, sameSchedule, weatherCityName, timezoneLabel } from '@/lib/screenSettings'
import { DEFAULT_SCHEDULE } from '@/lib/screenSchedule'

test('days are summarised as a range, a list or the whole week', () => {
  assert.equal(daysLabel([0, 1, 2, 3, 4]), 'א׳–ה׳')
  assert.equal(daysLabel([4, 0, 2]), 'א׳, ג׳, ה׳')
  assert.equal(daysLabel([0, 1, 2, 3, 4, 5, 6]), 'כל השבוע')
  assert.equal(daysLabel([]), 'ללא ימים')
})

test('schedule summary: off, hours and days, full day', () => {
  assert.match(scheduleSummary(DEFAULT_SCHEDULE), /תוכן מוצג תמיד/)
  assert.equal(scheduleSummary({ ...DEFAULT_SCHEDULE, enabled: true }), '07:00–19:00 · א׳–ה׳')
  assert.equal(scheduleSummary({ ...DEFAULT_SCHEDULE, enabled: true, startTime: '08:00', endTime: '08:00' }), 'כל היום · א׳–ה׳')
})

test('refresh: only the intervals the API accepts are choices; older values are labelled as they are', () => {
  assert.deepEqual([300, 600, 900].map(isRefreshChoice), [true, true, true])
  assert.equal(isRefreshChoice(120), false)
  assert.equal(refreshLabel(600), 'כל 10 דקות')
  assert.equal(refreshLabel(120), 'כל 120 שניות')
})

test('schedule validation matches the API rules', () => {
  assert.deepEqual(validateSchedule(DEFAULT_SCHEDULE), {})
  assert.ok(validateSchedule({ ...DEFAULT_SCHEDULE, enabled: true, days: [] }).days)
  // A disabled schedule may keep an empty day list (as the API allows).
  assert.equal(validateSchedule({ ...DEFAULT_SCHEDULE, enabled: false, days: [] }).days, undefined)
  assert.ok(validateSchedule({ ...DEFAULT_SCHEDULE, startTime: '25:00' }).startTime)
  assert.ok(validateSchedule({ ...DEFAULT_SCHEDULE, endTime: '' }).endTime)
})

test('unsaved-change detection ignores the order of days', () => {
  assert.ok(sameSchedule({ ...DEFAULT_SCHEDULE, days: [4, 0] }, { ...DEFAULT_SCHEDULE, days: [0, 4] }))
  assert.ok(!sameSchedule(DEFAULT_SCHEDULE, { ...DEFAULT_SCHEDULE, standbyMode: 'clock' }))
})

test('weather city: the name from "lat,lon|name", a plain older value, or empty', () => {
  assert.equal(weatherCityName('32.0114,34.7748|חולון'), 'חולון')
  assert.equal(weatherCityName('Holon'), 'Holon')
  assert.equal(weatherCityName(null), '')
  assert.equal(timezoneLabel('Asia/Jerusalem'), 'שעון ישראל (Asia/Jerusalem)')
})
