'use client'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { confirmDialog } from '@/components/ui/ConfirmHost'

// Deleting a screen (SCHOOL_ADMIN and up, enforced by the API). The in-app dialog runs the request,
// so a double click cannot send it twice and an error is shown in the dialog.
export default function ScreenDeleteButton({ id, name }: { id: string; name: string }) {
  const router = useRouter()
  async function remove() {
    const ok = await confirmDialog({
      title: 'למחוק את המסך?',
      body: <>
        <p>המסך <b>״{name}״</b> והפריסה שלו יימחקו לצמיתות, כולל הצילום שלו. אי אפשר לבטל את הפעולה.</p>
        <p className="mt-2">ההודעות והתמונות במאגר יישארו. טלוויזיה שמחוברת למסך הזה תפסיק להציג אותו.</p>
      </>,
      confirmLabel: 'מחיקת המסך',
      action: async () => {
        const r = await fetch(`/api/screens/${encodeURIComponent(id)}`, { method: 'DELETE' })
        if (!r.ok) throw new Error(r.status === 403 ? 'רק מנהל בית הספר יכול למחוק מסכים' : r.status === 404 ? 'המסך לא נמצא. ייתכן שכבר נמחק.' : 'מחיקת המסך נכשלה. נסו שוב.')
      },
    })
    if (!ok) return
    toast.success('המסך נמחק')
    router.refresh()
  }
  return (
    <button type="button" onClick={remove} aria-label={`מחיקת המסך ${name}`}
      className="ui-focus flex items-center justify-center gap-1 rounded-ui-sm border border-red-200 bg-ui-surface px-3 py-2 text-xs text-ui-danger hover:bg-ui-danger-soft">
      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />מחיקה
    </button>
  )
}
