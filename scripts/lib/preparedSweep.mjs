// Decision logic of scripts/cleanup-prepared-uploads.mjs, kept separate so it can be unit tested.

/** Upload tokens expire after this many hours (must equal PREPARED_TTL_HOURS in src/lib/preparedUploads.ts). */
export const TOKEN_TTL_HOURS = 24
/** Extra wait after expiry, so a save that verified a token just before it expired has long
 *  committed (or failed) before its files can be considered unused. */
export const GRACE_HOURS = 2
export const MIN_AGE_MS = (TOKEN_TTL_HOURS + GRACE_HOURS) * 60 * 60 * 1000

export const CLOUDINARY_PREFIX = 'schoolscreen/announcements/prepared/'
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const LOCAL_NAME = new RegExp(`^${UUID}\\.(jpg|png|webp|gif)$`)
const CLOUD_ID = new RegExp(`^${CLOUDINARY_PREFIX.replace(/\//g, '\\/')}${UUID}$`)

/** Only server-chosen names directly inside the prepared folder are ever candidates. */
export const isLocalCandidate = name => LOCAL_NAME.test(name)
export const isCloudinaryCandidate = publicId => CLOUD_ID.test(publicId)
/** The uuid that identifies the file in an attachment URL. */
export const uuidOf = id => new RegExp(UUID).exec(id)?.[0] ?? null

/**
 * Decides and (with apply) deletes. files: [{ id, created (ms), remove() }].
 * isReferenced(uuid) → Promise<boolean>. Deletion errors are counted, not thrown.
 */
export async function sweep({ files, isReferenced, now = Date.now(), apply = false, log = () => {} }) {
  const r = { total: files.length, recent: 0, referenced: 0, invalid: 0, toDelete: 0, deleted: 0, failed: 0 }
  for (const f of files) {
    const uuid = uuidOf(f.id)
    if (!uuid) { r.invalid++; continue }
    if (!Number.isFinite(f.created) || now - f.created < MIN_AGE_MS) { r.recent++; continue }
    if (await isReferenced(uuid)) { r.referenced++; continue }
    r.toDelete++
    if (!apply) { log(`would delete ${f.id}`); continue }
    try { await f.remove(); r.deleted++; log(`deleted ${f.id}`) }
    catch (e) { r.failed++; log(`FAILED to delete ${f.id}: ${e instanceof Error ? e.message : e}`) }
  }
  return r
}
