import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { InviteModal } from '../../components/domain/InviteModal'
import { ResolveFlagModal } from '../../components/domain/ResolveFlagModal'
import { Button, LinkButton } from '../../components/ui/Button'
import { Panel } from '../../components/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback'
import { Dot, FlagLine, Status } from '../../components/ui/Status'
import { useBreadcrumb } from '../../lib/breadcrumb'
import { formatDateTime, RULE_LABELS } from '../../lib/format'
import { useApi } from '../../lib/useApi'

const DAY_MS = 24 * 60 * 60 * 1000
const LIST_PATH = { student: '/student/flags', mentor: '/mentor/flags', admin: '/admin/flags' }

function meetingsPath(role, flag) {
  if (!flag) return null
  if (role === 'student') return '/students/me/meetings'
  if (role === 'mentor') return '/mentor/meetings'
  return null // Admins have no meetings listing; the timeline omits that event.
}

function buildTimeline(flag, meetings, userId) {
  const events = [{ key: 'raised', at: flag.raised_at, dot: 'red', title: 'Raised', body: flag.reason }]
  if (flag.escalated_at) {
    events.push({
      key: 'escalated',
      at: flag.escalated_at,
      dot: 'amber',
      title: 'Escalated to the coordinator',
      body: 'Open for more than 14 days without follow-up.',
    })
  }
  for (const meeting of meetings) {
    if (meeting.status !== 'completed' || !meeting.linked_flags.some((f) => f.id === flag.id)) continue
    const minutes = meeting.minutes || ''
    events.push({
      key: `meeting-${meeting.id}`,
      at: meeting.completed_at,
      dot: 'dark',
      title: 'Discussed in a meeting',
      body: minutes.length > 220 ? `${minutes.slice(0, 217)}…` : minutes,
    })
  }
  if (flag.resolved_at) {
    events.push({
      key: 'resolved',
      at: flag.resolved_at,
      dot: 'green',
      title: flag.resolved_by === userId ? 'Resolved by you' : 'Resolved',
      body: flag.resolution_note,
    })
  }
  events.sort((a, b) => new Date(a.at) - new Date(b.at))
  if (!flag.resolved_at) {
    const days = Math.max(0, Math.floor((Date.now() - new Date(flag.raised_at).getTime()) / DAY_MS))
    events.push({ key: 'open', at: null, dot: 'grey-ring', title: `Open for ${days} day${days === 1 ? '' : 's'}`, body: null })
  }
  return events
}

export default function FlagDetailPage() {
  const { flagId } = useParams()
  const { user } = useAuth()
  const state = useApi(`/flags/${flagId}`)
  const flag = state.data
  const meetings = useApi(meetingsPath(user.role, flag), user.role === 'mentor' && flag ? { student_id: flag.student.id } : undefined)
  const [resolving, setResolving] = useState(false)
  const [inviting, setInviting] = useState(false)
  useBreadcrumb(flag ? `${flag.rule} · ${flag.student.name}` : null)

  if (state.error && !flag) {
    if (state.error.response?.status === 404) {
      return (
        <div className="panel">
          <EmptyState message="This flag does not exist or is not visible to you." action={<LinkButton to={LIST_PATH[user.role]}>Back to flags</LinkButton>} />
        </div>
      )
    }
    return <ErrorState error={state.error} onRetry={state.reload} />
  }
  if (!flag) {
    return (
      <div className="panel p-5">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="mt-3 h-4 w-1/3" />
        <Skeleton className="mt-8 h-24 w-full" />
      </div>
    )
  }

  const canResolve = user.role !== 'student' && flag.status !== 'resolved'
  const timeline = buildTimeline(flag, meetings.data || [], user.id)

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <FlagLine flag={flag} large />
          <p className="mt-2 text-base text-neutral-600">
            {RULE_LABELS[flag.rule]} ·{' '}
            {user.role === 'mentor' ? (
              <Link to={`/mentor/mentees/${flag.student.id}`} className="link">
                {flag.student.name}
              </Link>
            ) : (
              flag.student.name
            )}{' '}
            <span className="font-mono text-sm text-neutral-500">{flag.student.roll_no}</span> · {flag.semester.label}
          </p>
          <div className="mt-2">
            <Status kind="flag" status={flag.status} />
          </div>
        </div>
        {user.role !== 'student' && (
          <div className="flex flex-wrap gap-2">
            {user.role === 'mentor' && flag.status !== 'resolved' && (
              <Button variant="secondary" onClick={() => setInviting(true)}>
                Invite to a meeting
              </Button>
            )}
            {canResolve && <Button onClick={() => setResolving(true)}>Resolve flag</Button>}
          </div>
        )}
      </div>

      <Panel title="History">
        <ol className="relative ml-1 border-l border-neutral-200">
          {timeline.map((event) => (
            <li key={event.key} className="relative pb-6 pl-6 last:pb-0">
              <Dot tone={event.dot} className="absolute -left-[4.5px] top-1.5" />
              <p className="text-sm font-medium text-neutral-800">{event.title}</p>
              {event.at && <p className="text-xs text-neutral-500">{formatDateTime(event.at)}</p>}
              {event.body && <p className="mt-1 whitespace-pre-line text-sm text-neutral-700">{event.body}</p>}
            </li>
          ))}
        </ol>
      </Panel>

      <ResolveFlagModal flag={resolving ? flag : null} onClose={() => setResolving(false)} onResolved={state.reload} />
      {user.role === 'mentor' && (
        <InviteModal open={inviting} student={flag.student} onClose={() => setInviting(false)} onInvited={meetings.reload} />
      )}
    </>
  )
}
