'use client'
import { useRouter } from 'next/navigation'
import { confirmLeaveEditor, hasUnsavedEditorChanges } from '@/lib/unsavedChanges'

// Client-side links do not trigger beforeunload. Links inside this wrapper ask first (with the
// shared in-app dialog) while any form on the page has unsaved changes. The sidebar and top bar
// already do the same for their own links.
export default function UnsavedLinkGuard({ children, className }: { children: React.ReactNode; className?: string }) {
  const router = useRouter()
  function onClickCapture(e: React.MouseEvent) {
    if (!hasUnsavedEditorChanges() || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const a = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return
    const url = new URL(a.href, location.href)
    if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return
    e.preventDefault(); e.stopPropagation()
    void confirmLeaveEditor('יש שינויים שלא נשמרו. לעזוב את הדף ולבטל אותם?').then(ok => { if (ok) router.push(url.pathname + url.search + url.hash) })
  }
  return <div className={className} onClickCapture={onClickCapture}>{children}</div>
}
