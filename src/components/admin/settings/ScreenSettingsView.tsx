'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Power, Trash2 } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import ScreenSummaryCard, { type ScreenSettingsScreen } from './ScreenSummaryCard'
import ScreenHoursForm from './ScreenHoursForm'
import ScreenRefreshForm from './ScreenRefreshForm'
import { setScreenActive, deleteScreen } from '@/components/admin/screens/screenActions'
import type { ScreenSchedule } from '@/lib/screenSchedule'

// The settings page of one screen: general, operating hours, refresh (each saved on its own), and
// the management actions, kept apart at the bottom. Editing needs SCHOOL_ADMIN (as in the API);
// other roles see the values read-only.
export default function ScreenSettingsView({ screen, schedule, refreshSecs, timezone, schoolName, canEditContent, canAdmin }: {
  screen: ScreenSettingsScreen; schedule: ScreenSchedule; refreshSecs: number; timezone: string; schoolName?: string
  canEditContent: boolean; canAdmin: boolean
}) {
  const router = useRouter()
  const [active, setActive] = useState(screen.active)
  return (
    <div className="grid gap-4">
      <ScreenSummaryCard screen={screen} active={active} schoolName={schoolName} canEditContent={canEditContent} canAdmin={canAdmin} />
      {!canAdmin && <p className="rounded-ui-sm border border-ui-border bg-ui-surface px-4 py-2.5 text-[13px] text-ui-muted">לצפייה בלבד. שעות פעילות, רענון וניהול המסך משתנים על ידי מנהל בית הספר.</p>}
      <ScreenHoursForm screenId={screen.id} initial={schedule} timezone={timezone} canEdit={canAdmin} />
      <ScreenRefreshForm screenId={screen.id} initial={refreshSecs} canEdit={canAdmin} />
      {canAdmin && (
        <Card id="manage" className="scroll-mt-20 border-red-200">
          <CardHeader title="ניהול המסך" description="פעולות שמשפיעות על מה שהטלוויזיה מציגה" />
          <div className="divide-y divide-ui-border">
            <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ui-ink">{active ? 'השבתת המסך' : 'הפעלת המסך'}</p>
                <p className="text-[13px] text-ui-muted">{active ? 'המסך יפסיק להציג תוכן. הפריסה והתוכן נשמרים.' : 'המסך מושבת כרגע ואינו מציג תוכן.'}</p>
              </div>
              <Button icon={<Power className="h-4 w-4" aria-hidden="true" />} className="shrink-0"
                onClick={async () => { const next = await setScreenActive(screen, !active); if (next !== null) { setActive(next); router.refresh() } }}>
                {active ? 'השבתת המסך' : 'הפעלת המסך'}
              </Button>
            </div>
            <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ui-danger">מחיקת המסך</p>
                <p className="text-[13px] text-ui-muted">מחיקה לצמיתות של המסך, הפריסה והצילום שלו.</p>
              </div>
              <Button variant="danger-outline" icon={<Trash2 className="h-4 w-4" aria-hidden="true" />} className="shrink-0"
                onClick={async () => { if (await deleteScreen(screen)) { router.replace('/admin/screens'); router.refresh() } }}>
                מחיקת המסך
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
