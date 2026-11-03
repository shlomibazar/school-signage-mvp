import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isChunkLoadError } from '@/lib/chunkError'

test('chunk-load errors are recognised; other errors are not', () => {
  const named = Object.assign(new Error('x'), { name: 'ChunkLoadError' })
  assert.equal(isChunkLoadError(named), true)
  assert.equal(isChunkLoadError(new Error('Loading chunk 2170 failed.\n(error: https://x/_next/static/chunks/2170-aa36.js)')), true)
  assert.equal(isChunkLoadError(new Error('Loading CSS chunk app-layout failed')), true)
  assert.equal(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: /x.js')), true)
  assert.equal(isChunkLoadError(new Error('Cannot read properties of undefined')), false)
  assert.equal(isChunkLoadError(null), false)
})
