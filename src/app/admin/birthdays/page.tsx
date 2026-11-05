import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { PageHeader } from '@/components/ui/Display'
import { Card } from '@/components/ui/Card'
import BirthdaysManager from '@/components/admin/birthdays/BirthdaysManager'
import { identityConfigured } from '@/lib/people/identity'

// Birthday people (students and teachers). Personal data: SCHOOL_ADMIN and up, own school only
// (the API enforces the same rules). The list is loaded by the client from /api/people, page by page.
export default async function BirthdaysPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')
  const allowed = user.role === 'SCHOOL_ADMIN' || user.role === 'SUPER_ADMIN'
  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title="ימי הולדת" description="תלמידים ומורים שימי ההולדת שלהם יוכלו להופיע במסכים" />
      {!allowed
        ? <Card className="p-6 text-sm text-ui-muted">ניהול רשימת ימי ההולדת מותר למנהלי בית הספר בלבד.</Card>
        : !user.schoolId
          ? <Card className="p-6 text-sm text-ui-muted">המשתמש אינו משויך לבית ספר, ולכן אין רשימה לניהול.</Card>
          : <>
            {/* Without PERSON_ID_KEY people can still be added, but not with an identifier. */}
            {!identityConfigured() && <Card role="alert" className="mb-4 border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-800">זיהוי לפי מספר זהות אינו מוגדר בשרת, ולכן לא ניתן לשמור רשומות עם מזהה. יש לפנות למנהל המערכת.</Card>}
            <BirthdaysManager />
          </>}
    </div>
  )
}
