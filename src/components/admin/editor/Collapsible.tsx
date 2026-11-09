'use client'
import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

// A titled section of the editor that opens and closes (the "עיצוב" tab's group, shared by every tab
// and content form). The content stays unmounted while closed, so a closed section costs nothing.
export function EditorGroup({ icon: Icon, title, summary, defaultOpen = false, children }: {
  icon?: React.ComponentType<{ className?: string }>; title: string; summary?: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return (
    <section className="rounded-ui-lg border border-ui-border bg-ui-surface">
      <h3>
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-controls={id}
          className="ui-focus flex w-full items-center gap-3 rounded-ui-lg px-4 py-3 text-right hover:bg-ui-subtle">
          {Icon && <span className="grid h-8 w-8 shrink-0 place-items-center rounded-ui-sm bg-ui-subtle text-ui-ink-2"><Icon className="h-4 w-4" aria-hidden="true" /></span>}
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-ui-ink">{title}</span>
            {summary && <span className="block truncate text-xs text-ui-muted">{summary}</span>}
          </span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-ui-muted transition-transform', open && 'rotate-180')} aria-hidden="true" />
        </button>
      </h3>
      {open && <div id={id} className="border-t border-ui-border px-4 py-3">{children}</div>}
    </section>
  )
}

/** "אפשרויות נוספות": less common settings of a form, closed by default. */
export function MoreOptions({ title = 'אפשרויות נוספות', summary, children }: { title?: string; summary?: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <div className="rounded-ui border border-ui-border">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-controls={id}
        className="ui-focus flex w-full items-center gap-2 rounded-ui px-3 py-2 text-right text-[13px] font-medium text-ui-ink-2 hover:bg-ui-subtle">
        <span className="min-w-0 flex-1">{title}{summary && <span className="ms-2 text-xs font-normal text-ui-muted">{summary}</span>}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-ui-muted transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && <div id={id} className="space-y-3 border-t border-ui-border px-3 py-3">{children}</div>}
    </div>
  )
}
