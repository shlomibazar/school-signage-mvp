// src/app/admin/screens/new/page.tsx
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import ViewOnlyNotice from '@/components/admin/ViewOnlyNotice'
import NewScreenForm from './NewScreenForm'

export default async function NewScreenPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')
  // Creating a screen needs EDITOR or higher (API rule); viewers get a notice.
  if (user.role === 'VIEWER') return <ViewOnlyNotice title="מסך חדש" />
  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold text-gray-900 mb-1">מסך חדש</h1>
      <p className="text-sm text-gray-500 mb-6">הגדר את פרטי המסך הבסיסיים. ניתן לשנות אחר כך.</p>
      <NewScreenForm />
    </div>
  )
}
