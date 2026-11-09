import { randomBytes } from 'crypto'
import { z } from 'zod'

// Shared by screen creation, rename and duplication (server only).

/** Display name of a screen: trimmed, so a name of spaces only is rejected (the admin forms apply the same rule). */
export const screenNameSchema = z.string().trim().min(2, 'שם המסך חייב להכיל לפחות 2 תווים').max(100, 'שם המסך יכול להכיל עד 100 תווים')

// Matches /^[a-z0-9-]+$/ and 2–50 chars. Latin names keep a readable prefix (Hebrew names
// fall back to "screen"); the random suffix keeps public URLs unique and hard to guess.
export function generateSlug(name: string): string {
  const base = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 30).replace(/-$/, '')
  return `${base.length >= 2 ? base : 'screen'}-${randomBytes(4).toString('hex')}`
}

export const isSlugConflict = (err: unknown) => {
  const e = err as { code?: string; meta?: { target?: unknown } } | null
  return e?.code === 'P2002' && [e?.meta?.target].flat().some(t => String(t).includes('slug'))
}
