'use client'
import toast from 'react-hot-toast'
import { confirmDialog } from '@/components/ui/ConfirmHost'

// Screen management actions (SCHOOL_ADMIN and up, enforced by the API). The requests run inside the
// in-app confirmation dialog, so they cannot be sent twice and errors are shown in the dialog.

async function patchActive(id: string, active: boolean) {
  const res = await fetch(`/api/screens/${encodeURIComponent(id)}/active`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active }),
  })
  if (!res.ok) throw new Error(res.status === 403 ? 'אין לך הרשאה לשנות את מצב המסך' : 'עדכון מצב המסך נכשל. נסו שוב.')
}

/** Disables (after confirming) or enables a screen. Resolves to the new state, or null if cancelled or failed. */
export async function setScreenActive(screen: { id: string; name: string }, active: boolean): Promise<boolean | null> {
  if (!active) {
    const ok = await confirmDialog({
      title: 'להשבית את המסך?',
      body: <>המסך <b>״{screen.name}״</b> יפסיק להציג תוכן עד שיופעל מחדש. הפריסה והתוכן נשמרים.</>,
      confirmLabel: 'השבתת המסך',
      action: () => patchActive(screen.id, false),
    })
    if (!ok) return null
    toast.success('המסך הושבת')
    return false
  }
  try { await patchActive(screen.id, true); toast.success('המסך הופעל'); return true }
  catch (e) { toast.error(e instanceof Error ? e.message : 'עדכון מצב המסך נכשל'); return null }
}

/** Deletes a screen after confirming. Resolves true when it was deleted. */
export async function deleteScreen(screen: { id: string; name: string }): Promise<boolean> {
  const ok = await confirmDialog({
    title: 'למחוק את המסך?',
    body: <>
      <p>המסך <b>״{screen.name}״</b> והפריסה שלו יימחקו לצמיתות, כולל הצילום שלו. אי אפשר לבטל את הפעולה.</p>
      <p className="mt-2">ההודעות והתמונות במאגר יישארו. טלוויזיה שמחוברת למסך הזה תפסיק להציג אותו.</p>
    </>,
    confirmLabel: 'מחיקת המסך',
    action: async () => {
      const r = await fetch(`/api/screens/${encodeURIComponent(screen.id)}`, { method: 'DELETE' })
      if (!r.ok) throw new Error(r.status === 403 ? 'רק מנהל בית הספר יכול למחוק מסכים' : r.status === 404 ? 'המסך לא נמצא. ייתכן שכבר נמחק.' : 'מחיקת המסך נכשלה. נסו שוב.')
    },
  })
  if (ok) toast.success('המסך נמחק')
  return ok
}
