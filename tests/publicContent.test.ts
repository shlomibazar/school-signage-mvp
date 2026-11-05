import { test } from 'node:test'
import assert from 'node:assert/strict'
import { publicContentSettings } from '@/lib/publicContent'

test('legacy birthday card: public settings keep name, class and greeting — never the birth date', () => {
  const stored = { personName: 'דני', grade: 'ה׳', birthDate: '2015-04-12', greetingText: 'מזל טוב!', note: 'x', identity: '012345678' }
  const pub = publicContentSettings('BIRTHDAYS', stored)!
  assert.deepEqual(pub, { personName: 'דני', grade: 'ה׳', greetingText: 'מזל טוב!' })
  const text = JSON.stringify(pub)
  for (const v of ['2015', '04-12', 'birthDate', '012345678']) assert.ok(!text.includes(v), v)
})

test('IFRAME: only the URL; other types unchanged; bad values tolerated', () => {
  assert.deepEqual(publicContentSettings('IFRAME', { url: 'https://example.org/', sandbox: 'x' }), { url: 'https://example.org/' })
  const gallery = { folderIds: ['a'], showCaptions: true }
  assert.deepEqual(publicContentSettings('IMAGE_GALLERY', gallery), gallery)
  assert.equal(publicContentSettings('BIRTHDAYS', null), null)
  assert.equal(publicContentSettings('BIRTHDAYS', ['x']), null)
  assert.deepEqual(publicContentSettings('BIRTHDAYS', { personName: 5, grade: 'ה׳' }), { grade: 'ה׳' })
})
