// Merging a screen-editor save into a region's announcement list (settings.selectedAnnouncementIds).
//
// The screen editor sends the list it wants (`desired`) together with the list it loaded
// (`base`). Meanwhile the Announcements page may have changed the stored list (`current`).
// Only the editor's own changes (base → desired) are applied to the current list:
//   - ids the editor removed are removed, even if they are still in `current`;
//   - ids the editor added are appended to the end (if not already there);
//   - ids changed by someone else since `base` keep that change: a concurrent addition stays,
//     and an id removed concurrently (or deleted announcement) is not brought back, because the
//     editor did not add it.
// When nothing changed concurrently (current equals base) the editor's list is taken as is,
// including its order.

const unique = (ids: readonly string[]) => [...new Set(ids)]

export function mergeAnnouncementIds(current: readonly string[], base: readonly string[], desired: readonly string[]): string[] {
  const cur = unique(current), bas = unique(base), want = unique(desired)
  if (cur.length === bas.length && cur.every((id, i) => id === bas[i])) return want
  const baseSet = new Set(bas), wantSet = new Set(want)
  const removed = new Set(bas.filter(id => !wantSet.has(id)))
  const added = want.filter(id => !baseSet.has(id))
  const result = cur.filter(id => !removed.has(id))
  for (const id of added) if (!result.includes(id)) result.push(id)
  return result
}

/**
 * The settings to store when a content item is saved from the screen editor.
 * - Not an announcement region before or after the save: settings unchanged.
 * - Announcement region with `base`: the editor's changes are merged into the stored list.
 * - Announcement region without `base` that would change the stored list: a conflict, so an
 *   old or foreign client can never overwrite assignments made elsewhere. (Sending the stored
 *   list unchanged, or not sending the list at all, is fine.)
 */
export function editorAnnouncementSettings(
  stored: { contentType: string; settings: unknown } | null | undefined,
  contentType: string,
  settings: Record<string, unknown> | null | undefined,
  base: string[] | undefined,
): { settings: Record<string, unknown> | null | undefined } | { conflict: true } {
  if (!settings || contentType !== 'ANNOUNCEMENT' || stored?.contentType !== 'ANNOUNCEMENT') return { settings }
  const current = announcementIdsOf(stored.settings)
  if (!('selectedAnnouncementIds' in settings)) return { settings: { ...settings, selectedAnnouncementIds: current } }
  const desired = announcementIdsOf(settings)
  if (base) return { settings: { ...settings, selectedAnnouncementIds: mergeAnnouncementIds(current, base, desired) } }
  const same = desired.length === current.length && desired.every((id, i) => id === current[i])
  return same ? { settings } : { conflict: true }
}

export const announcementIdsOf =(settings: unknown): string[] => {
  const list = settings && typeof settings === 'object' && !Array.isArray(settings) ? (settings as Record<string, unknown>).selectedAnnouncementIds : undefined
  return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []
}
