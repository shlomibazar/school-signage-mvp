// src/app/admin/layout.tsx
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import AdminSidebar from '@/components/admin/layout/AdminSidebar'
import AdminTopBar from '@/components/admin/layout/AdminTopBar'
import AdminPageScrollLock from '@/components/admin/layout/AdminPageScrollLock'
import { ConfirmHost } from '@/components/ui/ConfirmHost'
import TourHost from '@/components/admin/tour/TourHost'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/auth/login')

  return (
    <>
    <AdminPageScrollLock />
    {/* admin-ui scopes the admin design tokens (globals.css); the TV display never has it. */}
    <div className="admin-ui flex h-dvh min-h-0 overflow-hidden">
      <AdminSidebar user={user} />
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden min-w-0">
        <AdminTopBar user={user} />
        <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-4 lg:p-6 min-w-0">
          {children}
        </main>
      </div>
      {/* In-app confirmations (confirmDialog), inside admin-ui so they use the admin design tokens. */}
      <ConfirmHost />
      <TourHost />
    </div>
    </>
  )
}
