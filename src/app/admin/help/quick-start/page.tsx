import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { PageHeader } from '@/components/ui/Display'
import QuickStartChecklist from '@/components/admin/help/QuickStartChecklist'

export default function QuickStartPage() {
  return (
    <div className="mx-auto w-full max-w-3xl" dir="rtl">
      <Link href="/admin/help" className="ui-focus mb-3 inline-flex items-center gap-1 rounded text-sm text-ui-primary hover:underline">
        <ArrowRight className="h-4 w-4" aria-hidden="true" />כל נושאי העזרה
      </Link>
      <PageHeader title="התחלה מהירה" description="מיצירת המסך הראשון ועד טלוויזיה שמציגה אותו. לכל שלב יש קישור לעמוד המתאים ולהסבר מפורט." />
      <QuickStartChecklist />
    </div>
  )
}
