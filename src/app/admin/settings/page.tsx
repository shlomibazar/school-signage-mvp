// src/app/admin/settings/page.tsx
import { Settings } from 'lucide-react'

export default function SettingsPage() {
  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-1">הגדרות</h1>
      <p className="text-sm text-gray-500 mb-6">הגדרות בית ספר וערכת נושא</p>
      <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-20 text-center">
        <Settings className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500 mb-1">הגדרות יהיו זמינות בשלב 2</p>
        <p className="text-sm text-gray-400">כולל: צבעים, לוגו, גופן, שם בית ספר</p>
      </div>
    </div>
  )
}
