// src/app/auth/login/page.tsx
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import LoginForm from './LoginForm'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { redirect?: string }
}) {
  const user = await getCurrentUser()
  if (user) redirect(searchParams.redirect ?? '/admin/dashboard')

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">📺</span>
          </div>
          <h1 className="text-xl font-semibold text-gray-900">SchoolScreen</h1>
          <p className="text-sm text-gray-500 mt-1">כניסה למערכת הניהול</p>
        </div>
        <LoginForm redirectTo={searchParams.redirect} />
      </div>
    </div>
  )
}
