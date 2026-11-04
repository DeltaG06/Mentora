/**
 * Panel: a bordered surface that holds a table, list or form (no shadow).
 * SummaryCard: dashboard summaries only (docs/ui-design-system.md §4.6).
 */
export function Panel({ title, description, actions, children, className = '', bodyClassName = 'p-4 md:p-5' }) {
  return (
    <section className={`panel ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 md:px-5">
          <div className="min-w-0">
            {title && <h2 className="text-md font-semibold">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-neutral-500">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}

const VALUE_TONES = { red: 'text-red-600', amber: 'text-amber-700' }

/** `tone` may only state risk: red for unresolved flags, amber for waiting work. */
export function SummaryCard({ label, value, meta, tone, children }) {
  return (
    <div className="panel px-4 py-4 md:px-5">
      <p className="text-xs font-medium text-neutral-500">{label}</p>
      {value !== undefined && (
        <p className={`mt-1 text-xl font-normal ${VALUE_TONES[tone] || 'text-neutral-900'}`}>{value}</p>
      )}
      {children}
      {meta && <p className="mt-1 text-xs text-neutral-500">{meta}</p>}
    </div>
  )
}

export function Detail({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="mt-0.5 break-words text-base text-neutral-800">{children ?? '—'}</dd>
    </div>
  )
}
