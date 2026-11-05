import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { HttpError } from '@/lib/apiErrors'
import { DuplicateIdentityError } from './service'
import { XlsxError } from './import/xlsx'
import { PlanChangedError } from './import/service'

// Responses of the people API. Personal data must not leak through errors or logs: messages are
// fixed Hebrew texts, validation errors name fields only, and failures are logged by type and code
// only (Prisma messages contain the query values — names and dates — and are never logged here).

const NO_STORE = { 'Cache-Control': 'no-store, private' }

export function peopleJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

export function peopleError(e: unknown, context: string) {
  const json = (body: Record<string, unknown>, status: number) => peopleJson(body, status)
  if (e instanceof PlanChangedError) return json({ error: e.message, code: 'PLAN_CHANGED', preview: e.preview }, 409)
  if (e instanceof XlsxError) return json({ error: e.message }, 400)
  if (e instanceof DuplicateIdentityError) return json({ error: e.message, code: 'DUPLICATE_IDENTITY', existing: e.existing }, 409)
  if (e instanceof HttpError) return json({ error: e.message }, e.status)
  if (e instanceof SyntaxError) return json({ error: 'הבקשה אינה תקינה' }, 400)
  if (e instanceof z.ZodError) return json({ error: 'הנתונים שנשלחו אינם תקינים', fields: [...new Set(e.issues.map(i => i.path.join('.') || '(body)'))] }, 400)
  if (e instanceof Error && e.message === 'Unauthorized') return json({ error: 'נדרשת התחברות' }, 401)
  if (e instanceof Error && e.message === 'Forbidden') return json({ error: 'אין לך הרשאה לנהל את רשימת ימי ההולדת' }, 403)
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === 'P2025') return json({ error: 'האדם לא נמצא' }, 404)
    if (e.code === 'P2002') return json({ error: 'כבר קיים בבית הספר אדם עם המזהה הזה' }, 409)
    console.error(`${context} failed: Prisma ${e.code}`)
  } else {
    console.error(`${context} failed: ${e instanceof Error ? e.name : typeof e}`)
  }
  return json({ error: 'הפעולה נכשלה. נסו שוב בעוד רגע.' }, 500)
}
