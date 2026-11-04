import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { formatRange } from '../../lib/format'
import { Badge, RuleBadge, StatusBadge } from '../ui/Badge'

/**
 * One meeting row. `perspective` is 'student' (shows the mentor) or
 * 'mentor' (shows the student). `actions` renders on the right.
 */
export function MeetingItem({ meeting, perspective, actions }) {
  const [open, setOpen] = useState(false)
  const counterpart =
    perspective === 'student'
      ? meeting.slot.mentor.name
      : `${meeting.student.name} (${meeting.student.roll_no})`
  const hasDetails = meeting.minutes || meeting.linked_flags.length > 0

  return (
    <li className="px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium tabular-nums text-slate-900">
            {formatRange(meeting.slot.start_time, meeting.slot.end_time)}
          </p>
          <p className="mt-0.5 text-sm text-slate-700">{counterpart}</p>
          <p className="mt-1 text-sm text-slate-500">{meeting.agenda}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={meeting.status} />
            {meeting.invited_by_mentor && <Badge tone="slate">Mentor invitation</Badge>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
      {hasDetails && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline"
            aria-expanded={open}
          >
            {open ? 'Hide record' : 'Meeting record'}
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
          </button>
          {open && (
            <div className="mt-2 space-y-3 rounded-md bg-slate-50 p-3 text-sm">
              {meeting.minutes && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Minutes</p>
                  <p className="mt-1 whitespace-pre-line text-slate-700">{meeting.minutes}</p>
                </div>
              )}
              {meeting.linked_flags.length > 0 && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Flags discussed</p>
                  <ul className="mt-1 space-y-1.5">
                    {meeting.linked_flags.map((flag) => (
                      <li key={flag.id} className="flex flex-wrap items-center gap-2">
                        <RuleBadge rule={flag.rule} />
                        <span className="text-slate-700">{flag.reason}</span>
                        <StatusBadge status={flag.status} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  )
}
