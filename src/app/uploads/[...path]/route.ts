import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const uploadsRoot = path.resolve(process.cwd(), 'public', 'uploads')

const contentTypes: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params

  if (
    !segments?.length ||
    segments.some(s => !s || s === '.' || s === '..' || s.includes('\\') || s.includes('/'))
  ) {
    return new NextResponse('Invalid path', { status: 400 })
  }

  const filePath = path.resolve(uploadsRoot, ...segments)
  const relative = path.relative(uploadsRoot, filePath)

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  try {
    const bytes = await readFile(filePath)
    const extension = path.extname(filePath).toLowerCase()
    const contentType = contentTypes[extension]

    if (!contentType) {
      return new NextResponse('Unsupported file type', { status: 415 })
    }

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        ...(extension === '.svg' || extension === '.pdf'
          ? { 'Content-Disposition': 'attachment' }
          : {}),
      },
    })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return new NextResponse('Not found', { status: 404 })
    }
    console.error('Local upload delivery failed', error)
    return new NextResponse('File unavailable', { status: 500 })
  }
}