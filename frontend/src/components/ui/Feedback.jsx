import { AlertCircle, CheckCircle2, Info, Loader2 } from 'lucide-react'
import { errorMessage } from '../../api/client'
import { Button } from './Button'

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500" role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {label}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      {Icon && (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <Icon className="h-5 w-5" aria-hidden />
        </div>
      )}
      <p className="text-sm font-medium text-slate-900">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-slate-500">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

const ALERT = {
  error: { icon: AlertCircle, cls: 'border-red-200 bg-red-50 text-red-800' },
  success: { icon: CheckCircle2, cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  info: { icon: Info, cls: 'border-brand-200 bg-brand-50 text-brand-900' },
  warning: { icon: AlertCircle, cls: 'border-amber-200 bg-amber-50 text-amber-900' },
}

export function Alert({ tone = 'info', title, children, className = '' }) {
  const { icon: Icon, cls } = ALERT[tone]
  return (
    <div
      className={`flex gap-3 rounded-md border px-3.5 py-3 text-sm ${cls} ${className}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
      </div>
    </div>
  )
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="p-4">
      <Alert tone="error" title="Could not load this data">
        <p>{errorMessage(error)}</p>
        {onRetry && (
          <Button variant="link" className="mt-1 !text-red-800" onClick={onRetry}>
            Try again
          </Button>
        )}
      </Alert>
    </div>
  )
}

/** Render loading / error / content for a useApi() result. */
export function Loadable({ state, children }) {
  if (state.loading && state.data === null) return <Spinner />
  if (state.error && state.data === null) {
    return <ErrorState error={state.error} onRetry={state.reload} />
  }
  if (state.data === null) return null
  return children(state.data)
}
