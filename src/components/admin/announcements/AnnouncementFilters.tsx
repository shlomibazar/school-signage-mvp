'use client'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Select } from '@/components/ui/Field'

// Filters of the announcements list (status, screen). Kept in the URL so a filtered view can be
// reloaded or shared.
export default function AnnouncementFilters({ screens, statuses }: { screens: { id: string; name: string }[]; statuses: { id: string; label: string; count: number }[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(key, value); else next.delete(key)
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select aria-label="סינון לפי מצב" className="h-9 w-auto min-w-[150px]" value={params.get('status') ?? ''} onChange={e => set('status', e.target.value)}>
        <option value="">כל המצבים</option>
        {statuses.map(s => <option key={s.id} value={s.id}>{s.label} ({s.count})</option>)}
      </Select>
      <Select aria-label="סינון לפי מסך" className="h-9 w-auto min-w-[170px]" value={params.get('screen') ?? ''} onChange={e => set('screen', e.target.value)}>
        <option value="">כל המסכים</option>
        {screens.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </Select>
    </div>
  )
}
