// Unsaved work in the screen editor, visible to navigation that lives outside it (sidebar,
// screen selector, logout). Two sources: the layout itself (ScreenLayoutEditor sets
// body[data-screen-editor-dirty]) and open content forms with unsaved drafts (registered here).
// Navigation asks once, whichever of them is dirty.

export const UNSAVED_MESSAGE = 'יש שינויים שלא נשמרו. לעזוב בלי לשמור?'

const dirtyDrafts = new Set<string>()

export function setDraftDirty(id: string, dirty: boolean) {
  if (dirty) dirtyDrafts.add(id)
  else dirtyDrafts.delete(id)
  if (typeof document === 'undefined') return
  if (dirtyDrafts.size) document.body.dataset.contentDraftDirty = 'true'
  else delete document.body.dataset.contentDraftDirty
}

export function isDraftDirty(id: string): boolean {
  return dirtyDrafts.has(id)
}

export const DISCARD_DRAFT_MESSAGE = 'יש שינויים בתוכן שלא נשמרו. לבטל אותם?'

export function hasUnsavedEditorChanges(): boolean {
  if (typeof document === 'undefined') return false
  return document.body.dataset.screenEditorDirty === 'true' || document.body.dataset.contentDraftDirty === 'true'
}

/** True when it is fine to leave: nothing unsaved, or the user confirmed in the in-app dialog.
 *  (Closing or reloading the tab is still guarded by the browser's own beforeunload prompt.) */
export async function confirmLeaveEditor(message = UNSAVED_MESSAGE): Promise<boolean> {
  if (!hasUnsavedEditorChanges()) return true
  const { confirmDialog } = await import('@/components/ui/ConfirmHost')
  return confirmDialog({ title: 'לעזוב בלי לשמור?', body: message, confirmLabel: 'יציאה בלי שמירה', cancelLabel: 'המשך עריכה' })
}

/** Asks before discarding an open content form with unsaved changes. */
export async function confirmDiscardDraft(): Promise<boolean> {
  const { confirmDialog } = await import('@/components/ui/ConfirmHost')
  return confirmDialog({ title: 'לבטל את השינויים?', body: DISCARD_DRAFT_MESSAGE, confirmLabel: 'ביטול השינויים', cancelLabel: 'המשך עריכה' })
}
