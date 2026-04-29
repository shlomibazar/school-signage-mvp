'use client'
// src/components/admin/layout/AdminTopBar.tsx

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut, ChevronDown, School } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AuthUser } from '@/types'

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN:  'מנהל ראשי',
  SCHOOL_ADMIN: 'מנהל בית ספר',
  EDITOR:       'עורך',
  VIEWER:       'צופה',
}

export default function AdminTopBar({ user }: { user: AuthUser }) {
  const router  = useRouter()
  const [open, setOpen]       = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleLogout() {
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
    <header className="h-14 bg-white border-b border-gray-100 flex items-center justify-between px-5 shrink-0">
      {/* Left: breadcrumb placeholder */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <School className="w-4 h-4" />
        <span className="text-gray-800 font-medium">
          {/* School name comes from user context in a real app */}
          לוח בקרה
        </span>
      </div>

      {/* Right: user menu */}
      <div className="relative">
        <button
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl hover:bg-gray-50 transition-colors"
        >
          {/* Avatar */}
          <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold">
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
              <button
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
    </header>
  )
}
