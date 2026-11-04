// Removes announcement uploads that were prepared but never saved.
//
// Files chosen in the "new announcement" form are stored right away in the
// "announcements/prepared" folder and attached when the announcement is saved (see
// src/lib/preparedUploads.ts). The form discards unsaved files when it is cancelled or left;
// this sweep catches the rest (closed tab, crash, lost connection).
//
// A file is deleted only if ALL of these hold (see scripts/lib/preparedSweep.mjs):
//   - it is directly inside the prepared folder and has a server-chosen uuid name (nothing else
//     is listed: the Cloudinary listing is restricted to that prefix, the local one to that
//     directory, and every name is checked again);
//   - it is older than 26 hours: upload tokens expire after 24 hours, plus 2 hours of grace, so
//     no save that is still allowed to use the file can be running;
//   - no announcement attachment refers to it.
// Saved attachments, gallery media, logos and every other upload are outside that folder and
// are never listed.
//
// Dry run by default: prints what would be deleted. Pass --apply to delete. Not scheduled:
// run it by hand (or schedule it) once it has been reviewed for production.
// Uses STORAGE_PROVIDER, CLOUDINARY_* and DATABASE_URL from the environment (or .env).
// Exit code: 0 ok, 1 some deletions failed, 2 listing/setup error.
//
//   node scripts/cleanup-prepared-uploads.mjs           # dry run
//   node scripts/cleanup-prepared-uploads.mjs --apply   # delete
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { sweep, isLocalCandidate, isCloudinaryCandidate, CLOUDINARY_PREFIX, TOKEN_TTL_HOURS, GRACE_HOURS } from './lib/preparedSweep.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(ROOT, 'package.json'))
const APPLY = process.argv.includes('--apply')

// Load .env values that are not already in the environment.
const envFile = path.join(ROOT, '.env')
if (fs.existsSync(envFile)) for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)="?([^"]*)"?$/.exec(line.trim())
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]
}
const provider = process.env.STORAGE_PROVIDER || 'local'

async function listLocal() {
  const dir = path.join(ROOT, 'public', 'uploads', 'announcements', 'prepared')
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isFile() && isLocalCandidate(d.name)).map(d => ({
    id: d.name, created: fs.statSync(path.join(dir, d.name)).mtimeMs,
    remove: () => fs.promises.unlink(path.join(dir, d.name)),
  }))
}

async function listCloudinary() {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME, key = process.env.CLOUDINARY_API_KEY, secret = process.env.CLOUDINARY_API_SECRET
  if (!cloud || !key || !secret) throw new Error('Cloudinary is not configured')
  const auth = 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64')
  const out = []
  let cursor
  do {
    const q = new URLSearchParams({ prefix: CLOUDINARY_PREFIX, max_results: '500', type: 'upload' })
    if (cursor) q.set('next_cursor', cursor)
    const r = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/resources/image/upload?${q}`, { headers: { Authorization: auth }, signal: AbortSignal.timeout(60_000) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(`Cloudinary list failed (${r.status}): ${d.error?.message ?? 'unknown error'}`)
    for (const res of d.resources ?? []) {
      if (!isCloudinaryCandidate(res.public_id)) continue
      out.push({
        id: res.public_id, created: Date.parse(res.created_at),
        remove: async () => {
          const timestamp = Math.floor(Date.now() / 1000)
          const signature = crypto.createHash('sha1').update(`public_id=${res.public_id}&timestamp=${timestamp}${secret}`).digest('hex')
          const form = new FormData()
          form.append('public_id', res.public_id); form.append('timestamp', String(timestamp)); form.append('api_key', key); form.append('signature', signature)
          const x = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/image/destroy`, { method: 'POST', body: form, signal: AbortSignal.timeout(30_000) })
          const y = await x.json().catch(() => ({}))
          if (!x.ok || (y.result !== 'ok' && y.result !== 'not found')) throw new Error(`destroy returned ${y.result ?? x.status}`)
        },
      })
    }
    cursor = d.next_cursor
  } while (cursor)
  return out
}

const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()
let code = 0
try {
  const files = provider === 'local' ? await listLocal() : await listCloudinary()
  const isReferenced = async uuid => (await db.announcementAttachment.count({ where: { url: { contains: uuid } } })) > 0
  const r = await sweep({ files, isReferenced, apply: APPLY, log: m => console.log(m) })
  console.log(`${provider}${APPLY ? '' : ' (dry run; pass --apply to delete)'}: ${r.total} prepared files · ${r.recent} younger than ${TOKEN_TTL_HOURS + GRACE_HOURS}h · ${r.referenced} saved · ${r.toDelete} unused${APPLY ? ` · ${r.deleted} deleted · ${r.failed} failed` : ''}`)
  if (r.failed) code = 1
} catch (e) {
  console.error('ERROR:', e instanceof Error ? e.message : e)
  code = 2
} finally {
  await db.$disconnect()
}
process.exitCode = code
