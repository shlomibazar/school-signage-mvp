'use client'
import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Field, Select } from '@/components/ui/Field'
import SaveBar, { type SaveStatus } from './SaveBar'
import { REFRESH_CHOICES, isRefreshChoice, refreshLabel } from '@/lib/screenSettings'
import { useUnsavedChanges } from '@/lib/useUnsavedChanges'

// How often an open screen reloads its content (PATCH /api/screens/[id]/refresh, SCHOOL_ADMIN and
// up; the API accepts only 5, 10 or 15 minutes). A value stored before that rule is shown as is
// and kept until another value is chosen.
export default function ScreenRefreshForm({ screenId, initial, canEdit }: { screenId: string; initial: number; canEdit: boolean }) {
  const [saved, setSaved] = useState(initial)
  const [value, setValue] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<SaveStatus>(null)
  const busy = useRef(false)
  const dirty = value !== saved
  useUnsavedChanges(`settings:refresh:${screenId}`, dirty)

  async function save() {
    if (busy.current || !dirty || !canEdit || !isRefreshChoice(value)) return
    busy.current = true; setSaving(true); setStatus(null)
    try {
      const r = await fetch(`/api/screens/${encodeURIComponent(screenId)}/refresh`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshSecs: value }),
      })
      if (!r.ok) throw new Error(r.status === 403 ? 'אין לך הרשאה לשנות את תדירות הרענון' : r.status === 404 ? 'המסך לא נמצא' : 'שמירת תדירות הרענון נכשלה. נסו שוב.')
      setSaved(value)
      setStatus({ kind: 'success', text: 'נשמר. ייכנס לתוקף ברענון הבא של המסך.' })
      toast.success('תדירות הרענון נשמרה')
    } catch (e) {
      setStatus({ kind: 'error', text: e instanceof Error ? e.message : 'שמירת תדירות הרענון נכשלה' })
    } finally { busy.current = false; setSaving(false) }
  }

  return (
    <Card id="refresh" className="scroll-mt-20">
      <CardHeader title="רענון תוכן" description="כל כמה זמן מסך פתוח טוען מחדש את התוכן. לא משפיע על זמני המעבר בגלריות." />
      <CardBody>
        <Field label="תדירות רענון" htmlFor={`refresh-${screenId}`}>
          <Select id={`refresh-${screenId}`} className="sm:max-w-xs" value={value} disabled={!canEdit || saving}
            onChange={e => { setStatus(null); setValue(Number(e.target.value)) }}>
            {!isRefreshChoice(saved) && <option value={saved} disabled>{refreshLabel(saved)} (ערך ישן)</option>}
            {REFRESH_CHOICES.map(s => <option key={s} value={s}>{refreshLabel(s)}</option>)}
          </Select>
        </Field>
      </CardBody>
      {canEdit && <SaveBar label="שמירת תדירות רענון" dirty={dirty} saving={saving} status={status} onSave={save}
        onReset={() => { setValue(saved); setStatus(null) }} />}
    </Card>
  )
}
