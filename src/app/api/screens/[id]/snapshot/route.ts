import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { schoolWhere } from '@/lib/schoolScope'
import { checkUpload, requestTooLarge } from '@/lib/uploadValidation'
import { storeScreenSnapshot } from '@/lib/storage'
import { errorResponse } from '@/lib/apiErrors'

export const runtime = 'nodejs'
/** A 1280×720 JPEG at quality ~0.8 is 50–100 KB; anything far larger is not a snapshot. */
const MAX_SNAPSHOT_BYTES = 500 * 1024
const error = (message: string, status: number) => NextResponse.json({ error: message }, { status })

// Stores the snapshot captured in the screen editor ("עדכן צילום") as the screen's one current
// snapshot. The image replaces the previous one in storage, and snapshotUrl / snapshotAt are set
// only after it was stored. Saves for the same screen run one at a time (advisory lock held from
// before the upload until the row is updated), so the stored image and the database reference
// always come from the same, latest capture.
export async function POST(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const { id } = await paramsPromise
  try {
    const user = await requireRole('EDITOR')
    const screen = await db.screen.findFirst({ where: { id, ...schoolWhere(user) }, select: { id: true } })
    if (!screen) return error('המסך לא נמצא', 404)
    if (requestTooLarge(req)) return error('הבקשה גדולה מדי', 413)
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return error('חסר קובץ', 400)
    if (file.size > MAX_SNAPSHOT_BYTES) return error(`הצילום גדול מדי (עד ${MAX_SNAPSHOT_BYTES / 1024}KB)`, 413)
    const check = await checkUpload(file, ['image/jpeg'])
    if (!check.ok) return error(check.error === 'סוג הקובץ אינו נתמך' ? 'הצילום חייב להיות תמונת JPEG' : check.error, 400)

    const saved = await db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`screen-snapshot:${screen.id}`}))`
      // The screen may have been deleted while this request waited.
      if (!(await tx.screen.findUnique({ where: { id: screen.id }, select: { id: true } }))) return null
      const url = await storeScreenSnapshot(file, screen.id)
      return tx.screen.update({ where: { id: screen.id }, data: { snapshotUrl: url, snapshotAt: new Date() }, select: { snapshotUrl: true, snapshotAt: true } })
    }, { timeout: 150_000, maxWait: 30_000 })
    if (!saved) return error('המסך לא נמצא', 404)
    return NextResponse.json({ data: saved }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) { return errorResponse(e, 'Screen snapshot upload', 'שמירת הצילום נכשלה') }
}
