// src/app/admin/users/page.tsx
import { Users } from 'lucide-react'

export default function UsersPage() {
  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-1">משתמשים</h1>
      <p className="text-sm text-gray-500 mb-6">ניהול משתמשים והרשאות</p>
      <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-20 text-center">
        <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500 mb-1">ניהול משתמשים יהיה זמין בשלב 2</p>
        <p className="text-sm text-gray-400">כולל: הזמנת משתמשים, הרשאות, תפקידים</p>
      </div>
    </div>
  )
}
