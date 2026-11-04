import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { db } from '@/lib/db'
import { deletePreparedUpload } from '@/lib/storage'
import { errorResponse } from '@/lib/apiErrors'
import { verifyPreparedUpload } from '@/lib/preparedUploads'

export const runtime = 'nodejs'

// Deletes prepared uploads that will not be saved (removed before saving, form cancelled or
// left). Only files of the user's school, named by a valid token, and not used by any saved
// attachment are deleted; anything else is skipped silently.
//
// Each file is checked and deleted under the same per-URL advisory lock that saving an
// announcement takes (POST /api/announcements), so a discard that arrives while a save of the
// same file is running waits for it and then sees the file in use. (The form itself never
// discards files while a save is in flight.)
export async function POST(req: NextRequest) {
  try {
    const user = await requireRole('EDITOR')
    if (!user.schoolId) return NextResponse.json({ data: { deleted: 0 } })
    const body = await req.json().catch(() => null) as { tokens?: unknown } | null
    const tokens = Array.isArray(body?.tokens) ? body.tokens.slice(0, 100) : []
    let deleted = 0
    for (const token of tokens) {
      const upload = await verifyPreparedUpload(token, user.schoolId)
      if (!upload) continue
      try {
        const removed = await db.$transaction(async tx => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${upload.url}))`
          if (await tx.announcementAttachment.count({ where: { url: upload.url } })) return false
          await deletePreparedUpload(upload.file)
          return true
        }, { timeout: 40_000 })
        if (removed) deleted++
      } catch (e) { console.error('Prepared upload delete failed', e) }
    }
    return NextResponse.json({ data: { deleted } })
  } catch (e) { return errorResponse(e, 'Prepared announcement upload discard') }
}
