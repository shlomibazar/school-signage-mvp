'use client'
// src/components/admin/layout/AdminTopBar.tsx

import { useState } from 'react'
import { confirmLeaveEditor } from '@/lib/unsavedChanges'
import { useRouter, usePathname } from 'next/navigation'
import { LogOut, ChevronDown, School, Compass } from 'lucide-react'
import { pageTour } from '@/lib/tour/tours'
import { startTour } from '@/components/admin/tour/TourHost'
import { cn } from '@/lib/utils'
import type { AuthUser } from '@/types'
import { adminPageLabel } from './AdminSidebar'

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN:  'מנהל ראשי',
  SCHOOL_ADMIN: 'מנהל בית ספר',
  EDITOR:       'עורך',
  VIEWER:       'צופה',
}

export default function AdminTopBar({ user }: { user: AuthUser }) {
  const router  = useRouter()
  const pathname = usePathname()
  const [open, setOpen]       = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleLogout() {
    if (!(await confirmLeaveEditor())) return
    setLoading(true)
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/auth/login')
    router.refresh()
  }

  const initials = user.name
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')

  return (
    // On mobile, leave room at the end side for the fixed menu button (AdminSidebar).
    <header className="h-14 bg-ui-surface border-b border-ui-border flex items-center justify-between ps-5 pe-16 md:pe-5 shrink-0">
      {/* Current page title */}
      <div className="flex items-center gap-2 text-sm text-ui-muted min-w-0">
        <School className="w-4 h-4 shrink-0" />
        <span className="text-ui-ink font-semibold truncate">
          {adminPageLabel(pathname)}
        </span>
      </div>

      <div className="flex items-center gap-1">
      {/* Short guided tour of the current page (admin only; the TV display has no admin layout). */}
      {(() => { const t = pageTour(pathname ?? ''); return t && (
        <button type="button" onClick={() => startTour(t.id, t.step)}
          className="ui-focus inline-flex items-center gap-1.5 rounded-ui-sm px-2.5 py-1.5 text-[13px] text-ui-muted hover:bg-ui-subtle hover:text-ui-primary">
          <Compass className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">הדרכה לעמוד זה</span><span className="sr-only sm:hidden">הדרכה לעמוד זה</span>
        </button>) })()}
      {/* Right: user menu */}
      <div className="relative">
        <button type="button"
          onClick={() => setOpen(v => !v)}
          className="ui-focus flex items-center gap-2.5 px-3 py-1.5 rounded-ui hover:bg-ui-subtle transition-colors"
        >
          {/* Avatar */}
          <div className="w-7 h-7 rounded-full bg-ui-primary-soft text-ui-primary-ink flex items-center justify-center text-xs font-semibold">
            {initials}
          </div>
          <div className="text-start hidden sm:block">
            <div className="text-sm font-medium text-gray-800 leading-none">{user.name}</div>
            <div className="text-xs text-gray-400 mt-0.5">{ROLE_LABELS[user.role] ?? user.role}</div>
          </div>
          <ChevronDown className={cn('w-3.5 h-3.5 text-gray-400 transition-transform', open && 'rotate-180')} />
        </button>

        {/* Dropdown */}
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute end-0 top-full mt-1.5 w-48 bg-white border border-gray-100 rounded-xl shadow-lg z-20 py-1 overflow-hidden">
              <div className="px-3 py-2 border-b border-gray-50">
                <div className="text-xs font-medium text-gray-800">{user.name}</div>
                <div className="text-xs text-gray-400">{user.email}</div>
              </div>
              <button type="button"
                onClick={handleLogout}
                disabled={loading}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                <LogOut className="w-3.5 h-3.5" />
                {loading ? 'יוצא...' : 'התנתקות'}
              </button>
            </div>
          </>
        )}
      </div>
      </div>
    </header>
  )
}
