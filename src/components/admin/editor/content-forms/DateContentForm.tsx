'use client'
// src/components/admin/editor/content-forms/DateContentForm.tsx

import { formatHebrewDate, formatGregorianDate } from '@/lib/utils'

export default function DateContentForm() {
  const now       = new Date()
  const gregorian = formatGregorianDate(now)
  const hebrew    = formatHebrewDate(now)

  return (
    <div className="rounded-xl bg-gray-900 flex flex-col items-center justify-center py-8 gap-2">
      <div className="text-white text-lg font-medium">{gregorian}</div>
      <div className="text-white/50 text-sm">{hebrew}</div>
    </div>
  )
}
