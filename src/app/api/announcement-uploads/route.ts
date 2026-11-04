import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { requireRole } from '@/lib/auth'
import { checkUpload, requestTooLarge } from '@/lib/uploadValidation'
import { storeUpload } from '@/lib/storage'
import { errorResponse } from '@/lib/apiErrors'
import { PREPARED_FOLDER, signPreparedUpload } from '@/lib/preparedUploads'

export const runtime = 'nodejs'
// Images only: a PDF is converted to page images in the browser (pdfPages) and each page is
// uploaded here, exactly as the TV shows them (kind PDF_PAGE).
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
const error = (message: string, status: number) => NextResponse.json({ error: message }, { status })

// Uploads a file for an announcement that has not been saved yet (see lib/preparedUploads).
export async function POST(req: NextRequest) {
  try {
    const user = await requireRole('EDITOR')
    if (!user.schoolId) return error('Missing school', 400)
    if (requestTooLarge(req)) return error('הבקשה גדולה מדי', 413)
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return error('חסר קובץ', 400)
    const check = await checkUpload(file, ALLOWED)
    if (!check.ok) return error(check.error, check.error.startsWith('הקובץ גדול') ? 413 : 400)
    const name = (String(form.get('originalName') || file.name)).slice(0, 200)
    const kind = form.get('pdfPage') === '1' ? 'PDF_PAGE' : 'IMAGE'
    const fileName = `${randomUUID()}.${check.type.ext}`
    const url = await storeUpload(file, { folder: PREPARED_FOLDER, name: fileName, mime: check.type.mime })
    const token = await signPreparedUpload({ schoolId: user.schoolId, url, name, mime: check.type.mime, kind, file: fileName })
    return NextResponse.json({ data: { token, url, kind, originalName: name } }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) { return errorResponse(e, 'Prepared announcement upload', 'ההעלאה נכשלה') }
}
