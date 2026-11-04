'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/Dialog'

// Deletes an announcement everywhere, after an in-app confirmation that lists the screens it is
// shown on. (Removing it from one screen is done in "where to display", not here.)
export default function AnnouncementDeleteButton({ id, title, shownOn = [], redirectTo, size = 'sm' }: {
  id: string; title: string; shownOn?: string[]; redirectTo?: string; size?: 'sm' | 'md'
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  async function remove() {
    setBusy(true)
    try {
      const r = await fetch(`/api/announcements/${id}`, { method: 'DELETE' })
      if (!r.ok) throw Error()
      toast.success('ההודעה נמחקה')
      setOpen(false)
      if (redirectTo) router.push(redirectTo)
      router.refresh()
    } catch { toast.error('מחיקת ההודעה נכשלה') } finally { setBusy(false) }
  }
  return <>
    <Button variant={size === 'md' ? 'danger-outline' : 'ghost'} size={size} className={size === 'sm' ? 'text-ui-danger' : undefined} icon={<Trash2 className="h-4 w-4" />} onClick={() => setOpen(true)}>מחיקה</Button>
    <ConfirmDialog open={open} busy={busy} title="למחוק את ההודעה?" confirmLabel={shownOn.length ? 'מחיקה מכל המסכים' : 'מחיקה'} onConfirm={remove} onCancel={() => setOpen(false)}>
      <p>ההודעה <b>״{title}״</b> תימחק לצמיתות, כולל הקבצים המצורפים אליה.</p>
      {shownOn.length > 0 && <>
        <p className="mt-2">היא תוסר מכל המסכים שבהם היא מוצגת:</p>
        <ul className="mt-2 grid gap-1">{shownOn.map(s => <li key={s} className="rounded-ui-sm bg-ui-subtle px-2.5 py-1 text-[13px]">{s}</li>)}</ul>
        <p className="mt-2 text-xs text-ui-muted">כדי להוריד אותה ממסך אחד בלבד, בטלו את הסימון שלו ב״איפה להציג״ בעריכת ההודעה.</p>
      </>}
    </ConfirmDialog>
  </>
}
