// Removes announcement uploads that were prepared but never saved.
//
// Files chosen in the "new announcement" form are stored right away in the
// "announcements/prepared" folder and attached when the announcement is saved (see
// src/lib/preparedUploads.ts). The form discards unsaved files when it is cancelled or left;
// this sweep catches the rest (closed tab, crash, lost connection).
//
// A file is deleted only if ALL of these hold:
//   - it is in the prepared folder (nothing else is ever listed or touched);
//   - it is older than 24 hours (its upload token has expired, so it can no longer be saved);
//   - no announcement attachment refers to it.
//
// Dry run by default: prints what would be deleted. Pass --apply to delete.
// Uses STORAGE_PROVIDER, CLOUDINARY_* and DATABASE_URL from the environment (or .env).
//
//   node scripts/cleanup-prepared-uploads.mjs           # dry run
//   node scripts/cleanup-prepared-uploads.mjs --apply   # delete
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(ROOT, 'package.json'))
const APPLY = process.argv.includes('--apply')
const TTL_MS = 24 * 60 * 60 * 1000

// Load .env values that are not already in the environment.
const envFile = path.join(ROOT, '.env')
if (fs.existsSync(envFile)) for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)="?([^"]*)"?$/.exec(line.trim())
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]
}
const provider = process.env.STORAGE_PROVIDER || 'local'
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function candidates() {
  if (provider === 'local') {
    const dir = path.join(ROOT, 'public', 'uploads', 'announcements', 'prepared')
    if (!fs.existsSync(dir)) return []
    return fs.readdirSync(dir).filter(n => /^[0-9a-f-]{36}\.(jpg|png|webp|gif)$/.test(n)).map(name => ({
      id: name, url: `/uploads/announcements/prepared/${name}`, created: fs.statSync(path.join(dir, name)).mtimeMs,
      remove: () => fs.promises.unlink(path.join(dir, name)),
    }))
  }
  const cloud = process.env.CLOUDINARY_CLOUD_NAME, key = process.env.CLOUDINARY_API_KEY, secret = process.env.CLOUDINARY_API_SECRET
  if (!cloud || !key || !secret) throw new Error('Cloudinary is not configured')
  const auth = 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64')
  const prefix = 'schoolscreen/announcements/prepared/'
  const out = []
  let cursor
  do {
    const q = new URLSearchParams({ prefix, max_results: '500', type: 'upload' }); if (cursor) q.set('next_cursor', cursor)
    const r = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/resources/image/upload?${q}`, { headers: { Authorization: auth } })
    const d = await r.json()
    if (!r.ok) throw new Error(`Cloudinary list failed (${r.status}): ${d.error?.message ?? ''}`)
    for (const res of d.resources ?? []) {
      if (!res.public_id.startsWith(prefix)) continue
      out.push({
        id: res.public_id, url: res.secure_url, created: Date.parse(res.created_at),
        remove: async () => {
          const timestamp = Math.floor(Date.now() / 1000)
          const signature = crypto.createHash('sha1').update(`public_id=${res.public_id}&timestamp=${timestamp}${secret}`).digest('hex')
          const form = new FormData()
          form.append('public_id', res.public_id); form.append('timestamp', String(timestamp)); form.append('api_key', key); form.append('signature', signature)
          const x = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/image/destroy`, { method: 'POST', body: form })
          const y = await x.json().catch(() => ({}))
          if (!x.ok || (y.result !== 'ok' && y.result !== 'not found')) throw new Error(`delete failed: ${y.result ?? x.status}`)
        },
      })
    }
    cursor = d.next_cursor
  } while (cursor)
  return out
}

try {
  const files = await candidates()
  const now = Date.now()
  let kept = 0, deleted = 0
  for (const f of files) {
    const name = f.id.split('/').pop().replace(/\.[^.]+$/, '')
    const referenced = await db.announcementAttachment.count({ where: { url: { contains: name } } })
    if (referenced || now - f.created < TTL_MS) { kept++; continue }
    if (APPLY) { await f.remove(); deleted++; console.log('deleted', f.id) } else console.log('would delete', f.id)
  }
  console.log(`${provider}: ${files.length} prepared files, ${kept} kept (saved or recent), ${APPLY ? `${deleted} deleted` : `${files.length - kept} would be deleted (dry run; pass --apply)`}`)
} finally { await db.$disconnect() }
