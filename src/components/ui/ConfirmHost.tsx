'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ConfirmDialog } from './Dialog'

// App-wide confirmation dialogs (instead of the browser's confirm()).
//
//   const ok = await confirmDialog({ title: 'למחוק?', confirmLabel: 'מחיקה' })
//
// With `action`, the action runs inside the open dialog: the confirm button shows a spinner and
// is disabled (no second submission), Escape/backdrop/cancel are blocked while it runs, and an
// error keeps the dialog open with the message so the user can retry or cancel. The promise
// resolves true only after the action succeeded, false when cancelled.
// Only one dialog at a time: a request while one is open resolves false (no stacked dialogs).
// <ConfirmHost /> is mounted once in the admin layout.

export type ConfirmOptions = {
  title: string
  body?: React.ReactNode
  confirmLabel: string
  cancelLabel?: string
  tone?: 'danger' | 'primary'
  action?: () => Promise<void>
}
type Request = ConfirmOptions & { resolve: (ok: boolean) => void }

let show: ((request: Request) => boolean) | null = null

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise(resolve => {
    // No host mounted (should not happen in the admin): refuse rather than act unconfirmed.
    if (!show || !show({ ...options, resolve })) resolve(false)
  })
}

const messageOf = (e: unknown) => e instanceof Error && e.message ? e.message : 'הפעולה נכשלה. נסו שוב.'

export function ConfirmHost() {
  const [request, setRequest] = useState<Request | null>(null)
  // The open request, readable synchronously (state updates are applied later).
  const current = useRef<Request | null>(null)
  const [busy, setBusy] = useState(false)
  // Guards a second click that arrives before the busy state has rendered.
  const running = useRef(false)
  const [error, setError] = useState('')
  useEffect(() => {
    show = next => {
      if (current.current) return false
      current.current = next
      setRequest(next)
      return true
    }
    return () => { show = null }
  }, [])
  const close = useCallback((ok: boolean) => {
    current.current?.resolve(ok)
    current.current = null
    setRequest(null)
    setBusy(false); setError('')
  }, [])
  const cancel = useCallback(() => { if (!running.current) close(false) }, [close])
  const confirm = useCallback(async () => {
    if (!request || running.current) return
    if (!request.action) { close(true); return }
    running.current = true
    setBusy(true); setError('')
    try { await request.action(); close(true) }
    catch (e) { setError(messageOf(e)); setBusy(false) }
    finally { running.current = false }
  }, [request, close])
  return (
    <ConfirmDialog open={!!request} title={request?.title ?? ''} confirmLabel={request?.confirmLabel ?? 'אישור'}
      cancelLabel={request?.cancelLabel} tone={request?.tone ?? 'danger'} busy={busy} error={error}
      onConfirm={confirm} onCancel={cancel}>
      {request?.body}
    </ConfirmDialog>
  )
}
