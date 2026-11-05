import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Prisma } from '@prisma/client'
import { saveErrorMessage } from '@/lib/saveErrors'
import { errorResponse } from '@/lib/apiErrors'

const hebrew = (s: string) => /[֐-׿]/.test(s)

test('content save errors: Hebrew server messages are shown as they are', () => {
  assert.equal(saveErrorMessage(400, { error: 'יש להזין כתובת מאובטחת שמתחילה ב־https://' }), 'יש להזין כתובת מאובטחת שמתחילה ב־https://')
})

test('content save errors: English text, issue lists or no body become Hebrew (the "Invalid request" case)', () => {
  for (const [status, body] of [[400, { error: 'Invalid request' }], [400, { error: [{ path: ['x'], message: 'bad' }] }], [400, null],
    [401, { error: 'Unauthorized' }], [403, { error: 'Forbidden' }], [404, { error: 'Section not found' }], [409, {}], [500, { error: 'Server error' }], [502, undefined]] as const) {
    const m = saveErrorMessage(status, body)
    assert.ok(hebrew(m), `${status} → ${m}`)
    assert.ok(!/Invalid request|object Object|Server error/.test(m))
  }
})

test('a request Prisma refuses (e.g. an outdated Prisma client) → 400 with the given Hebrew message, and the reason is logged', async () => {
  const logged: string[] = []
  const original = console.error
  console.error = (...a: unknown[]) => { logged.push(a.join(' ')) }
  try {
    const e = new Prisma.PrismaClientValidationError(
      'Invalid `prisma.contentItem.create()` invocation:\n\n{ data: { contentType: "IFRAME", settings: { url: "https://example.org/" } } }\n\nInvalid value for argument `contentType`. Expected ContentType.',
      { clientVersion: 'test' })
    const r = errorResponse(e, 'POST content', 'שגיאת שרת', 'השרת לא קיבל את התוכן')
    assert.equal(r.status, 400)
    assert.equal((await r.json()).error, 'השרת לא קיבל את התוכן')
    assert.equal(logged.length, 1)
    assert.match(logged[0], /POST content rejected by Prisma: Invalid value for argument `contentType`\. Expected ContentType\./)
    assert.ok(!logged[0].includes('https://example.org'), 'the query values are not logged')
    // Without a message the API keeps its existing response.
    assert.equal((await errorResponse(e, 'x').json()).error, 'Invalid request')
  } finally { console.error = original }
})
