'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

// "רענון סטטוסים": reloads the screens list data from the server (router.refresh: no full page
// reload, no polling). Statuses are recomputed there from the server's current time.
export default function ConnectionRefresh({ checkedAt }: { checkedAt: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <span className="inline-flex items-center gap-2">
      <span className="hidden text-xs text-ui-muted sm:inline" aria-live="polite">{pending ? 'מרענן…' : `עודכן ${checkedAt}`}</span>
      <button type="button" onClick={() => start(() => router.refresh())} disabled={pending}
        className="ui-focus inline-flex h-10 items-center gap-1.5 rounded-ui-sm border border-ui-border-strong bg-ui-surface px-3 text-sm text-ui-ink-2 hover:bg-ui-subtle disabled:opacity-60">
        <RefreshCw className={cn('h-4 w-4', pending && 'animate-spin')} aria-hidden="true" />רענון סטטוסים
      </button>
    </span>
  )
}
