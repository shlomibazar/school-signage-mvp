import { forwardRef, useId } from 'react'
import { cn } from '@/lib/utils'

// Form controls (Modern Minimal). A Field renders the label, an optional hint and an error,
// and connects them to the control (id / aria-describedby / aria-invalid).

const control = 'ui-focus w-full rounded-ui-sm border bg-ui-surface px-3 text-sm text-ui-ink placeholder:text-ui-faint transition-colors disabled:cursor-not-allowed disabled:bg-ui-subtle disabled:text-ui-muted'
const controlState = (invalid?: boolean) => invalid ? 'border-ui-danger' : 'border-ui-border-strong focus:border-ui-primary'

export function Field({ label, hint, error, children, className, htmlFor }: { label: React.ReactNode; hint?: React.ReactNode; error?: string; children: React.ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={cn('grid gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-semibold text-ui-ink-2">{label}</label>
      {children}
      {error ? <p role="alert" className="text-xs text-ui-danger">{error}</p> : hint ? <p className="text-xs text-ui-muted">{hint}</p> : null}
    </div>
  )
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ invalid, className, ...rest }, ref) {
  return <input ref={ref} aria-invalid={invalid || undefined} className={cn(control, controlState(invalid), 'h-10', className)} {...rest} />
})

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ invalid, className, children, ...rest }, ref) {
  return <select ref={ref} aria-invalid={invalid || undefined} className={cn(control, controlState(invalid), 'h-10 pe-8', className)} {...rest}>{children}</select>
})

/** Checkbox with its label on the same line (a whole-row click target). */
export function Checkbox({ label, description, className, ...rest }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: React.ReactNode; description?: React.ReactNode }) {
  const id = useId()
  return (
    <label htmlFor={rest.id ?? id} className={cn('flex cursor-pointer items-start gap-2.5 text-sm text-ui-ink-2', rest.disabled && 'cursor-not-allowed opacity-60', className)}>
      <input id={rest.id ?? id} type="checkbox" className="ui-focus mt-0.5 h-4 w-4 shrink-0 accent-[var(--ui-primary)]" {...rest} />
      <span className="min-w-0"><span className="block">{label}</span>{description && <span className="block text-xs text-ui-muted">{description}</span>}</span>
    </label>
  )
}
