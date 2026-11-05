import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/auth'
import { peopleSchoolId } from '@/lib/people/service'
import { peopleJson, peopleError } from '@/lib/people/apiResponses'
import { peopleImportBlocked } from '@/lib/people/rateLimit'
import { applyImport } from '@/lib/people/import/service'

export const runtime = 'nodejs'

// Step 4 of an import: apply the stored, previewed import. The client sends nothing but the id; the
// server re-plans from its own stored rows and the current data, and applies all or nothing.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole('SCHOOL_ADMIN')
    const schoolId = peopleSchoolId(user)
    const id = z.string().min(1).max(64).parse((await params).id)
    if (await peopleImportBlocked(user.id)) return peopleJson({ error: 'יותר מדי בקשות ייבוא בזמן קצר. נסו שוב בעוד כמה דקות.' }, 429)
    return peopleJson({ data: await applyImport({ schoolId, userId: user.id, importId: id }) })
  } catch (e) {
    return peopleError(e, 'People import apply')
  }
}
