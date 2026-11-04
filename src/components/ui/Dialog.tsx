'use client'
import { useEffect, useId, useRef } from 'react'
import { Button } from './Button'

// In-app confirmation dialog (replaces the browser's confirm()). Escape and the backdrop cancel;
// focus moves to the safe (cancel) button when it opens and returns to the trigger when it closes.
export function ConfirmDialog({ open, title, children, confirmLabel, cancelLabel = 'ביטול', tone = 'danger', busy = false, onConfirm, onCancel }: {
  open: boolean; title: string; children?: React.ReactNode; confirmLabel: string; cancelLabel?: string
  tone?: 'danger' | 'primary'; busy?: boolean; onConfirm: () => void; onCancel: () => void
}) {
  const titleId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onCancel() }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); previous?.focus?.() }
  }, [open, busy, onCancel])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-slate-900/30" onClick={() => { if (!busy) onCancel() }} />
      <div role="alertdialog" aria-modal="true" aria-labelledby={titleId} className="relative w-full max-w-md rounded-ui-lg bg-ui-surface shadow-ui-lg">
        <div className="px-6 pb-4 pt-5">
          <h2 id={titleId} className="text-[17px] font-bold text-ui-ink">{title}</h2>
          {children && <div className="mt-2 text-sm leading-relaxed text-ui-ink-2">{children}</div>}
        </div>
        <div className="flex gap-2.5 rounded-b-ui-lg border-t border-ui-border bg-ui-subtle px-6 py-3.5">
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} loading={busy} onClick={onConfirm}>{confirmLabel}</Button>
          <Button ref={cancelRef} variant="secondary" disabled={busy} onClick={onCancel}>{cancelLabel}</Button>
        </div>
      </div>
    </div>
  )
}
