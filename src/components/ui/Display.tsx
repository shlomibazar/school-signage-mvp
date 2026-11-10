import { cn } from '@/lib/utils'

// Small display components of the admin design system: page header, badge, empty state, table.

export function PageHeader({ title, description, actions }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div data-tour="page-header" className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[22px] font-bold leading-tight text-ui-ink">{title}</h1>
        {description && <p className="mt-1 text-[13.5px] text-ui-muted">{description}</p>}
      </div>
      {actions && <div data-tour="page-actions" className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger'
const tones: Record<BadgeTone, string> = {
  neutral: 'bg-slate-100 text-slate-700',
  primary: 'bg-ui-primary-soft text-ui-primary-ink',
  success: 'bg-ui-success-soft text-ui-success',
  warning: 'bg-ui-warning-soft text-ui-warning',
  danger: 'bg-ui-danger-soft text-ui-danger',
}
export function Badge({ tone = 'neutral', dot = false, className, children }: { tone?: BadgeTone; dot?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium', tones[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  )
}

export function EmptyState({ icon, title, description, action }: { icon?: React.ReactNode; title: string; description?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-ui-subtle text-ui-faint">{icon}</div>}
      <p className="font-semibold text-ui-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-ui-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Table({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('overflow-x-auto', className)}><table className="w-full border-collapse text-sm">{children}</table></div>
}
export function Th({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <th className={cn('border-b border-ui-border bg-ui-subtle px-4 py-2.5 text-start text-xs font-semibold text-ui-muted', className)}>{children}</th>
}
export function Td({ className, children }: { className?: string; children?: React.ReactNode }) {
  return <td className={cn('border-b border-ui-border px-4 py-3 align-middle', className)}>{children}</td>
}
