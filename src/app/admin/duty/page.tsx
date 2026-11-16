import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { dutyAccessOf } from '@/lib/duty/rules'
import { PageHeader } from '@/components/ui/Display'
import { Card } from '@/components/ui/Card'
import DutyRosterAdmin from '@/components/admin/duty/DutyRosterAdmin'
import HelpButton from '@/components/admin/help/HelpButton'

// Duty roster management. Access is the roster permission (not the screen role): school admins
// always; other users only when granted (view, edit or publish). The API checks it again.
export default async function DutyPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')
  const access = dutyAccessOf(user)
  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader title="תורנויות" description="שיבוץ הצוות לתורנויות בהפסקות. המסכים מציגים רק לוח שפורסם." actions={<HelpButton topic="duty-roster" label="עזרה / איך משתמשים?" />} />
      {access === 'NONE' || !user.schoolId
        ? <Card className="p-6 text-sm text-ui-muted">{!user.schoolId ? 'המשתמש אינו משויך לבית ספר.' : 'אין לך הרשאה ללוח התורנויות. אפשר לבקש הרשאה ממנהל/ת בית הספר.'}</Card>
        : <DutyRosterAdmin access={access} isSchoolAdmin={user.role === 'SCHOOL_ADMIN' || user.role === 'SUPER_ADMIN'} />}
    </div>
  )
}
