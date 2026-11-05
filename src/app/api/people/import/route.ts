import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/auth'
import { HttpError } from '@/lib/apiErrors'
import { peopleSchoolId } from '@/lib/people/service'
import { peopleJson, peopleError } from '@/lib/people/apiResponses'
import { peopleImportBlocked } from '@/lib/people/rateLimit'
import { readImportForm } from '@/lib/people/import/request'
import { createPreview } from '@/lib/people/import/service'

export const runtime = 'nodejs'

// Step 2–3 of an import: parse, validate, match and plan, and store the import for confirmation.
// No person record is changed here. The response holds what the admin needs to review (names,
// classes, dates, statuses, issues) and identifiers only as their last 3 characters.
const Sheet = z.coerce.number().int().min(0).max(100)

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole('SCHOOL_ADMIN')
    const schoolId = peopleSchoolId(user)
    if (await peopleImportBlocked(user.id)) return peopleJson({ error: 'יותר מדי בקשות ייבוא בזמן קצר. נסו שוב בעוד כמה דקות.' }, 429)
    const { buf, fileName, kind, form } = await readImportForm(req)
    const sheetIndex = Sheet.parse(form.get('sheet') ?? 0)
    let mapping: unknown
    try { mapping = JSON.parse(String(form.get('mapping') ?? '')) } catch { throw new HttpError(400, 'מיפוי העמודות אינו תקין') }
    const preview = await createPreview({ schoolId, userId: user.id, kind, fileName, buf, sheetIndex, mapping })
    return peopleJson({ data: preview }, 201)
  } catch (e) {
    return peopleError(e, 'People import preview')
  }
}
