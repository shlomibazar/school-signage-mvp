'use client'
import { useEffect } from 'react'
import { setDraftDirty } from '@/lib/unsavedChanges'

/** Registers a form's unsaved changes with the shared mechanism in lib/unsavedChanges (the sidebar,
 *  top bar and in-page links ask before leaving) and warns before closing or reloading the tab. */
export function useUnsavedChanges(key: string, dirty: boolean) {
  useEffect(() => {
    setDraftDirty(key, dirty)
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [key, dirty])
  useEffect(() => () => setDraftDirty(key, false), [key])
}
