// src/app/admin/layout.tsx
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import AdminSidebar from '@/components/admin/layout/AdminSidebar'
import AdminTopBar from '@/components/admin/layout/AdminTopBar'
import AdminPageScrollLock from '@/components/admin/layout/AdminPageScrollLock'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')

  return (
    <>
    <AdminPageScrollLock />
    <div className="flex h-dvh min-h-0 overflow-hidden bg-gray-50">
      <AdminSidebar user={user} />
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden min-w-0">
        <AdminTopBar user={user} />
        <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 lg:p-4 min-w-0">
          {children}
        </main>
      </div>
    </div>
    </>
  )
}
