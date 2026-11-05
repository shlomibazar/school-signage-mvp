import { createHmac, createHash } from 'node:crypto'

// Identity of people in the birthday module (server only).
//
// Sources identify people by an external identifier, usually an Israeli ID number (ת״ז). It is:
// - treated as a string (leading zeros kept, no checksum validation, letters allowed for passports);
// - normalized only by removing spaces, hyphens and dots and upper-casing letters;
// - never stored. Matching uses a keyed HMAC-SHA256 of the normalized value, bound to the school
//   (the same ID in two schools gives two unrelated keys) and to a key version (for rotation);
// - shown to admins only as its last 3 characters (identityHint).
//
// The key (PERSON_ID_KEY) must stay the same for the lifetime of the data: with another key, existing
// people are no longer matched and imports would create duplicates. It is required in production; in
// development a fixed key derived from JWT_SECRET is used (with a warning), so local data stays stable.

export const IDENTITY_KEY_VERSION = 1
const MAX_ID_LENGTH = 20

export class IdentityError extends Error {}

/** The identifier as stored for matching, or null when it is empty or malformed. */
export function normalizeExternalId(raw: unknown): string | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null
  // A number loses leading zeros before it gets here; sources must pass identifiers as text.
  const value = String(raw).trim().replace(/[\s\-.]/g, '').toUpperCase()
  if (!value || value.length > MAX_ID_LENGTH || !/^[0-9A-Z]+$/.test(value)) return null
  return value
}

let warned = false, reported = false
function personIdKey(): Buffer {
  const configured = process.env.PERSON_ID_KEY
  if (configured && configured.length >= 32) return Buffer.from(configured, 'utf8')
  if (process.env.NODE_ENV === 'production') {
    // Logged once, without any value. Requests get a fixed Hebrew 503 (see service.identityFor).
    if (!reported) { console.error(configured ? 'PERSON_ID_KEY is too short (at least 32 characters are required).' : 'PERSON_ID_KEY is not configured.'); reported = true }
    throw new IdentityError('PERSON_ID_KEY is not configured')
  }
  const jwt = process.env.JWT_SECRET
  if (!jwt) throw new IdentityError('PERSON_ID_KEY is not configured')
  if (!warned) { console.warn('PERSON_ID_KEY is not set; using a development key. Set it before using real data.'); warned = true }
  return createHash('sha256').update('dev-person-id-key:' + jwt).digest()
}

/** True when identity matching can be used (a key is available). */
export function identityConfigured(): boolean {
  try { personIdKey(); return true } catch { return false }
}

const hmac = (input: string) => createHmac('sha256', personIdKey()).update(input).digest('hex')

/** The school-scoped matching key of an identifier. */
export function identityKeyFor(schoolId: string, normalizedId: string): string {
  if (!schoolId || !normalizedId) throw new IdentityError('missing identity input')
  return hmac(`person-id:v${IDENTITY_KEY_VERSION}:${schoolId}:${normalizedId}`)
}

/** The last 3 characters of an identifier, for display ("•••123"). */
export function identityHintFor(normalizedId: string): string {
  return normalizedId.slice(-3)
}

/**
 * The key of a person's record within one source. Manual entries are keyed by the person; imported
 * records by a keyed HMAC of the source's own record identifier (which may itself be an ID number).
 */
export function sourceRecordKey(schoolId: string, sourceType: 'MANUAL' | 'EXCEL' | 'SMARTSCHOOL', recordId: string): string {
  if (sourceType === 'MANUAL') return `manual:${recordId}`
  return hmac(`person-source:v${IDENTITY_KEY_VERSION}:${schoolId}:${sourceType}:${recordId}`)
}
