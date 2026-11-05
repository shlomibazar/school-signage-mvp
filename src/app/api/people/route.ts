import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/auth'
import { readJson } from '@/lib/apiErrors'
import { peopleSchoolId, listPeople, createPerson, gradeFilter } from '@/lib/people/service'
import { normalizePersonRecord } from '@/lib/people/normalize'
import { peopleJson, peopleError } from '@/lib/people/apiResponses'
import { peopleChangeBlocked } from '@/lib/people/rateLimit'

// Birthday people of the signed-in user's school. SCHOOL_ADMIN and up only (personal data, including
// minors); editors and viewers manage screen content, not people.

const ListSchema = z.object({
  role: z.enum(['STUDENT', 'TEACHER']),
  status: z.enum(['active', 'inactive', 'all']).default('active'),
  q: z.string().max(60).optional(),
  grade: z.string().max(10).optional(),
  className: z.string().max(40).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(25),
}).strict()

export async function GET(req: NextRequest) {
  try {
    const user = await requireRole('SCHOOL_ADMIN')
    const schoolId = peopleSchoolId(user)
    const raw = Object.fromEntries([...req.nextUrl.searchParams.entries()].filter(([, v]) => v !== ''))
    const q = ListSchema.parse(raw)
    return peopleJson(await listPeople(schoolId, { ...q, grade: gradeFilter(q.grade ?? null) }))
  } catch (e) {
    return peopleError(e, 'People list')
  }
}

// Only these fields are accepted (strict): anything else (schoolId, identityKey, active, dataSource…)
// makes the request invalid instead of being silently applied.
const CreateSchema = z.object({
  firstName: z.string().max(100),
  lastName: z.string().max(100),
  birthDate: z.string().max(10),
  gender: z.enum(['MALE', 'FEMALE']).nullable().optional(),
  role: z.enum(['STUDENT', 'TEACHER']),
  externalId: z.string().max(40).nullable().optional(),
  grade: z.string().max(10).nullable().optional(),
  parallel: z.union([z.number(), z.string().max(3)]).nullable().optional(),
  className: z.string().max(40).nullable().optional(),
}).strict()

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole('SCHOOL_ADMIN')
    const schoolId = peopleSchoolId(user)
    if (await peopleChangeBlocked(user.id)) return peopleJson({ error: 'יותר מדי שינויים בזמן קצר. נסו שוב בעוד כמה דקות.' }, 429)
    const body = CreateSchema.parse(await readJson(req))
    const result = normalizePersonRecord(body)
    if (!result.ok) return peopleJson({ error: 'יש לתקן את השדות המסומנים', fieldErrors: result.errors }, 400)
    return peopleJson({ data: await createPerson(schoolId, user.id, result.record) }, 201)
  } catch (e) {
    return peopleError(e, 'People create')
  }
}
