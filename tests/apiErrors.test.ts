import { test } from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { errorResponse, HttpError, readJson } from '@/lib/apiErrors'

const statusOf = async (e: unknown, message?: string) => {
  const r = errorResponse(e, 'test', message)
  return [r.status, (await r.json()).error]
}
const prismaError = (code: string) => new Prisma.PrismaClientKnownRequestError('internal details', { code, clientVersion: 'test' })

test('error mapping: statuses and safe messages', async () => {
  const quiet = console.error; console.error = () => {}
  try {
    assert.deepEqual(await statusOf(new SyntaxError('Unexpected token b in JSON')), [400, 'Invalid JSON'])
    assert.deepEqual(await statusOf(new Error('Unauthorized')), [401, 'Unauthorized'])
    assert.deepEqual(await statusOf(new Error('Forbidden')), [403, 'Forbidden'])
    assert.deepEqual(await statusOf(new HttpError(409, 'Taken')), [409, 'Taken'])
    assert.deepEqual(await statusOf(prismaError('P2025')), [404, 'Not found'])
    assert.deepEqual(await statusOf(prismaError('P2003')), [400, 'Invalid reference'])
    assert.deepEqual(await statusOf(prismaError('P2002')), [409, 'Already exists'])
    assert.deepEqual(await statusOf(new Error('connect ECONNREFUSED 10.0.0.5:5432')), [500, 'Server error'])
    assert.deepEqual(await statusOf(new Error('boom'), 'שגיאת שרת'), [500, 'שגיאת שרת'])
    const zodError = z.object({ name: z.string() }).safeParse({}).error
    const [status, issues] = await statusOf(zodError)
    assert.equal(status, 400)
    assert.ok(Array.isArray(issues))
  } finally { console.error = quiet }
})

test('readJson turns malformed JSON into a 400', async () => {
  await assert.rejects(readJson(new Request('http://x', { method: 'POST', body: '{bad' })), (e: unknown) => e instanceof HttpError && e.status === 400)
  assert.deepEqual(await readJson(new Request('http://x', { method: 'POST', body: '{"a":1}' })), { a: 1 })
})
