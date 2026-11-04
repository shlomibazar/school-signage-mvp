import { createHash } from 'crypto'
import { SignJWT, jwtVerify } from 'jose'

// Announcement attachments prepared before the announcement exists.
//
// A file chosen in the announcement form is validated and stored right away (same checks and
// storage as every other upload) in the "announcements/prepared" folder, without a database
// record. The server answers with a signed token that names the stored file and the school it
// was uploaded for. Saving the announcement sends the tokens; the server verifies each one and
// creates the attachment rows. A token can never point to a file of another school or to an
// arbitrary URL, because only the server can sign it.
//
// Files that are never saved are deleted when the user removes them or leaves the form, and a
// sweep (scripts/cleanup-prepared-uploads.mjs) removes any left over after PREPARED_TTL_HOURS.

export const PREPARED_FOLDER = 'announcements/prepared'
export const PREPARED_TTL_HOURS = 24
export type PreparedKind = 'IMAGE' | 'PDF_PAGE'
export type PreparedUpload = { schoolId: string; url: string; name: string; mime: string; kind: PreparedKind; file: string }

// Derived key: an upload token is never a valid session token, and a session token is never a
// valid upload token.
function key(): Uint8Array {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET is not configured')
  return createHash('sha256').update(`${secret}:announcement-prepared-upload`).digest()
}

export async function signPreparedUpload(u: PreparedUpload): Promise<string> {
  return new SignJWT({ sid: u.schoolId, url: u.url, name: u.name, mime: u.mime, kind: u.kind, file: u.file })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience('announcement-prepared-upload')
    .setIssuedAt()
    .setExpirationTime(`${PREPARED_TTL_HOURS}h`)
    .sign(key())
}

/** The upload a token stands for, or null when it is invalid, expired or for another school. */
export async function verifyPreparedUpload(token: unknown, schoolId: string): Promise<PreparedUpload | null> {
  if (typeof token !== 'string' || token.length > 4000) return null
  try {
    const { payload: p } = await jwtVerify(token, key(), { audience: 'announcement-prepared-upload' })
    if (p.sid !== schoolId || typeof p.url !== 'string' || typeof p.file !== 'string' || !isPreparedFileName(p.file)) return null
    if (p.kind !== 'IMAGE' && p.kind !== 'PDF_PAGE') return null
    return { schoolId, url: p.url, name: String(p.name ?? '').slice(0, 200), mime: String(p.mime ?? ''), kind: p.kind, file: p.file }
  } catch { return null }
}

/** Server-chosen file names only: <uuid>.<ext>. */
export const isPreparedFileName = (name: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif)$/.test(name)
