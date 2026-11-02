'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Power } from 'lucide-react'

type Props = {
  id: string
  initialActive: boolean
  canEdit: boolean
  screenName?: string
}

export default function ScreenActiveToggle({ id, initialActive, canEdit, screenName }: Props) {
  const router = useRouter()
  const [active, setActive] = useState(initialActive)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { setActive(initialActive) }, [initialActive])

  async function toggle() {
    if (busy || !canEdit) return
    const next = !active
    if (!next && !window.confirm(`האם להשבית את המסך${screenName ? ` ״${screenName}״` : ''}?\n\nהמסך יפסיק להציג תוכן עד להפעלה מחדש.`)) return

    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/screens/${encodeURIComponent(id)}/active`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: next }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'העדכון נכשל')
      setActive(next)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'העדכון נכשל')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${active ? 'text-green-700' : 'text-gray-600'}`}>
        <span aria-hidden="true" className={`h-2 w-2 rounded-full ${active ? 'bg-green-500' : 'bg-gray-400'}`} />
        {active ? 'המסך פעיל' : 'המסך מושבת'}
      </span>
      {canEdit && (
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          aria-label={active ? 'השבת מסך' : 'הפעל מסך'}
          className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-wait disabled:opacity-50 ${active ? 'border-red-200 bg-white text-red-700 hover:bg-red-50' : 'border-green-200 bg-white text-green-700 hover:bg-green-50'}`}
        >
          <Power className="h-3.5 w-3.5" aria-hidden="true" />
          {busy ? 'מעדכן...' : active ? 'השבת מסך' : 'הפעל מסך'}
        </button>
      )}
      {error && <span role="alert" className="text-xs text-red-600">{error}</span>}
    </div>
  )
}
