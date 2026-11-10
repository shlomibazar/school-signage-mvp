'use client'
// src/components/admin/layout/AdminSidebar.tsx

import { useState, useEffect } from 'react'
import { confirmLeaveEditor as confirmLeave, hasUnsavedEditorChanges } from '@/lib/unsavedChanges'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, Monitor, PenSquare, Megaphone,
  ImageIcon, Users, Settings, LockKeyhole, HelpCircle, Menu, X, PanelRightClose, PanelRightOpen, Cake,
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
  // Users management is not built yet (/admin/users is a "phase 2" placeholder), so it is not
  // in the menu; add it back here when it exists:
  // { href: '/admin/users', label: 'משתמשים', icon: Users, section: 'ניהול', roles: ['SCHOOL_ADMIN', 'SUPER_ADMIN'] },
  // Editors manage the school's logo and weather city here (as the API allows); screen settings are
  // read-only for them.
  // Personal data (students and teachers): school admins only, as in /api/people.
  { href: '/admin/birthdays',     label: 'ימי הולדת',      icon: Cake,         section: 'ניהול', roles: ['SCHOOL_ADMIN', 'SUPER_ADMIN'] },
  { href: '/admin/settings',      label: 'הגדרות',         icon: Settings,     section: 'ניהול', roles: ['EDITOR', 'SCHOOL_ADMIN', 'SUPER_ADMIN'] },
  { href: '/admin/change-password', label: 'שינוי סיסמה', icon: LockKeyhole },
  // Help Center: static guides for every role (src/lib/help/topics.ts).
  { href: '/admin/help',            label: 'עזרה והדרכה', icon: HelpCircle },
]

// Title for the top bar: the menu item that owns the current path.
export function adminPageLabel(pathname: string): string {
  return NAV.find(item => pathname.startsWith(item.href))?.label ?? 'SchoolScreen'
}

// Unsaved changes (editor layout, content drafts, settings forms) (client-side links skip beforeunload): the
// navigation waits for the in-app confirmation and happens only when the user confirms.
function guardLeave(e: React.MouseEvent, go: () => void, done: () => void) {
  if (!hasUnsavedEditorChanges()) { done(); return }
  e.preventDefault()
  void confirmLeave('יש שינויים שלא נשמרו. לעזוב את הדף ולבטל אותם?').then(ok => { if (ok) { done(); go() } })
}

export default function AdminSidebar({ user }: { user: AuthUser }) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    try { setCollapsed(localStorage.getItem('schoolscreen-sidebar-collapsed') === 'true') } catch {}
  }, [])
  const toggleCollapsed = () => {
    setCollapsed(value => {
      try { localStorage.setItem('schoolscreen-sidebar-collapsed', String(!value)) } catch {}
      return !value
    })
  }

  // The mobile drawer always shows labels, even when the desktop sidebar is collapsed.
  const renderNav = (collapsed: boolean) => {
    let lastSection: string | undefined
    return (
    <nav className="flex-1 px-2 py-3 flex flex-col gap-0.5 overflow-y-auto">
      {NAV.map(item => {
        if (item.roles && !item.roles.includes(user.role)) return null

        const showSection = item.section && item.section !== lastSection
        if (item.section) lastSection = item.section

        const active = pathname.startsWith(item.href)
        const Icon   = item.icon

        return (
          <div key={item.href}>
            {showSection && !collapsed && (
              <div className="text-[11px] font-medium text-ui-faint px-2.5 pt-5 pb-1.5">
                {item.section}
              </div>
            )}
            <Link
              data-tour={`nav${item.href.split("/").join("-")}`}
              href={item.href}
              onClick={e => guardLeave(e, () => router.push(item.href), () => setMobileOpen(false))}
              title={collapsed ? item.label : undefined}
              className={cn(
                'ui-focus flex items-center gap-2.5 px-2.5 py-2 rounded-ui-sm text-sm transition-colors',
                active
                  ? 'bg-ui-primary-soft text-ui-primary-ink font-semibold'
                  : 'text-ui-ink-2 hover:bg-ui-subtle hover:text-ui-ink',
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && item.label}
            </Link>
          </div>
        )
      })}
    </nav>
    )
  }

  return (
    <>
      {/* Desktop sidebar — logical border: border-e = end-side = left in RTL */}
      <aside className={`hidden md:flex ${collapsed ? "w-16" : "w-56"} shrink-0 bg-ui-surface border-e border-ui-border flex-col transition-[width] duration-200`}>
        {/* Logo */}
        <div className="h-14 flex items-center gap-2.5 px-4 border-b border-ui-border shrink-0">
          <div className="w-7 h-7 rounded-lg bg-ui-primary flex items-center justify-center shrink-0">
            <Monitor className="w-4 h-4 text-white" />
          </div>
          {!collapsed && <span className="font-semibold text-[15px]">SchoolScreen</span>}
          <button type="button" onClick={toggleCollapsed} title={collapsed ? "הרחב תפריט" : "צמצם תפריט"} aria-label={collapsed ? "הרחב תפריט" : "צמצם תפריט"} className="ms-auto rounded-lg p-1 hover:bg-gray-100 text-gray-500">{collapsed ? <PanelRightOpen className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}</button>
        </div>

        {renderNav(collapsed)}

      </aside>

      {/* Mobile: hamburger button */}
      <button type="button"
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
          <aside className="md:hidden fixed inset-y-0 end-0 z-40 w-64 bg-ui-surface border-e border-ui-border flex flex-col shadow-xl">
            <div className="flex items-center gap-2.5 px-4 py-4 border-b border-ui-border">
              <div className="w-7 h-7 rounded-lg bg-ui-primary flex items-center justify-center">
                <Monitor className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-[15px]">SchoolScreen</span>
            </div>
            {renderNav(false)}
          </aside>
        </>
      )}
    </>
  )
}
