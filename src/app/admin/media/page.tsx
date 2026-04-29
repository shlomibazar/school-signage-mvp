// src/app/admin/media/page.tsx
import { ImageIcon } from 'lucide-react'

export default function MediaPage() {
  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-semibold text-gray-900 mb-1">ספריית מדיה</h1>
      <p className="text-sm text-gray-500 mb-6">העלאה וניהול תמונות וסרטונים</p>
      <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-20 text-center">
        <ImageIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500 mb-1">ספריית המדיה תהיה זמינה בשלב 2</p>
        <p className="text-sm text-gray-400">כולל: העלאת תמונות, גלריות, סרטונים</p>
      </div>
    </div>
  )
}
