const TONES = {
  red: 'bg-red-50 text-red-700 ring-red-600/15',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15',
  blue: 'bg-brand-50 text-brand-700 ring-brand-600/15',
  slate: 'bg-slate-100 text-slate-600 ring-slate-500/15',
}

export function Badge({ tone = 'slate', children, className = '' }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

// Colour per status value. `kind` overrides values whose meaning depends on context.
const STATUS_TONES = {
  open: 'red',
  in_discussion: 'blue',
  escalated: 'amber',
  resolved: 'green',
  pending: 'amber',
  verified: 'green',
  rejected: 'red',
  scheduled: 'blue',
  booked: 'blue',
  completed: 'green',
  cancelled: 'slate',
  active: 'green',
  deactivated: 'slate',
  closed: 'slate',
  ended: 'slate',
}

const KIND_TONES = {
  slot: { open: 'green', completed: 'slate' },
  semester: { open: 'green' },
}

const LABELS = { in_discussion: 'In discussion' }

export function StatusBadge({ status, kind }) {
  if (!status) return null
  const tone = KIND_TONES[kind]?.[status] || STATUS_TONES[status] || 'slate'
  const label = LABELS[status] || status.charAt(0).toUpperCase() + status.slice(1)
  return <Badge tone={tone}>{label}</Badge>
}

export function RuleBadge({ rule }) {
  return (
    <span className="inline-flex h-6 min-w-[2.25rem] items-center justify-center rounded bg-slate-800 px-1.5 font-mono text-xs font-semibold text-white">
      {rule}
    </span>
  )
}

const DOT = { red: 'bg-red-500', amber: 'bg-amber-500', green: 'bg-emerald-500' }
export const INDICATOR_LABEL = {
  red: 'Unresolved flag',
  amber: 'Escalated flag',
  green: 'No open flags',
}

export function IndicatorDot({ indicator, withLabel = false }) {
  return (
    <span className="inline-flex items-center gap-1.5" title={INDICATOR_LABEL[indicator]}>
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[indicator]}`} aria-hidden />
      {withLabel ? (
        <span className="text-xs text-slate-600">{INDICATOR_LABEL[indicator]}</span>
      ) : (
        <span className="sr-only">{INDICATOR_LABEL[indicator]}</span>
      )}
    </span>
  )
}
