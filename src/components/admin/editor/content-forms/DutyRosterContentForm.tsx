'use client'
import { Field, Input, Select } from '@/components/ui/Field'

export type DutyRosterMode = 'auto' | 'day' | 'current' | 'next'
export type DutyRosterSettings = { title: string; mode: DutyRosterMode }
export const DEFAULT_DUTY_ROSTER: DutyRosterSettings = { title: 'תורנויות היום', mode: 'auto' }

const MODES: { id: DutyRosterMode; label: string }[] = [
  { id: 'auto', label: 'אוטומטי: ההפסקה הנוכחית, ובין ההפסקות הבאה' },
  { id: 'day', label: 'כל תורנויות היום (הנוכחית מודגשת)' },
  { id: 'current', label: 'ההפסקה הנוכחית בלבד' },
  { id: 'next', label: 'ההפסקה הבאה בלבד' },
]

// A region that shows the published duty roster of today. The roster itself is managed in
// "תורנויות" (admin menu); only published rosters appear on screens.
export default function DutyRosterContentForm({ settings, onSettings }: { settings: DutyRosterSettings; onSettings: (s: Partial<DutyRosterSettings>) => void }) {
  return (
    <div className="grid gap-3">
      <Field label="כותרת האזור" htmlFor="duty-title"><Input id="duty-title" value={settings.title} maxLength={60} onChange={e => onSettings({ title: e.target.value })} /></Field>
      <Field label="מה להציג" htmlFor="duty-mode">
        <Select id="duty-mode" value={settings.mode} onChange={e => onSettings({ mode: e.target.value as DutyRosterMode })}>
          {MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </Select>
      </Field>
      <p className="text-xs text-ui-muted">המסך מציג רק לוח תורנויות שפורסם. שינויים בטיוטה לא יופיעו עד הפרסום. את הלוח מנהלים בעמוד ״תורנויות״.</p>
    </div>
  )
}
