import { NextRequest, NextResponse } from 'next/server'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { cloudinaryThumbnailUrl } from '@/lib/mediaThumbnail'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireRole('VIEWER')
    const file = await db.mediaFile.findFirst({
      where: { id: params.id, hidden: false, mediaType: 'IMAGE',
        ...(user.role === 'SUPER_ADMIN' ? {} : { schoolId: user.schoolId ?? '__none__' }) },
      select: { url: true, mimeType: true },
    })
    if (!file || !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimeType)) {
      return new NextResponse('Not found', { status: 404 })
    }
    const remote = cloudinaryThumbnailUrl(file.url)
    if (remote) return NextResponse.redirect(remote, 307)
    // Only local uploads, never arbitrary paths or remote URLs.
    const match = /^\/uploads\/([a-zA-Z0-9._-]+)$/.exec(file.url)
    if (!match || match[1] === '.' || match[1] === '..') return new NextResponse('Not found', { status: 404 })
    const source = path.join(process.cwd(), 'public', 'uploads', match[1])
    const cacheDir = path.join(process.cwd(), '.cache', 'media-thumbnails')
    const cacheName = createHash('sha256').update(file.url).digest('hex') + '.webp'
    const cached = path.join(cacheDir, cacheName)
    let bytes: Buffer
    try { bytes = await readFile(cached) }
    catch {
      const sharp = (await import('sharp')).default
      bytes = await sharp(source, { animated: false, limitInputPixels: 100_000_000 })
        .rotate().resize(320, 320, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 68, effort: 4 }).toBuffer()
      await mkdir(cacheDir, { recursive: true })
      await writeFile(cached, bytes)
    }
    return new NextResponse(new Uint8Array(bytes), {
      headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' },
    })
  } catch (error: any) {
    if (error?.message === 'Unauthorized') return new NextResponse('Unauthorized', { status: 401 })
    console.error('Thumbnail generation failed', error)
    return new NextResponse('Thumbnail unavailable', { status: 500 })
  }
}
