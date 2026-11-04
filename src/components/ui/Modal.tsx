'use client'
import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'

// Accessible modal (role="dialog"): Escape and the backdrop close it, focus moves into it when it
// opens, Tab stays inside it, and focus returns to the trigger when it closes.
export function Modal({ open, title, description, onClose, children, size = 'md' }: {
  open: boolean; title: string; description?: React.ReactNode; onClose: () => void; children: React.ReactNode; size?: 'md' | 'lg'
}) {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const focusables = () => [...(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]),[href],input,select,textarea,[tabindex]:not([tabindex="-1"])') ?? [])]
    ;(panel.current?.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0])?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); close.current(); return }
      if (e.key !== 'Tab') return
      const items = focusables(); if (!items.length) return
      const first = items[0], last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); previous?.focus?.() }
  }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" dir="rtl">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-hidden="true" />
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className={`relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-ui-lg bg-ui-surface shadow-ui-lg sm:rounded-ui-lg ${size === 'lg' ? 'sm:max-w-xl' : 'sm:max-w-md'}`}>
        <div className="flex items-start justify-between gap-3 border-b border-ui-border px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[17px] font-bold text-ui-ink">{title}</h2>
            {description && <div className="mt-0.5 text-[13px] text-ui-muted">{description}</div>}
          </div>
          <button type="button" onClick={onClose} aria-label="סגירה" className="ui-focus -m-1 rounded-ui-sm p-1.5 text-ui-muted hover:bg-ui-subtle hover:text-ui-ink">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}
