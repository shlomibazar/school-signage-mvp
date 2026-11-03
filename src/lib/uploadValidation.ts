// Server-side validation of uploaded files. The browser-provided MIME type (file.type) is only a
// hint: the type is decided by the file's first bytes (signature), the file name's extension must
// agree with it, and the size limit is applied per type. The stored MIME type is the detected one.

export type UploadKind = 'image' | 'video' | 'pdf'
export type DetectedType = { mime: string; ext: string; kind: UploadKind }

const TYPES: Record<string, DetectedType & { extensions: string[] }> = {
  'image/jpeg': { mime: 'image/jpeg', ext: 'jpg', kind: 'image', extensions: ['jpg', 'jpeg', 'jfif'] },
  'image/png': { mime: 'image/png', ext: 'png', kind: 'image', extensions: ['png'] },
  'image/gif': { mime: 'image/gif', ext: 'gif', kind: 'image', extensions: ['gif'] },
  'image/webp': { mime: 'image/webp', ext: 'webp', kind: 'image', extensions: ['webp'] },
  'image/svg+xml': { mime: 'image/svg+xml', ext: 'svg', kind: 'image', extensions: ['svg'] },
  'video/mp4': { mime: 'video/mp4', ext: 'mp4', kind: 'video', extensions: ['mp4', 'm4v'] },
  'video/webm': { mime: 'video/webm', ext: 'webm', kind: 'video', extensions: ['webm'] },
  'application/pdf': { mime: 'application/pdf', ext: 'pdf', kind: 'pdf', extensions: ['pdf'] },
}

const MB = 1024 * 1024
export const MAX_BYTES: Record<UploadKind, number> = { image: 10 * MB, video: 100 * MB, pdf: 20 * MB }

const NOT_MP4_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1', 'avif', 'avis', 'qt  '])
const ascii = (bytes: Uint8Array, from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to))

/** MIME type from the file's leading bytes, or null when it is none of the supported types. */
export function sniffMime(head: Uint8Array): string | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg'
  if (head.length >= 8 && ascii(head, 1, 4) === 'PNG' && head[0] === 0x89 && head[4] === 0x0d && head[5] === 0x0a) return 'image/png'
  if (head.length >= 6 && /^GIF8[79]a$/.test(ascii(head, 0, 6))) return 'image/gif'
  if (head.length >= 12 && ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 12) === 'WEBP') return 'image/webp'
  if (head.length >= 5 && ascii(head, 0, 5) === '%PDF-') return 'application/pdf'
  // ISO media files share the "ftyp" box; HEIC/AVIF images and QuickTime use it too, by brand.
  if (head.length >= 12 && ascii(head, 4, 8) === 'ftyp') return NOT_MP4_BRANDS.has(ascii(head, 8, 12)) ? null : 'video/mp4'
  if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return 'video/webm'
  // SVG is text: an optional BOM, XML declaration, comments or doctype, then an <svg> root.
  const text = new TextDecoder('utf-8', { fatal: false }).decode(head).replace(/^﻿/, '').trimStart()
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*|<!DOCTYPE[^>]*>\s*)*<svg[\s>]/i.test(text)) return 'image/svg+xml'
  return null
}

export type FileCheck = { ok: true; type: DetectedType } | { ok: false; error: string }

/**
 * Validates one uploaded file against the allowed MIME types for the endpoint.
 * Error messages are Hebrew, shown to admins as-is.
 */
export async function checkUpload(file: File, allowed: readonly string[]): Promise<FileCheck> {
  if (file.size === 0) return { ok: false, error: 'הקובץ ריק' }
  const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer())
  const mime = sniffMime(head)
  const type = mime ? TYPES[mime] : undefined
  if (!type || !allowed.includes(type.mime)) return { ok: false, error: 'סוג הקובץ אינו נתמך' }
  const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase()
  if (ext && !type.extensions.includes(ext)) return { ok: false, error: 'סיומת הקובץ אינה תואמת את תוכנו' }
  if (file.size > MAX_BYTES[type.kind]) {
    return { ok: false, error: `הקובץ גדול מדי (עד ${MAX_BYTES[type.kind] / MB}MB ל${type.kind === 'video' ? 'סרטון' : type.kind === 'pdf' ? 'קובץ PDF' : 'תמונה'})` }
  }
  return { ok: true, type: { mime: type.mime, ext: type.ext, kind: type.kind } }
}
