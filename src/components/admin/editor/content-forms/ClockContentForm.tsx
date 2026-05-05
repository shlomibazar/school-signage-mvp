'use client'
// src/components/admin/editor/content-forms/ClockContentForm.tsx

export default function ClockContentForm() {
  return (
    <div className="rounded-xl bg-gray-900 flex items-center justify-center py-8">
      <div
        className="text-white font-light tabular-nums"
        style={{ fontSize: 48, letterSpacing: '-0.02em' }}
      >
        {new Date().getHours().toString().padStart(2, '0')}:
        {new Date().getMinutes().toString().padStart(2, '0')}
      </div>
    </div>
  )
}
