'use client'

import { useRouter } from 'next/navigation'

export default function ScreenSelector({ currentId, screens }: { currentId: string; screens: { id: string; name: string }[] }) {
  const router = useRouter()
  return (
    <label dir="rtl" className="flex items-center gap-2 text-sm text-gray-600">
      <span className="shrink-0">מסך לעריכה:</span>
      <select aria-label="מסך לעריכה" value={currentId} onChange={event => {
        const next = event.target.value
        if (next !== currentId) {
          if (document.body.dataset.screenEditorDirty === 'true' && !window.confirm('יש שינויים שלא נשמרו. לעבור למסך אחר ולבטל אותם?')) { event.target.value = currentId; return }
          router.push(`/admin/editor?screen=${encodeURIComponent(next)}`)
          router.refresh()
        }
      }} className="max-w-56 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-gray-800">
        {screens.map(screen => <option key={screen.id} value={screen.id}>{screen.name}</option>)}
      </select>
    </label>
  )
}
