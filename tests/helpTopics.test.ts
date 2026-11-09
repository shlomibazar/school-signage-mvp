import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { HELP_TOPICS, QUICK_START, helpTopic } from '@/lib/help/topics'

// The Help Center is static content: these checks keep it consistent as the app changes.
const pageExists = (href: string) => {
  const route = href.split(/[?#]/)[0].replace(/^\/+/, '')
  return fs.existsSync(path.join('src/app', route, 'page.tsx'))
}

test('help topics: unique ids, required parts, related topics exist', () => {
  const ids = HELP_TOPICS.map(t => t.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const t of HELP_TOPICS) {
    assert.ok(t.title && t.summary && t.sections.length, t.id)
    for (const r of t.related ?? []) assert.ok(helpTopic(r), `${t.id} → related ${r}`)
  }
  for (const id of ['getting-started', 'screens', 'design', 'content', 'media', 'announcements', 'timetable', 'birthdays', 'tv-connection', 'connection-status', 'troubleshooting']) assert.ok(helpTopic(id), id)
})

test('help links point to real admin pages; screenshots exist and are small', () => {
  for (const t of HELP_TOPICS) {
    for (const l of t.links) assert.ok(pageExists(l.href), `${t.id}: ${l.href}`)
    if (t.image) {
      const file = path.join('public', t.image.src)
      assert.ok(fs.existsSync(file), file)
      assert.ok(fs.statSync(file).size < 120_000, `${file} is too large for a help image`)
    }
  }
  for (const s of QUICK_START) {
    if (s.link) assert.ok(pageExists(s.link.href), s.link.href)
    if (s.topic) assert.ok(helpTopic(s.topic), s.topic)
  }
  assert.ok(pageExists('/admin/help') && pageExists('/admin/help/quick-start'))
})

test('help content uses generic wording (no product names)', () => {
  const text = JSON.stringify({ HELP_TOPICS, QUICK_START })
  assert.doesNotMatch(text, /BazZ|SchoolScreen|SmartScreen/i)
})
