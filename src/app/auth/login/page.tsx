import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import LoginForm from './LoginForm'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { from?: string; redirect?: string }
}) {
  const user = await getSession()
  if (user) redirect(searchParams.from ?? searchParams.redirect ?? '/admin/dashboard')

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50" dir="rtl">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">SchoolScreen</h1>
          <p className="text-gray-500 mt-1 text-sm">מערכת שילוט דיגיטלי לבתי ספר</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <LoginForm />
        </div>
      </div>
    </div>
  )
}
