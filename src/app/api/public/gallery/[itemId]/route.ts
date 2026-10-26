import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Public display access is restricted to media belonging to the active screen's school.
// Media management endpoints remain authenticated.
export async function GET(_request: Request, { params }: { params: { itemId: string } }) {
  const item = await db.contentItem.findUnique({
    where: { id: params.itemId },
    include: { section: { include: { screen: true } } },
  })
  if (!item || item.contentType !== 'IMAGE_GALLERY' || !item.active || !item.section.screen.active) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const settings = (item.settings ?? {}) as { folderIds?: unknown; imageIds?: unknown }
  const folderIds = Array.isArray(settings.folderIds)
    ? settings.folderIds.filter((id): id is string => typeof id === 'string')
    : []
  const imageIds = Array.isArray(settings.imageIds)
    ? settings.imageIds.filter((id): id is string => typeof id === 'string')
    : []

  // Preserve the editor's selection precedence: folders, then individual images,
  // then the entire school's visible media library if no selection was configured.
  const selection = folderIds.length
    ? { galleryId: { in: folderIds } }
    : imageIds.length
      ? { id: { in: imageIds } }
      : item.galleryId
        ? { galleryId: item.galleryId }
        : {}

  const files = await db.mediaFile.findMany({
    where: {
      schoolId: item.section.screen.schoolId,
      ...selection,
      mediaType: 'IMAGE',
      hidden: false,
    },
    select: {
      id: true, url: true, caption: true, originalName: true,
      uploadedAt: true, mimeType: true, galleryId: true,
    },
    orderBy: { uploadedAt: 'desc' },
  })
  return NextResponse.json(
    { data: files.map(file => ({ ...file, uploadedAt: file.uploadedAt.toISOString() })) },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
