import { NextRequest } from 'next/server'
import { requireRole } from '@/lib/auth'
import { peopleSchoolId } from '@/lib/people/service'
import { peopleJson, peopleError } from '@/lib/people/apiResponses'
import { peopleImportBlocked } from '@/lib/people/rateLimit'
import { readImportForm } from '@/lib/people/import/request'
import { inspectFile } from '@/lib/people/import/service'

export const runtime = 'nodejs'

// Step 1 of an import: the sheets of the uploaded file, their header rows and the detected column
// mapping. Header names only — no row content is returned, and nothing is stored.
export async function POST(req: NextRequest) {
  try {
    const user = await requireRole('SCHOOL_ADMIN')
    peopleSchoolId(user)
    if (await peopleImportBlocked(user.id)) return peopleJson({ error: 'יותר מדי בקשות ייבוא בזמן קצר. נסו שוב בעוד כמה דקות.' }, 429)
    const { buf, kind } = await readImportForm(req)
    return peopleJson({ data: inspectFile(buf, kind) })
  } catch (e) {
    return peopleError(e, 'People import inspect')
  }
}
