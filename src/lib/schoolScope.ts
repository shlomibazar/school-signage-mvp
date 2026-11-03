import { db } from '@/lib/db'
import type { AuthUser } from '@/types'

// Prisma `where` fragment limiting records to the user's school. SUPER_ADMIN is
// intentionally unscoped; any other user without a school matches nothing.
export function schoolWhere(user: Pick<AuthUser, 'role' | 'schoolId'>): { schoolId?: string } {
  return user.role === 'SUPER_ADMIN' ? {} : { schoolId: user.schoolId ?? '__none__' }
}

// For endpoints/pages that scope every user with a school to that school (SUPER_ADMIN
// included) and give only a SUPER_ADMIN without a school the global view. A non-SUPER_ADMIN
// user without a school matches nothing instead of everything.
export function homeSchoolWhere(user: Pick<AuthUser, 'role' | 'schoolId'> | null | undefined): { schoolId?: string } {
  if (user?.schoolId) return { schoolId: user.schoolId }
  return user?.role === 'SUPER_ADMIN' ? {} : { schoolId: '__none__' }
}

// A gallery may only be used by records of the same school (also for SUPER_ADMIN, so
// a screen or upload is never linked to another school's folder).
export async function galleryBelongsToSchool(galleryId: string, schoolId: string): Promise<boolean> {
  return !!(await db.gallery.findFirst({ where: { id: galleryId, schoolId }, select: { id: true } }))
}

// Content settings may reference folders, legacy single images and announcements by id.
// Returns false if any referenced id belongs to ANOTHER school (or the list is malformed),
// so the caller rejects before saving. Ids that no longer exist (e.g. a deleted
// announcement) are tolerated: they match nothing on the public screen, and rejecting
// them would block saving existing content.
export async function contentSettingsBelongToSchool(settings: Record<string, unknown> | null | undefined, schoolId: string): Promise<boolean> {
  if (!settings) return true
  const foreign: [string, (ids: string[]) => Promise<number>][] = [
    ['folderIds', ids => db.gallery.count({ where: { id: { in: ids }, schoolId: { not: schoolId } } })],
    ['imageIds', ids => db.mediaFile.count({ where: { id: { in: ids }, schoolId: { not: schoolId } } })],
    ['selectedAnnouncementIds', ids => db.announcement.count({ where: { id: { in: ids }, schoolId: { not: schoolId } } })],
  ]
  for (const [key, countForeign] of foreign) {
    const value = settings[key]
    if (value === undefined || value === null) continue
    if (!Array.isArray(value) || value.length > 500 || value.some(id => typeof id !== 'string')) return false
    const unique = [...new Set(value as string[])]
    if (unique.length && (await countForeign(unique)) > 0) return false
  }
  return true
}
