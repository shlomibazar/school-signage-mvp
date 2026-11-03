import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'

// One mapping from thrown errors to HTTP responses for API routes, so the same failure gets the
// same status everywhere and nothing internal (Prisma messages, stack traces) reaches the client.
//   invalid JSON, zod validation → 400 · requireRole: Unauthorized → 401, Forbidden → 403
//   HttpError → its status
//   Prisma: record not found → 404, unknown reference (foreign key) → 400, duplicate → 409
//   anything else → logged, 500 "Server error"

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

/**
 * @param context        label for the server log
 * @param serverMessage  message for the 500 response (e.g. a Hebrew one the admin UI shows)
 */
export function errorResponse(e: unknown, context: string, serverMessage = 'Server error'): NextResponse {
  const json = (error: string, status: number) => NextResponse.json({ error }, { status })
  if (e instanceof HttpError) return json(e.message, e.status)
  if (e instanceof SyntaxError) return json('Invalid JSON', 400)
  // Validation issues keep the existing response shape ({ error: issues[] }).
  if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues }, { status: 400 })
  if (e instanceof Error && e.message === 'Unauthorized') return json('Unauthorized', 401)
  if (e instanceof Error && e.message === 'Forbidden') return json('Forbidden', 403)
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === 'P2025') return json('Not found', 404)
    if (e.code === 'P2003') return json('Invalid reference', 400)
    if (e.code === 'P2002') return json('Already exists', 409)
  }
  if (e instanceof Prisma.PrismaClientValidationError) return json('Invalid request', 400)
  console.error(`${context} failed:`, e)
  return json(serverMessage, 500)
}

/** Request body as JSON; malformed JSON becomes a 400 instead of a 500. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    throw new HttpError(400, 'Invalid JSON')
  }
}
