import { NextRequest, NextResponse } from 'next/server'
import { createReadStream } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
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

function responseText(message: string, status: number) {
  return new NextResponse(message, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params

  if (
    !segments?.length ||
    segments.some(s =>
      !s ||
      s === '.' ||
      s === '..' ||
      s.includes('/') ||
      s.includes('\\') ||
      s.includes('\0')
    )
  ) {
    return responseText('Invalid path', 400)
  }

  const filePath = path.resolve(uploadsRoot, ...segments)
  const relative = path.relative(uploadsRoot, filePath)

  if (
    !relative ||
    relative.startsWith('..' + path.sep) ||
    relative === '..' ||
    path.isAbsolute(relative)
  ) {
    return responseText('Forbidden', 403)
  }

  const extension = path.extname(filePath).toLowerCase()
  const contentType = contentTypes[extension]

  if (!contentType) {
    return responseText('Unsupported file type', 415)
  }

  try {
    const [realRoot, realFile] = await Promise.all([
      realpath(uploadsRoot),
      realpath(filePath),
    ])

    const realRelative = path.relative(realRoot, realFile)

    if (
      !realRelative ||
      realRelative === '..' ||
      realRelative.startsWith('..' + path.sep) ||
      path.isAbsolute(realRelative)
    ) {
      return responseText('Forbidden', 403)
    }

    const fileStat = await stat(realFile)

    if (!fileStat.isFile()) {
      return responseText('Not found', 404)
    }

    const size = fileStat.size
    const isVideo = extension === '.mp4' || extension === '.webm'

    const headers = new Headers({
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Accept-Ranges': 'bytes',
    })

    if (extension === '.svg' || extension === '.pdf') {
      headers.set('Content-Disposition', 'attachment')
    }

    const range = req.headers.get('range')
    let start = 0
    let end = size - 1
    let status = 200

    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim())

      if (!match || (!match[1] && !match[2])) {
        headers.set('Content-Range', `bytes */${size}`)
        return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}`, "Content-Length": "0", "Accept-Ranges": "bytes" } })
      }

      if (!match[1]) {
        const suffix = Number(match[2])
        if (!Number.isSafeInteger(suffix) || suffix <= 0 || size === 0) {
          headers.set('Content-Range', `bytes */${size}`)
          return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}`, "Content-Length": "0", "Accept-Ranges": "bytes" } })
        }
        start = Math.max(0, size - suffix)
      } else {
        start = Number(match[1])
        if (match[2]) end = Number(match[2])

        if (
          !Number.isSafeInteger(start) ||
          !Number.isSafeInteger(end) ||
          start > end ||
          start >= size
        ) {
          headers.set('Content-Range', `bytes */${size}`)
          return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}`, "Content-Length": "0", "Accept-Ranges": "bytes" } })
        }

        end = Math.min(end, size - 1)
      }

      status = 206
      headers.set('Content-Range', `bytes ${start}-${end}/${size}`)
    }

    if (size === 0 && !range) {
      headers.set('Content-Length', '0')
      return new NextResponse(null, { status: 200, headers })
    }

    headers.set('Content-Length', String(end - start + 1))

    const stream = createReadStream(realFile, { start, end })

    const body = Readable.toWeb(stream) as ReadableStream<Uint8Array>

    return new NextResponse(body, { status, headers })
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code

    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return responseText('Not found', 404)
    }

    console.error('Local upload delivery failed', error)
    return responseText('File unavailable', 500)
  }
}