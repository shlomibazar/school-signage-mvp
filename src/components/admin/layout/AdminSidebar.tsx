'use client'
// src/components/admin/layout/AdminSidebar.tsx

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Monitor, PenSquare, Megaphone,
  ImageIcon, Users, Settings, HelpCircle, Menu, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AuthUser } from '@/types'

interface NavItem {
  href:     string
  label:    string
  icon:     React.ComponentType<{ className?: string }>
  section?: string
  roles?:   string[]
}

const NAV: NavItem[] = [
  { href: '/admin/dashboard',     label: 'לוח בקרה',     icon: LayoutDashboard },
  { href: '/admin/screens',       label: 'מסכים',          icon: Monitor },
  { href: '/admin/editor',        label: 'עורך פריסה',    icon: PenSquare },
  { href: '/admin/announcements', label: 'הודעות',         icon: Megaphone,   section: 'תוכן' },
  { href: '/admin/media',         label: 'ספריית מדיה',   icon: ImageIcon },
  { href: '/admin/users',         label: 'משתמשים',        icon: Users,        section: 'ניהול', roles: ['SCHOOL_ADMIN', 'SUPER_ADMIN'] },
  { href: '/admin/settings',      label: 'הגדרות',         icon: Settings,     roles: ['SCHOOL_ADMIN', 'SUPER_ADMIN'] },
]

export default function AdminSidebar({ user }: { user: AuthUser }) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  let lastSection: string | undefined

  const navContent = (
    <nav className="flex-1 px-2 py-3 flex flex-col gap-0.5 overflow-y-auto">
      {NAV.map(item => {
        if (item.roles && !item.roles.includes(user.role)) return null

        const showSection = item.section && item.section !== lastSection
        if (item.section) lastSection = item.section

        const active = pathname.startsWith(item.href)
        const Icon   = item.icon

        return (
          <div key={item.href}>
            {showSection && (
              <div className="text-[10px] font-medium text-gray-400 px-2 pt-4 pb-1 uppercase tracking-wider">
                {item.section}
              </div>
            )}
            <Link
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] transition-colors',
                active
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {item.label}
            </Link>
          </div>
        )
      })}
    </nav>
  )

  return (
    <>
      {/* Desktop sidebar — logical border: border-e = end-side = left in RTL */}
      <aside className="hidden md:flex w-52 shrink-0 bg-white border-e border-gray-100 flex-col">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-gray-100 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
            <Monitor className="w-4 h-4 text-blue-600" />
          </div>
          <span className="font-semibold text-[15px]">SchoolScreen</span>
        </div>

        {navContent}

        {/* Help */}
        <div className="px-2 pb-3 shrink-0">
          <Link
            href="/admin/help"
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-gray-500 hover:bg-gray-50"
          >
            <HelpCircle className="w-4 h-4" />
            עזרה
          </Link>
        </div>
      </aside>

      {/* Mobile: hamburger button */}
      <button
        className="md:hidden fixed top-3 end-4 z-50 p-2 rounded-lg bg-white border border-gray-200 shadow-sm"
        onClick={() => setMobileOpen(v => !v)}
        aria-label="תפריט"
      >
        {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
      </button>

      {/* Mobile: slide-in drawer */}
      {mobileOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/30"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="md:hidden fixed inset-y-0 end-0 z-40 w-64 bg-white border-e border-gray-100 flex flex-col shadow-xl">
            <div className="flex items-center gap-2.5 px-4 py-4 border-b border-gray-100">
              <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
                <Monitor className="w-4 h-4 text-blue-600" />
              </div>
              <span className="font-semibold text-[15px]">SchoolScreen</span>
            </div>
            {navContent}
          </aside>
        </>
      )}
    </>
  )
}
