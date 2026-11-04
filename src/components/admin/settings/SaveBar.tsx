'use client'
import { Check, AlertCircle, Save } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export type SaveStatus = { kind: 'success' | 'error'; text: string } | null

// The bottom row of a settings card: what is (not) saved, and the card's own Save button.
// Each card saves only its own fields, so the button names what it saves.
export default function SaveBar({ label, dirty, saving, status, onSave, onReset, disabled }: {
  label: string
  dirty: boolean
  saving: boolean
  status: SaveStatus
  onSave: () => void
  onReset: () => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-col-reverse gap-3 rounded-b-ui-lg border-t border-ui-border bg-ui-subtle px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-[13px] empty:hidden" aria-live="polite">
        {dirty
          ? <span className="inline-flex items-center gap-1.5 font-medium text-amber-700"><span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />יש שינויים שלא נשמרו</span>
          : status?.kind === 'success'
            ? <span role="status" className="inline-flex items-center gap-1.5 text-ui-success"><Check className="h-4 w-4" aria-hidden="true" />{status.text}</span>
            : null}
        {status?.kind === 'error' && <span role="alert" className="mt-1 flex items-center gap-1.5 text-ui-danger sm:mt-0 sm:ms-3 sm:inline-flex"><AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />{status.text}</span>}
      </div>
      <div className="flex gap-2">
        {dirty && <Button variant="ghost" onClick={onReset} disabled={saving}>ביטול שינויים</Button>}
        <Button variant="primary" className="flex-1 sm:flex-none" onClick={onSave} loading={saving} disabled={!dirty || disabled}
          icon={<Save className="h-4 w-4" aria-hidden="true" />}>
          {saving ? 'שומר...' : label}
        </Button>
      </div>
    </div>
  )
}
