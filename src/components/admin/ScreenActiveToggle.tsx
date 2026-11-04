'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Power } from 'lucide-react'
import toast from 'react-hot-toast'
import { confirmDialog } from '@/components/ui/ConfirmHost'
import { cn } from '@/lib/utils'

type Props = {
  id: string
  initialActive: boolean
  canEdit: boolean
  screenName?: string
}

async function setActive(id: string, active: boolean) {
  const res = await fetch(`/api/screens/${encodeURIComponent(id)}/active`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active }),
  })
  if (!res.ok) throw new Error(res.status === 403 ? 'אין לך הרשאה לשנות את מצב המסך' : 'עדכון מצב המסך נכשל. נסו שוב.')
}

// Screen status, and (for SCHOOL_ADMIN and up) disable/enable. Disabling asks first in the
// in-app dialog; the request runs inside the dialog, so it cannot be sent twice.
export default function ScreenActiveToggle({ id, initialActive, canEdit, screenName }: Props) {
  const router = useRouter()
  const [active, setActiveState] = useState(initialActive)
  const [busy, setBusy] = useState(false)

  useEffect(() => { setActiveState(initialActive) }, [initialActive])

  async function toggle() {
    if (busy || !canEdit) return
    const next = !active
    if (!next) {
      const ok = await confirmDialog({
        title: 'להשבית את המסך?',
        body: <>המסך {screenName ? <b>״{screenName}״</b> : null} יפסיק להציג תוכן עד שיופעל מחדש. הפריסה והתוכן נשמרים.</>,
        confirmLabel: 'השבתת המסך',
        action: () => setActive(id, false),
      })
      if (!ok) return
      setActiveState(false); toast.success('המסך הושבת'); router.refresh()
      return
    }
    setBusy(true)
    try { await setActive(id, true); setActiveState(true); toast.success('המסך הופעל'); router.refresh() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'עדכון מצב המסך נכשל') }
    finally { setBusy(false) }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', active ? 'text-ui-success' : 'text-ui-muted')}>
        <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', active ? 'bg-ui-success' : 'bg-ui-faint')} />
        {active ? 'המסך פעיל' : 'המסך מושבת'}
      </span>
      {canEdit && (
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          className={cn('ui-focus inline-flex items-center justify-center gap-1.5 rounded-ui-sm border bg-ui-surface px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-wait disabled:opacity-50',
            active ? 'border-red-200 text-ui-danger hover:bg-ui-danger-soft' : 'border-green-200 text-ui-success hover:bg-ui-success-soft')}
        >
          <Power className="h-3.5 w-3.5" aria-hidden="true" />
          {busy ? 'מעדכן...' : active ? 'השבתת מסך' : 'הפעלת מסך'}
        </button>
      )}
    </div>
  )
}
