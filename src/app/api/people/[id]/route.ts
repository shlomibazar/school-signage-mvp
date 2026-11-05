import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/auth'
import { readJson } from '@/lib/apiErrors'
import { peopleSchoolId, getPerson, updatePerson, type PersonPatch } from '@/lib/people/service'
import { normalizeName } from '@/lib/people/normalize'
import { parseDateOnly } from '@/lib/people/birthdays'
import { normalizeGrade, normalizeParallel, displayClass } from '@/lib/people/grades'
import { peopleJson, peopleError } from '@/lib/people/apiResponses'
import { peopleChangeBlocked } from '@/lib/people/rateLimit'

const Id = z.string().min(1).max(64)

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole('SCHOOL_ADMIN')
    const id = Id.parse((await params).id)
    return peopleJson({ data: await getPerson(peopleSchoolId(user), id) })
  } catch (e) {
    return peopleError(e, 'Person read')
  }
}

// Allowlisted, strict: only these fields can change. Active state has its own endpoint.
const PatchSchema = z.object({
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  birthDate: z.string().max(10).optional(),
  gender: z.enum(['MALE', 'FEMALE']).nullable().optional(),
  externalId: z.string().max(40).nullable().optional(),
  role: z.object({
    role: z.enum(['STUDENT', 'TEACHER']),
    grade: z.string().max(10).nullable().optional(),
    parallel: z.union([z.number(), z.string().max(3)]).nullable().optional(),
    className: z.string().max(40).nullable().optional(),
    active: z.boolean().default(true),
  }).strict().optional(),
}).strict()

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole('SCHOOL_ADMIN')
    const id = Id.parse((await params).id)
    if (await peopleChangeBlocked(user.id)) return peopleJson({ error: 'יותר מדי שינויים בזמן קצר. נסו שוב בעוד כמה דקות.' }, 429)
    const body = PatchSchema.parse(await readJson(req))
    const fieldErrors: Record<string, string> = {}
    const patch: PersonPatch = {}
    if (body.firstName !== undefined) { const v = normalizeName(body.firstName); if (v) patch.firstName = v; else fieldErrors.firstName = 'יש להזין שם פרטי (אותיות בלבד, עד 60 תווים)' }
    if (body.lastName !== undefined) { const v = normalizeName(body.lastName); if (v) patch.lastName = v; else fieldErrors.lastName = 'יש להזין שם משפחה (אותיות בלבד, עד 60 תווים)' }
    if (body.birthDate !== undefined) {
      const d = parseDateOnly(body.birthDate)
      if (!d || d.getUTCFullYear() < 1900 || d.getTime() > Date.now()) fieldErrors.birthDate = 'יש להזין תאריך לידה תקין'
      else patch.birthDate = body.birthDate.trim()
    }
    if (body.gender !== undefined) patch.gender = body.gender
    if (body.externalId !== undefined) patch.externalId = body.externalId && body.externalId.trim() ? body.externalId : null
    if (body.role) {
      const r = body.role
      const grade = r.grade ? normalizeGrade(r.grade) : null
      if (r.grade && !grade) fieldErrors.grade = 'שכבה לא מוכרת'
      const parallel = r.parallel !== null && r.parallel !== undefined && String(r.parallel).trim() !== '' ? normalizeParallel(r.parallel) : null
      if (parallel === null && r.parallel !== null && r.parallel !== undefined && String(r.parallel).trim() !== '') fieldErrors.parallel = 'מקבילה צריכה להיות מספר בין 1 ל־99'
      patch.role = { role: r.role, grade, parallel, className: r.role === 'STUDENT' ? displayClass(grade, parallel, r.className) : null, active: r.active }
    }
    if (Object.keys(fieldErrors).length) return peopleJson({ error: 'יש לתקן את השדות המסומנים', fieldErrors }, 400)
    return peopleJson({ data: await updatePerson(peopleSchoolId(user), user.id, id, patch) })
  } catch (e) {
    return peopleError(e, 'Person update')
  }
}
