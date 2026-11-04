'use client'
import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { MoreVertical } from 'lucide-react'
import { cn } from '@/lib/utils'

// Compact "⋮" menu for secondary actions (menu button pattern): Enter/Space/ArrowDown open it on
// the first item, ArrowUp/ArrowDown/Home/End move between items, Escape closes it and returns
// focus to the button, Tab or a click outside closes it.
export type MenuItem =
  | { label: string; icon?: React.ReactNode; onSelect: () => void; tone?: 'danger'; href?: never }
  | { label: string; icon?: React.ReactNode; href: string; tone?: never; onSelect?: never }

export function ActionMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const itemsOf = () => [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
  const close = (focusButton = false) => { setOpen(false); if (focusButton) button.current?.focus() }

  useEffect(() => {
    if (!open) return
    itemsOf()[0]?.focus()
    const onPointer = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open])

  function onMenuKey(e: React.KeyboardEvent) {
    const list = itemsOf(), i = list.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length]?.focus() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus() }
    else if (e.key === 'Home') { e.preventDefault(); list[0]?.focus() }
    else if (e.key === 'End') { e.preventDefault(); list[list.length - 1]?.focus() }
    else if (e.key === 'Tab') setOpen(false)
  }
  const itemClass = (danger?: boolean) => cn('ui-focus flex w-full items-center gap-2.5 px-3 py-2.5 text-start text-sm outline-none',
    danger ? 'text-ui-danger hover:bg-ui-danger-soft focus:bg-ui-danger-soft' : 'text-ui-ink-2 hover:bg-ui-subtle focus:bg-ui-subtle')

  return (
    <div className="relative">
      <button ref={button} type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
        onClick={() => setOpen(v => !v)}
        onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true) } }}
        className="ui-focus grid h-10 w-10 place-items-center rounded-ui-sm border border-ui-border-strong bg-ui-surface text-ui-ink-2 hover:bg-ui-subtle">
        <MoreVertical className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <div ref={menu} id={id} role="menu" aria-label={label} onKeyDown={onMenuKey}
          className="absolute bottom-full end-0 z-30 mb-1.5 min-w-[11rem] overflow-hidden rounded-ui border border-ui-border bg-ui-surface py-1 shadow-ui-lg">
          {items.map(item => item.href
            ? <Link key={item.label} href={item.href} role="menuitem" tabIndex={-1} className={itemClass()} onClick={() => setOpen(false)}>{item.icon}{item.label}</Link>
            : <button key={item.label} type="button" role="menuitem" tabIndex={-1} className={itemClass(item.tone === 'danger')}
                onClick={() => { setOpen(false); item.onSelect?.() }}>{item.icon}{item.label}</button>)}
        </div>
      )}
    </div>
  )
}
