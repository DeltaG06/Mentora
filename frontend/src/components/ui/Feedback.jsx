import { AlertCircle, CheckCircle2, Info } from 'lucide-react'
import { errorMessage } from '../../api/client'
import { Button } from './Button'

// docs/ui-design-system.md §4.10: skeletons, never spinners, after the first load.

export function Skeleton({ className = '' }) {
  return <div className={`rounded-sm bg-neutral-100 ${className}`} aria-hidden />
}

export function SkeletonRows({ rows = 4, columns = 4 }) {
  return (
    <div role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex gap-6 border-b border-neutral-200 px-4 py-3 md:px-5">
          {Array.from({ length: columns }, (_, col) => (
            <Skeleton key={col} className={`h-4 ${col === 0 ? 'w-40' : 'flex-1'}`} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function SkeletonBlock({ className = 'h-48' }) {
  return (
    <div role="status" aria-label="Loading" className="p-4 md:p-5">
      <Skeleton className={`w-full ${className}`} />
    </div>
  )
}

/** One explanatory sentence and one action. No illustrations. */
export function EmptyState({ message, action }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <p className="max-w-md text-sm text-neutral-600">{message}</p>
      {action}
    </div>
  )
}

const ALERT = {
  error: { icon: AlertCircle, cls: 'border-red-300 bg-red-50 text-red-600' },
  warning: { icon: AlertCircle, cls: 'border-amber-500/40 bg-amber-50 text-amber-700' },
  success: { icon: CheckCircle2, cls: 'border-green-500/40 bg-green-50 text-green-700' },
  info: { icon: Info, cls: 'border-neutral-200 bg-neutral-50 text-neutral-700' },
}

export function Alert({ tone = 'info', title, children, className = '' }) {
  const { icon: Icon, cls } = ALERT[tone]
  return (
    <div
      className={`flex gap-2.5 rounded-md border px-3.5 py-3 text-sm ${cls} ${className}`}
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
    <div className="p-4 md:p-5">
      <Alert tone="error" title="This data could not be loaded.">
        <p>{errorMessage(error)}</p>
        {onRetry && (
          <Button variant="text" className="mt-1" onClick={onRetry}>
            Try again
          </Button>
        )}
      </Alert>
    </div>
  )
}

/**
 * Loading / error / content for a useApi() result.
 * `skeleton` is the placeholder shown while nothing has loaded yet.
 */
export function Loadable({ state, children, skeleton = <SkeletonRows /> }) {
  if (state.loading && state.data === null) return skeleton
  if (state.error && state.data === null) return <ErrorState error={state.error} onRetry={state.reload} />
  if (state.data === null) return null
  return children(state.data)
}
