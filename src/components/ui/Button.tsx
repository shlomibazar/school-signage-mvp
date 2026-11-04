import { forwardRef } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// Admin buttons (Modern Minimal). One primary action per area; secondary for the rest;
// ghost for low-emphasis actions; danger only for destructive confirmations.
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-outline'
type Size = 'sm' | 'md'

const base = 'ui-focus inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-ui-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50'
const variants: Record<Variant, string> = {
  primary: 'bg-ui-primary text-white shadow-ui hover:bg-ui-primary-hover',
  secondary: 'border border-ui-border-strong bg-ui-surface text-ui-ink-2 hover:bg-ui-subtle',
  ghost: 'text-ui-ink-2 hover:bg-ui-subtle',
  danger: 'bg-ui-danger text-white hover:bg-ui-danger-hover',
  'danger-outline': 'border border-red-200 bg-ui-surface text-ui-danger hover:bg-ui-danger-soft',
}
const sizes: Record<Size, string> = { sm: 'h-8 px-3 text-[13px]', md: 'h-10 px-4 text-sm' }

export function buttonClass(variant: Variant = 'secondary', size: Size = 'md', className?: string) {
  return cn(base, variants[variant], sizes[size], className)
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean; icon?: React.ReactNode }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading = false, icon, className, children, disabled, type = 'button', ...rest }, ref,
) {
  return (
    <button ref={ref} type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={buttonClass(variant, size, className)} {...rest}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : icon}
      {children}
    </button>
  )
})

/** A link styled as a button (navigation, e.g. "New announcement"). */
export function ButtonLink({ href, variant = 'secondary', size = 'md', icon, className, children }: { href: string; variant?: Variant; size?: Size; icon?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return <Link href={href} className={buttonClass(variant, size, className)}>{icon}{children}</Link>
}
