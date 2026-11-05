'use client'
import { useState } from 'react'
import { Camera, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { hasUnsavedEditorChanges } from '@/lib/unsavedChanges'
import { snapshotShortTime as when } from '@/lib/snapshotTime'

// "עדכן צילום": captures the live preview of the saved screen and stores it as the snapshot shown
// in the screens list. Only on click; never automatically on save.
export default function SnapshotButton({ screenId, getStage, dirty, initialSnapshotAt, onCapturingChange }: {
  screenId: string
  getStage: () => HTMLElement | null
  dirty: boolean
  initialSnapshotAt?: string | null
  /** Lets the editor hide its own marks (the selected-region outline) while the stage is captured. */
  onCapturingChange?: (capturing: boolean) => void
}) {
  const [busy, setBusy] = useState(false)
  const [last, setLast] = useState(initialSnapshotAt ?? null)
  async function capture() {
    if (busy) return
    // The preview also shows unsaved drafts; a snapshot must show what the TV shows.
    if (dirty || hasUnsavedEditorChanges()) { toast.error('יש שינויים שלא נשמרו. שמרו אותם לפני עדכון הצילום.'); return }
    const stage = getStage()
    if (!stage) { toast.error('התצוגה המקדימה עדיין לא מוכנה'); return }
    setBusy(true)
    onCapturingChange?.(true)
    try {
      // Two frames: the editor re-renders without its marks before the stage is read.
      await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))
      const { captureScreenStage } = await import('@/lib/screenSnapshotCapture')
      const shot = await captureScreenStage(stage)
      const form = new FormData()
      form.append('file', shot.blob, 'snapshot.jpg')
      const r = await fetch(`/api/screens/${encodeURIComponent(screenId)}/snapshot`, { method: 'POST', body: form })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || `שמירת הצילום נכשלה (${r.status})`)
      setLast(d.data?.snapshotAt ?? new Date().toISOString())
      toast.success('הצילום עודכן ויוצג ברשימת המסכים')
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : 'יצירת הצילום נכשלה')
    } finally { onCapturingChange?.(false); setBusy(false) }
  }
  return (
    <button type="button" onClick={capture} disabled={busy}
      title={last ? `צילום אחרון: ${when(last)}` : 'עדיין אין צילום למסך הזה'}
      className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-60">
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
      {busy ? 'מצלם...' : 'עדכן צילום'}
    </button>
  )
}
