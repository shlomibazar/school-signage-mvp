import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireRole } from '@/lib/auth'
import { peopleSchoolId } from '@/lib/people/service'
import { peopleJson, peopleError } from '@/lib/people/apiResponses'
import { cancelImport } from '@/lib/people/import/service'

// Cancels a previewed import: its stored rows are deleted immediately.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole('SCHOOL_ADMIN')
    const id = z.string().min(1).max(64).parse((await params).id)
    await cancelImport(peopleSchoolId(user), id)
    return peopleJson({ ok: true })
  } catch (e) {
    return peopleError(e, 'People import cancel')
  }
}
