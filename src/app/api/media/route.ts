import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { schoolWhere, galleryBelongsToSchool } from '@/lib/schoolScope'
import { checkUpload, requestTooLarge } from '@/lib/uploadValidation'
import { storeUpload } from '@/lib/storage'
import { errorResponse } from '@/lib/apiErrors'

export const runtime = 'nodejs'

const ALLOWED = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'video/mp4', 'video/webm'] as const

function err(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireRole('VIEWER')

    const galleryId = req.nextUrl.searchParams.get('galleryId')

    const files = await db.mediaFile.findMany({
      where: {
        ...schoolWhere(user),
        mediaType: { in: ['IMAGE', 'VIDEO'] },
        hidden: false,
        ...(galleryId ? { galleryId } : {}),
      },
      orderBy: { uploadedAt: 'desc' },
      select: {
        id: true,
        filename: true,
        originalName: true,
        url: true,
        size: true,
        caption: true,
        uploadedAt: true,
        galleryId: true,
        mimeType: true,
      },
    })

    return NextResponse.json({
      data: files.map(f => ({
        ...f,
        uploadedAt: f.uploadedAt.toISOString(),
      })),
    })
  } catch (e) {
    return errorResponse(e, 'Media list')
  }
}

type FileResult = { name: string; ok: true; id: string } | { name: string; ok: false; error: string }

// Each file is validated and stored on its own: one bad file never hides the others. The response
// lists every file (results) and the created records (data). 201 when at least one file was
// stored, 400 when none was.
export async function POST(req: NextRequest) {
  try {
    const user = await requireRole('EDITOR')
    // Media always belongs to the uploader's school (a SUPER_ADMIN without one cannot upload).
    const schoolId = user.schoolId
    if (!schoolId) return err('No school', 400)
    if (requestTooLarge(req)) return err('הבקשה גדולה מדי. יש להעלות פחות קבצים בכל פעם', 413)

    const fd = await req.formData()
    const rawGalleryId = fd.get('galleryId')
    const galleryId = typeof rawGalleryId === 'string' && rawGalleryId ? rawGalleryId : null
    // Checked before anything is stored: the target folder must belong to the same school.
    if (galleryId && !(await galleryBelongsToSchool(galleryId, schoolId))) return err('Gallery not found', 400)
    const files = fd.getAll('file').filter(
      (item): item is File => item instanceof File
    )

    if (!files.length) return err('No files', 400)

    const data = []
    const results: FileResult[] = []

    for (const file of files) {
      const name = file.name.slice(0, 200)
      const check = await checkUpload(file, ALLOWED)
      if (!check.ok) { results.push({ name, ok: false, error: check.error }); continue }

      try {
        const filename = `${Date.now()}-${randomUUID()}.${check.type.ext}`
        const url = await storeUpload(file, { folder: '', name: filename, mime: check.type.mime })

        const rec = await db.mediaFile.create({
          data: {
            schoolId,
            filename,
            originalName: name,
            mimeType: check.type.mime,
            size: file.size,
            mediaType: check.type.kind === 'video' ? 'VIDEO' : 'IMAGE',
            url,
            hidden: false,
            ...(galleryId ? { galleryId } : {}),
          },
        })

        results.push({ name, ok: true, id: rec.id })
        data.push({
          id: rec.id,
          filename: rec.filename,
          originalName: rec.originalName,
          url: rec.url,
          size: rec.size,
          caption: rec.caption,
          mimeType: rec.mimeType,
          uploadedAt: rec.uploadedAt.toISOString(),
          galleryId: rec.galleryId,
        })
      } catch (e) {
        console.error('Media upload failed:', e)
        results.push({ name, ok: false, error: 'שמירת הקובץ נכשלה' })
      }
    }

    return NextResponse.json(
      { data, results, ...(data.length ? {} : { error: 'לא הועלו קבצים' }) },
      { status: data.length ? 201 : 400 },
    )
  } catch (e) {
    return errorResponse(e, 'Media upload')
  }
}
