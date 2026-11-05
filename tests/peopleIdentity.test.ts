import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { normalizeExternalId, identityKeyFor, identityHintFor, sourceRecordKey, IdentityError } from '@/lib/people/identity'
import { normalizeGrade, normalizeParallel, displayClass, gradeOrder } from '@/lib/people/grades'

process.env.PERSON_ID_KEY = 'test-person-id-key-0123456789-abcdefghijklmnop'

test('identifiers are strings: leading zeros kept, separators removed, letters allowed, no checksum', () => {
  assert.equal(normalizeExternalId('012345678'), '012345678')
  assert.equal(normalizeExternalId(' 0-1234 5678 '), '012345678')
  assert.equal(normalizeExternalId('012.345.678'), '012345678')
  assert.equal(normalizeExternalId('ab12345'), 'AB12345') // passport-like
  assert.equal(normalizeExternalId('123456789'), '123456789') // not a valid ת״ז checksum: accepted anyway
  assert.notEqual(normalizeExternalId('012345678'), normalizeExternalId('12345678')) // leading zero matters
})

test('malformed or missing identifiers are rejected', () => {
  for (const v of ['', '   ', null, undefined, {}, '12#45', 'א12345', '1'.repeat(21), '<script>']) assert.equal(normalizeExternalId(v), null, String(v))
})

test('matching key: keyed, school-scoped, deterministic, not a plain hash', () => {
  const a1 = identityKeyFor('schoolA', '012345678'), a2 = identityKeyFor('schoolA', '012345678')
  const b = identityKeyFor('schoolB', '012345678')
  assert.equal(a1, a2)
  assert.notEqual(a1, b, 'same ID in another school gives an unrelated key')
  assert.match(a1, /^[0-9a-f]{64}$/)
  assert.ok(!a1.includes('012345678'))
  assert.notEqual(a1, createHash('sha256').update('012345678').digest('hex'), 'not an unsalted hash')
  const before = process.env.PERSON_ID_KEY
  process.env.PERSON_ID_KEY = 'another-person-id-key-0123456789-abcdefghijk'
  assert.notEqual(identityKeyFor('schoolA', '012345678'), a1, 'depends on the secret key')
  process.env.PERSON_ID_KEY = before
  assert.equal(identityHintFor('012345678'), '678')
})

test('in production the key must be configured (no silent fallback)', () => {
  const env = process.env as Record<string, string | undefined>
  const [key, nodeEnv] = [env.PERSON_ID_KEY, env.NODE_ENV]
  try {
    delete env.PERSON_ID_KEY; env.NODE_ENV = 'production'
    assert.throws(() => identityKeyFor('schoolA', '012345678'), IdentityError)
    env.PERSON_ID_KEY = 'short'
    assert.throws(() => identityKeyFor('schoolA', '012345678'), IdentityError)
  } finally { env.PERSON_ID_KEY = key; env.NODE_ENV = nodeEnv }
})

test('source record keys: manual by person id, imported records keyed and per source', () => {
  assert.equal(sourceRecordKey('s', 'MANUAL', 'p1'), 'manual:p1')
  const excel = sourceRecordKey('s', 'EXCEL', '012345678'), smart = sourceRecordKey('s', 'SMARTSCHOOL', '012345678')
  assert.match(excel, /^[0-9a-f]{64}$/)
  assert.notEqual(excel, smart)
  assert.notEqual(excel, identityKeyFor('s', '012345678'))
})

test('grades: one canonical form for the usual spellings', () => {
  for (const v of ['ט', "ט'", 'ט׳', '9', ' ט ', 'שכבה ט']) assert.equal(normalizeGrade(v), 'ט׳', v)
  for (const v of ['יא', 'י"א', 'י״א', '11']) assert.equal(normalizeGrade(v), 'י״א', v)
  for (const v of ['', null, 'כיתה', '15', 'abc']) assert.equal(normalizeGrade(v), null, String(v))
  assert.deepEqual([normalizeParallel('2'), normalizeParallel(3), normalizeParallel('0'), normalizeParallel('100'), normalizeParallel('x')], [2, 3, null, null, null])
  assert.equal(displayClass('ט׳', 2), 'ט׳ 2')
  assert.equal(displayClass('ט׳', null), 'ט׳')
  assert.equal(displayClass('ט׳', 2, 'ט׳ 2 מופת'), 'ט׳ 2 מופת')
  assert.ok(gradeOrder('ט׳') < gradeOrder('י״א'))
})
