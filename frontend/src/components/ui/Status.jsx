/**
 * Status primitives, docs/ui-design-system.md §4.1–4.2.
 * A status is always a dot plus text; never a filled pill.
 */

const DOTS = {
  red: 'bg-red-500',
  'red-ring': 'border-2 border-red-500',
  amber: 'bg-amber-500',
  green: 'bg-green-500',
  dark: 'bg-neutral-800',
  'dark-ring': 'border-2 border-neutral-800',
  grey: 'bg-neutral-400',
  'grey-ring': 'border-2 border-neutral-400',
}

export function Dot({ tone, label, className = '' }) {
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${DOTS[tone]} ${className}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  )
}

// [dot tone, label] per domain and value.
const STATUS = {
  flag: {
    open: ['red', 'Open'],
    in_discussion: ['red-ring', 'In discussion'],
    escalated: ['amber', 'Escalated'],
    resolved: ['green', 'Resolved'],
  },
  submission: {
    pending: ['grey', 'Pending'],
    verified: ['green', 'Verified'],
    rejected: ['red', 'Rejected'],
  },
  meeting: {
    scheduled: ['dark-ring', 'Scheduled'],
    completed: ['dark', 'Held'],
    cancelled: ['grey-ring', 'Cancelled'],
  },
  slot: {
    open: ['grey-ring', 'Open'],
    booked: ['dark-ring', 'Booked'],
    completed: ['dark', 'Held'],
    cancelled: ['grey-ring', 'Cancelled'],
  },
  user: {
    active: ['green', 'Active'],
    pending: ['grey', 'Awaiting approval'],
    deactivated: ['grey-ring', 'Deactivated'],
  },
  semester: {
    open: ['dark', 'Open'],
    closed: ['grey-ring', 'Closed'],
  },
  allocation: {
    active: ['dark', 'Active'],
    ended: ['grey-ring', 'Ended'],
  },
  outcome: {
    assigned: ['green', 'Assigned'],
    failed: ['red', 'Failed'],
    submitted: ['green', 'Submitted'],
    attended: ['dark', 'Attended'],
    absent: ['grey-ring', 'Absent'],
  },
}

/** `kind` is the domain: flag, submission, meeting, slot, user, semester, allocation, outcome. */
export function Status({ kind, status, label }) {
  const entry = STATUS[kind]?.[status]
  if (!entry) return null
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-neutral-700">
      <Dot tone={entry[0]} />
      {label || entry[1]}
    </span>
  )
}

export const FLAG_DOT = { open: 'red', in_discussion: 'red-ring', escalated: 'amber', resolved: 'green' }

export function RuleId({ rule }) {
  return <span className="inline-block w-6 shrink-0 font-mono text-xs font-medium text-neutral-800">{rule}</span>
}

/** "● F1  SGPA fell from 8.2 to 6.4" — the reason is shown verbatim. */
export function FlagLine({ flag, meta, large = false }) {
  return (
    <span className="flex min-w-0 items-baseline gap-2">
      <Dot tone={FLAG_DOT[flag.status]} label={STATUS.flag[flag.status][1]} className="relative -top-px self-center" />
      <RuleId rule={flag.rule} />
      <span className="min-w-0">
        <span className={large ? 'text-md text-neutral-900' : 'text-sm text-neutral-700'}>{flag.reason}</span>
        {meta && <span className="ml-2 text-xs text-neutral-500">{meta}</span>}
      </span>
    </span>
  )
}

const INDICATOR = {
  red: ['red', 'Unresolved flag'],
  amber: ['amber', 'Escalated flag'],
  green: ['green', 'No open flags'],
}

export function IndicatorDot({ indicator, withLabel = false }) {
  const [tone, text] = INDICATOR[indicator]
  if (withLabel) {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-neutral-700">
        <Dot tone={tone} />
        {text}
      </span>
    )
  }
  return <Dot tone={tone} label={text} />
}
