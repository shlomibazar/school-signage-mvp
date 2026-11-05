import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/auth'
import { readJson } from '@/lib/apiErrors'
import { peopleSchoolId, setPersonActive } from '@/lib/people/service'
import { peopleJson, peopleError } from '@/lib/people/apiResponses'
import { peopleChangeBlocked } from '@/lib/people/rateLimit'

// Deactivates or reactivates a person. People are never deleted here: an inactive person keeps their
// identity (so a later import matches them) and never appears in public birthday lists.
const Body = z.object({ active: z.boolean() }).strict()

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole('SCHOOL_ADMIN')
    const id = z.string().min(1).max(64).parse((await params).id)
    if (await peopleChangeBlocked(user.id)) return peopleJson({ error: 'יותר מדי שינויים בזמן קצר. נסו שוב בעוד כמה דקות.' }, 429)
    const { active } = Body.parse(await readJson(req))
    return peopleJson({ data: await setPersonActive(peopleSchoolId(user), user.id, id, active) })
  } catch (e) {
    return peopleError(e, 'Person active')
  }
}
