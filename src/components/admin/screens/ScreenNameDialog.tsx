'use client'
import { useEffect, useId, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

// A screen name: rename or duplicate. Same rule as the server (2–100 characters, trimmed); the
// request runs here, so it cannot be sent twice and its error is shown in the dialog.
export default function ScreenNameDialog({ open, title, description, initialName, confirmLabel, requireChange = false, onClose, onSubmit }: {
  open: boolean; title: string; description?: React.ReactNode; initialName: string; confirmLabel: string
  /** Rename: saving the same name is disabled. */
  requireChange?: boolean
  onClose: () => void
  /** Resolves when done; throws an Error whose message is shown in the dialog. */
  onSubmit: (name: string) => Promise<void>
}) {
  const id = useId()
  const [name, setName] = useState(initialName)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { if (open) { setName(initialName); setError(''); setBusy(false) } }, [open, initialName])
  const trimmed = name.trim()
  const invalid = trimmed.length < 2 ? 'שם המסך חייב להכיל לפחות 2 תווים' : trimmed.length > 100 ? 'שם המסך יכול להכיל עד 100 תווים' : ''

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    if (invalid) { setError(invalid); return }
    setBusy(true); setError('')
    try { await onSubmit(trimmed) }
    catch (err) { setError(err instanceof Error ? err.message : 'הפעולה נכשלה. נסו שוב.'); setBusy(false) }
  }

  return (
    <Modal open={open} onClose={() => { if (!busy) onClose() }} title={title} description={description}>
      <form onSubmit={submit} className="grid gap-3">
        <label htmlFor={id} className="text-[13px] font-semibold text-ui-ink-2">שם המסך</label>
        <input id={id} data-autofocus value={name} maxLength={120} onChange={e => { setName(e.target.value); setError('') }}
          aria-invalid={!!error || undefined} aria-describedby={error ? `${id}-error` : undefined}
          className={`ui-focus h-10 w-full rounded-ui-sm border bg-ui-surface px-3 text-sm ${error ? 'border-ui-danger' : 'border-ui-border-strong'}`} />
        {error && <p id={`${id}-error`} role="alert" className="text-xs text-ui-danger">{error}</p>}
        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>ביטול</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={busy || (requireChange && trimmed === initialName.trim())}>{confirmLabel}</Button>
        </div>
      </form>
    </Modal>
  )
}
