import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { getCurrentUser } from '@/lib/auth'
import { PageHeader } from '@/components/ui/Display'
import HelpButton from '@/components/admin/help/HelpButton'
import { Card } from '@/components/ui/Card'
import ImportWizard from '@/components/admin/birthdays/ImportWizard'

// Excel import of students or teachers. SCHOOL_ADMIN and up, own school only (as the API).
export default async function BirthdaysImportPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')
  const allowed = user.role === 'SCHOOL_ADMIN' || user.role === 'SUPER_ADMIN'
  return (
    <div className="mx-auto w-full max-w-5xl">
      <nav aria-label="מיקום" className="mb-2 flex items-center gap-1 text-[13px] text-ui-muted">
        <Link href="/admin/birthdays" className="ui-focus rounded hover:text-ui-ink">ימי הולדת</Link>
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        <span aria-current="page">ייבוא מאקסל</span>
      </nav>
      <PageHeader title="ייבוא מאקסל" description="הוספה ועדכון של תלמידים או מורים מקובץ xlsx. שום שינוי לא נשמר לפני אישור." actions={<HelpButton topic="birthdays" />} />
      {!allowed
        ? <Card className="p-6 text-sm text-ui-muted">ייבוא רשימות מותר למנהלי בית הספר בלבד.</Card>
        : !user.schoolId
          ? <Card className="p-6 text-sm text-ui-muted">המשתמש אינו משויך לבית ספר.</Card>
          : <ImportWizard />}
    </div>
  )
}
