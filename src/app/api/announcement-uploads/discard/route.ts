import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { db } from '@/lib/db'
import { deletePreparedUpload } from '@/lib/storage'
import { errorResponse } from '@/lib/apiErrors'
import { verifyPreparedUpload } from '@/lib/preparedUploads'

export const runtime = 'nodejs'

// Deletes prepared uploads that will not be saved (removed before saving, form cancelled or
// left). POST so the browser can send it with navigator.sendBeacon while leaving the page.
// Only files of the user's school, named by a valid token, and not used by any saved
// attachment are deleted; anything else is skipped silently.
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
      if (await db.announcementAttachment.count({ where: { url: upload.url } })) continue
      try { await deletePreparedUpload(upload.file); deleted++ } catch (e) { console.error('Prepared upload delete failed', e) }
    }
    return NextResponse.json({ data: { deleted } })
  } catch (e) { return errorResponse(e, 'Prepared announcement upload discard') }
}
