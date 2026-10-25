
import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { createHash, randomUUID } from 'crypto'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth'

export const runtime = 'nodejs'

const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads')
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_VIDEO_BYTES = 100 * 1024 * 1024

const ALLOWED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
}

function err(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

function storageProvider(): 'local' | 'cloudinary' {
  const provider = process.env.STORAGE_PROVIDER || 'local'
  if (provider !== 'local' && provider !== 'cloudinary') {
    throw new Error(`Unsupported STORAGE_PROVIDER: ${provider}`)
  }
  return provider
}

async function uploadToCloudinary(
  file: File,
  filename: string
): Promise<string> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  const apiKey = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Missing Cloudinary credentials')
  }

  const resourceType = file.type.startsWith('video/')
    ? 'video'
    : 'image'

  const publicId = `schoolscreen/${filename.replace(/\.[^.]+$/, '')}`
  const timestamp = Math.floor(Date.now() / 1000)

  const signature = createHash('sha1')
    .update(
      `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`
    )
    .digest('hex')

  const form = new FormData()
  form.append('file', file, filename)
  form.append('api_key', apiKey)
  form.append('timestamp', String(timestamp))
  form.append('public_id', publicId)
  form.append('signature', signature)

  const endpoint =
    `https://api.cloudinary.com/v1_1/` +
    `${encodeURIComponent(cloudName)}/${resourceType}/upload`

  const response = await fetch(endpoint, {
    method: 'POST',
    body: form,
  })

  const result = (await response.json()) as {
    secure_url?: string
    error?: { message?: string }
  }

  if (!response.ok || !result.secure_url) {
    throw new Error(
      `Cloudinary upload failed (${response.status}): ` +
      (result.error?.message || 'Unknown error')
    )
  }

  return result.secure_url
}

async function storeFile(
  file: File,
  filename: string
): Promise<string> {
  if (storageProvider() === 'cloudinary') {
    return uploadToCloudinary(file, filename)
  }

  await mkdir(UPLOADS_DIR, { recursive: true })
  await writeFile(
    path.join(UPLOADS_DIR, filename),
    Buffer.from(await file.arrayBuffer())
  )

  return `/uploads/${filename}`
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireRole('VIEWER')
    const schoolId =
      user.role === 'SUPER_ADMIN'
        ? undefined
        : (user.schoolId ?? undefined)

    const galleryId = req.nextUrl.searchParams.get('galleryId')

    const files = await db.mediaFile.findMany({
      where: {
        ...(schoolId ? { schoolId } : {}),
        mediaType: 'IMAGE',
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
  } catch (e: any) {
    if (e.message === 'Unauthorized') {
      return err('Unauthorized', 401)
    }
    console.error('Media list failed:', e)
    return err('Server error', 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole('EDITOR')
    const schoolId = user.schoolId

    if (!schoolId && user.role !== 'SUPER_ADMIN') {
      return err('No school', 400)
    }

    const fd = await req.formData()
    const galleryId = fd.get('galleryId') as string | null
    const files = fd.getAll('file').filter(
      (item): item is File => item instanceof File
    )

    if (!files.length) return err('No files', 400)

    const results = []

    for (const file of files) {
      const ext = ALLOWED[file.type]
      if (!ext) continue

      const maxBytes = file.type.startsWith('video/')
        ? MAX_VIDEO_BYTES
        : MAX_IMAGE_BYTES

      if (file.size > maxBytes) continue

      const filename = `${Date.now()}-${randomUUID()}.${ext}`
      const url = await storeFile(file, filename)

      const rec = await db.mediaFile.create({
        data: {
          schoolId: schoolId!,
          filename,
          originalName: file.name,
          mimeType: file.type,
          size: file.size,
          mediaType: 'IMAGE',
          url,
          hidden: false,
          ...(galleryId ? { galleryId } : {}),
        },
      })

      results.push({
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
    }

    if (!results.length) {
      return err('No supported files or file too large', 400)
    }

    return NextResponse.json({ data: results }, { status: 201 })
  } catch (e: any) {
    if (e.message === 'Unauthorized') {
      return err('Unauthorized', 401)
    }

    console.error('Media upload failed:', e)
    return err('Server error', 500)
  }
}
