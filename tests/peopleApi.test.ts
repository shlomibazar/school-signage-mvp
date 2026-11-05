import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { peopleError } from '@/lib/people/apiResponses'
import { DuplicateIdentityError } from '@/lib/people/service'

const PII = ['נועה', 'כהן', '2011-03-01', '012345678']

test('people API errors: no personal data in responses or logs', async () => {
  const logged: string[] = []
  const original = console.error
  console.error = (...a: unknown[]) => { logged.push(a.map(String).join(' ')) }
  try {
    const prismaMsg = 'Invalid `prisma.person.create()` invocation: { data: { firstName: "נועה", lastName: "כהן", birthDate: "2011-03-01", identityHint: "012345678" } }'
    const cases: unknown[] = [
      new Prisma.PrismaClientKnownRequestError(prismaMsg, { code: 'P2003', clientVersion: 't' }),
      new Prisma.PrismaClientValidationError(prismaMsg, { clientVersion: 't' }),
      new Error(prismaMsg),
    ]
    for (const e of cases) {
      const r = peopleError(e, 'People create')
      assert.equal(r.status, 500)
      const text = JSON.stringify(await r.json())
      for (const v of PII) assert.ok(!text.includes(v), `response leaks ${v}`)
      assert.equal(r.headers.get('cache-control'), 'no-store, private')
    }
    for (const line of logged) for (const v of PII) assert.ok(!line.includes(v), `log leaks ${v}: ${line}`)
    assert.ok(logged.length === 3 && logged.every(l => l.startsWith('People create failed:')))

    const zr = peopleError(z.object({ firstName: z.string() }).strict().safeParse({ firstName: 1, schoolId: 'x' }).error, 'x')
    const zb = await zr.json()
    assert.equal(zr.status, 400)
    assert.ok(Array.isArray(zb.fields) && !JSON.stringify(zb).includes('"x"'), 'field names only, no values')

    const dup = peopleError(new DuplicateIdentityError({ id: 'p1', name: 'נועה כהן', roles: ['STUDENT'] }), 'x')
    assert.equal(dup.status, 409)
    assert.equal((await dup.json()).code, 'DUPLICATE_IDENTITY')
    assert.equal(peopleError(new Error('Forbidden'), 'x').status, 403)
    assert.equal(peopleError(new Error('Unauthorized'), 'x').status, 401)
  } finally { console.error = original }
})
