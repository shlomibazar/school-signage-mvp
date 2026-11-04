'use client'
import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Copies text: the clipboard API, then the older copy command (works where the API is blocked).
 *  If both fail, the given field's text is selected so it can be copied by hand. */
export async function copyText(text: string, fallbackInput?: HTMLInputElement | null): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true } catch { /* try the fallback */ }
  const previous = document.activeElement as HTMLElement | null
  const area = document.createElement('textarea')
  area.value = text; area.setAttribute('readonly', ''); area.style.position = 'fixed'; area.style.opacity = '0'
  document.body.appendChild(area); area.select()
  let ok = false
  try { ok = document.execCommand('copy') } catch { ok = false }
  area.remove()
  previous?.focus?.()
  if (!ok) fallbackInput?.select()
  return ok
}

/** A short "הועתק!" state after a successful copy. */
export function useCopied(ms = 2000) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const mark = () => { setCopied(true); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setCopied(false), ms) }
  return [copied, mark] as const
}

export function CopyButton({ copied, onClick, label = 'העתקה', className }: { copied: boolean; onClick: () => void; label?: string; className?: string }) {
  return (
    <button type="button" onClick={onClick} aria-live="polite"
      className={cn('ui-focus inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-ui-sm border px-3 text-sm font-medium transition-colors',
        copied ? 'border-green-200 bg-ui-success-soft text-ui-success' : 'border-ui-border-strong bg-ui-surface text-ui-ink-2 hover:bg-ui-subtle', className)}>
      {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
      {copied ? 'הועתק!' : label}
    </button>
  )
}

/** A read-only, left-to-right value (link or URL) with a copy button. Long values are cut with an
 *  ellipsis instead of wrapping; the whole value is in the field and is selected on focus. */
export function CopyField({ value, label }: { value: string; label: string }) {
  const input = useRef<HTMLInputElement>(null)
  const [copied, mark] = useCopied()
  const [manual, setManual] = useState(false)
  return (
    <div>
      <div className="flex items-center gap-2">
        <input ref={input} readOnly value={value} aria-label={label} dir="ltr" onFocus={e => e.currentTarget.select()}
          className="ui-focus h-10 min-w-0 flex-1 truncate rounded-ui-sm border border-ui-border-strong bg-ui-subtle px-3 font-mono text-[13px] text-ui-ink" />
        <CopyButton copied={copied} onClick={async () => { const ok = await copyText(value, input.current); setManual(!ok); if (ok) mark() }} />
      </div>
      {manual && <p role="status" className="mt-1.5 text-xs text-ui-muted">ההעתקה האוטומטית לא זמינה כאן. הטקסט סומן — העתיקו אותו ידנית (Ctrl+C).</p>}
    </div>
  )
}
