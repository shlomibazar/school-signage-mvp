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

/** True when it is fine to leave: nothing unsaved, or the user confirmed. */
export function confirmLeaveEditor(message = UNSAVED_MESSAGE): boolean {
  return !hasUnsavedEditorChanges() || window.confirm(message)
}
