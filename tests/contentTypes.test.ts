import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CONTENT_TYPES, offeredContentTypes, contentTypeLabel } from '@/lib/contentTypes'
import type { ContentType } from '@/types'

const ALL: ContentType[] = ['TEXT', 'IMAGE_GALLERY', 'VIDEO', 'CLOCK', 'DATE', 'WEATHER', 'RSS_FEED', 'TIMETABLE', 'EVENTS', 'BIRTHDAYS', 'ANNOUNCEMENT', 'EMPTY']

test('every stored content type has a label (so existing regions always show a name)', () => {
  for (const t of ALL) assert.ok(contentTypeLabel(t) && contentTypeLabel(t) !== t, t)
  assert.equal(new Set(CONTENT_TYPES.map(c => c.type)).size, CONTENT_TYPES.length)
})

test('the requested types are offered first; events are under "תוכן נוסף"', () => {
  const { main, more } = offeredContentTypes('EMPTY')
  const mainTypes = main.map(c => c.type)
  for (const t of ['IMAGE_GALLERY', 'ANNOUNCEMENT', 'TIMETABLE', 'BIRTHDAYS', 'TEXT'] as const) assert.ok(mainTypes.includes(t), t)
  assert.deepEqual(more.map(c => c.type), ['EVENTS'])
  assert.equal(contentTypeLabel('TIMETABLE'), 'שינויי מערכת')
})

test('types removed from the picker earlier are not offered for new content', () => {
  const { main, more } = offeredContentTypes('IMAGE_GALLERY')
  const offered = [...main, ...more].map(c => c.type)
  for (const t of ['CLOCK', 'DATE', 'WEATHER'] as const) assert.ok(!offered.includes(t), t)
})

test('a region that already uses one of them still sees it (under "תוכן נוסף")', () => {
  for (const t of ['CLOCK', 'DATE', 'WEATHER'] as const) {
    const { more } = offeredContentTypes(t)
    assert.ok(more.some(c => c.type === t), t)
  }
})
