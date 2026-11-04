import { createHash } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'

// Where uploaded files are kept, shared by every upload route (media, announcement attachments,
// school logo). STORAGE_PROVIDER=cloudinary uploads with a signed request (the API secret never
// leaves the server); "local" writes under public/uploads, served by src/app/uploads/[...path].
// Errors thrown here are for the server log only; routes answer with a generic message.

const CLOUDINARY_TIMEOUT_MS = 120_000

export function storageProvider(): 'local' | 'cloudinary' {
  const provider = process.env.STORAGE_PROVIDER || 'local'
  if (provider !== 'local' && provider !== 'cloudinary') throw new Error(`Unsupported STORAGE_PROVIDER: ${provider}`)
  return provider
}

/**
 * Deletes a stored image from the prepared-announcement-uploads folder ("announcements/prepared").
 * Restricted to that folder and to server-chosen names, so no other upload (media library,
 * saved attachments, logos) can ever be deleted through it. Missing files count as deleted.
 */
export async function deletePreparedUpload(fileName: string): Promise<void> {
  if (!/^[0-9a-f-]{36}\.(jpg|png|webp|gif)$/.test(fileName)) throw new Error('Invalid prepared upload name')
  if (storageProvider() === 'local') {
    const { unlink } = await import('fs/promises')
    await unlink(path.join(process.cwd(), 'public', 'uploads', 'announcements', 'prepared', fileName)).catch(e => { if (e?.code !== 'ENOENT') throw e })
    return
  }
  const cloud = process.env.CLOUDINARY_CLOUD_NAME, key = process.env.CLOUDINARY_API_KEY, secret = process.env.CLOUDINARY_API_SECRET
  if (!cloud || !key || !secret) throw new Error('Cloudinary is not configured')
  const publicId = `schoolscreen/announcements/prepared/${fileName.replace(/\.[^.]+$/, '')}`
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = createHash('sha1').update(`public_id=${publicId}&timestamp=${timestamp}${secret}`).digest('hex')
  const form = new FormData()
  form.append('public_id', publicId); form.append('timestamp', String(timestamp)); form.append('api_key', key); form.append('signature', signature)
  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/image/destroy`, { method: 'POST', body: form, signal: AbortSignal.timeout(30_000) })
  const result = await response.json().catch(() => ({})) as { result?: string }
  if (!response.ok || (result.result !== 'ok' && result.result !== 'not found')) throw new Error(`Cloudinary delete failed (${response.status}): ${result.result ?? 'unknown'}`)
}

/**
 * Stores one file and returns its public URL.
 * @param folder  sub-folder, e.g. "announcements" ("" for the media library's existing layout)
 * @param name    unique file name including the extension (chosen by the server)
 * @param mime    the detected MIME type (decides Cloudinary's resource type)
 */
export async function storeUpload(file: File, { folder, name, mime }: { folder: string; name: string; mime: string }): Promise<string> {
  const sub = folder ? `${folder}/` : ''
  if (storageProvider() === 'local') {
    const dir = path.join(process.cwd(), 'public', 'uploads', folder)
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()))
    return `/uploads/${sub}${name}`
  }

  const cloud = process.env.CLOUDINARY_CLOUD_NAME, key = process.env.CLOUDINARY_API_KEY, secret = process.env.CLOUDINARY_API_SECRET
  if (!cloud || !key || !secret) throw new Error('Cloudinary is not configured')
  const publicId = `schoolscreen/${sub}${name.replace(/\.[^.]+$/, '')}`
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = createHash('sha1').update(`public_id=${publicId}&timestamp=${timestamp}${secret}`).digest('hex')
  const form = new FormData()
  // The File is passed as is (no extra in-memory copy: videos may be up to 100 MB).
  // Cloudinary reads the type from the content; `mime` only selects the endpoint below.
  form.append('file', file, name)
  form.append('api_key', key)
  form.append('timestamp', String(timestamp))
  form.append('public_id', publicId)
  form.append('signature', signature)
  const resource = mime.startsWith('video/') ? 'video' : mime === 'application/pdf' ? 'raw' : 'image'
  // A stuck upload must not hold the request forever; a timeout fails this file only.
  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/${resource}/upload`, { method: 'POST', body: form, signal: AbortSignal.timeout(CLOUDINARY_TIMEOUT_MS) })
  const result = await response.json().catch(() => ({})) as { secure_url?: string; error?: { message?: string } }
  if (!response.ok || !result.secure_url) throw new Error(`Cloudinary upload failed (${response.status}): ${result.error?.message || 'unknown error'}`)
  return result.secure_url
}
