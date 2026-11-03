import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'

// One mapping from thrown errors to HTTP responses for API routes, so the same failure gets the
// same status everywhere and nothing internal (Prisma messages, stack traces) reaches the client.
//   invalid JSON → 400 · requireRole: Unauthorized → 401, Forbidden → 403 · HttpError → its status
//   Prisma: record not found → 404, unknown reference (foreign key) → 400, duplicate → 409
//   anything else → logged, 500 "Server error"

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export function errorResponse(e: unknown, context: string): NextResponse {
  const json = (error: string, status: number) => NextResponse.json({ error }, { status })
  if (e instanceof HttpError) return json(e.message, e.status)
  if (e instanceof SyntaxError) return json('Invalid JSON', 400)
  if (e instanceof Error && e.message === 'Unauthorized') return json('Unauthorized', 401)
  if (e instanceof Error && e.message === 'Forbidden') return json('Forbidden', 403)
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === 'P2025') return json('Not found', 404)
    if (e.code === 'P2003') return json('Invalid reference', 400)
    if (e.code === 'P2002') return json('Already exists', 409)
  }
  if (e instanceof Prisma.PrismaClientValidationError) return json('Invalid request', 400)
  console.error(`${context} failed:`, e)
  return json('Server error', 500)
}

/** Request body as JSON; malformed JSON becomes a 400 instead of a 500. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    throw new HttpError(400, 'Invalid JSON')
  }
}
