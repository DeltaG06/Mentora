import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { LineChart } from '../../components/charts/Charts'
import { LinkButton } from '../../components/ui/Button'
import { Panel, SummaryCard } from '../../components/ui/Card'
import { DataTable } from '../../components/ui/DataTable'
import { EmptyState, ErrorState, Skeleton, SkeletonBlock } from '../../components/ui/Feedback'
import { PageHeader } from '../../components/ui/PageHeader'
import { FlagLine, Status } from '../../components/ui/Status'
import { formatDate, formatDateTime, formatRange, relativeTime } from '../../lib/format'
import { useApi } from '../../lib/useApi'

function MentorCard({ mentor }) {
  return (
    <SummaryCard label="Mentor">
      {mentor ? (
        <div className="mt-1">
          <p className="text-md text-neutral-900">{mentor.name}</p>
          <p className="text-sm text-neutral-600">
            {mentor.designation}, {mentor.department}
          </p>
          <a href={`mailto:${mentor.email}`} className="link mt-1 inline-block text-sm">
            {mentor.email}
          </a>
        </div>
      ) : (
        <p className="mt-1 text-sm text-neutral-600">A mentor has not been assigned yet.</p>
      )}
    </SummaryCard>
  )
}

function DeadlineCard({ deadline }) {
  if (!deadline) {
    return (
      <SummaryCard label="Next deadline">
        <p className="mt-1 text-sm text-neutral-600">There are no upcoming submission deadlines.</p>
      </SummaryCard>
    )
  }
  const internal = deadline.kind === 'internal'
  return (
    <SummaryCard label="Next deadline">
      <p className="mt-1 text-md text-neutral-900">{internal ? 'Internal marks' : 'Semester result'}</p>
      <p className="text-sm text-neutral-600">{deadline.semester.label}</p>
      <p className="mt-1 text-sm text-neutral-700">
        {formatDateTime(deadline.deadline)} <span className="text-neutral-500">({relativeTime(deadline.deadline)})</span>
      </p>
      <div className="mt-2">
        {deadline.submitted ? (
          <Status kind="outcome" status="submitted" />
        ) : (
          <Link to={internal ? '/student/internals' : '/student/results'} className="link text-sm">
            Submit now
          </Link>
        )}
      </div>
    </SummaryCard>
  )
}

function FlagCountsCard({ counts }) {
  const rows = [
    ['Open', counts.open, 'text-red-600'],
    ['In discussion', counts.in_discussion, 'text-neutral-900'],
    ['Escalated', counts.escalated, 'text-amber-700'],
    ['Resolved', counts.resolved, 'text-neutral-900'],
  ]
  return (
    <SummaryCard label="Flags">
      <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-2">
        {rows.map(([label, value, color]) => (
          <div key={label}>
            <dt className="text-xs text-neutral-500">{label}</dt>
            <dd className={`text-lg ${value ? color : 'text-neutral-400'}`}>{value}</dd>
          </div>
        ))}
      </dl>
    </SummaryCard>
  )
}

const UPCOMING_COLUMNS = [
  { key: 'when', header: 'When', render: (row) => <span className="whitespace-nowrap">{formatRange(row.start, row.end)}</span> },
  { key: 'type', header: 'Type' },
  { key: 'with', header: 'With' },
  { key: 'agenda', header: 'Agenda', mobileFull: true },
]

export default function StudentDashboard() {
  const { user } = useAuth()
  const state = useApi('/students/me/dashboard')

  const header = (
    <PageHeader
      title="Dashboard"
      description={`${user.roll_no} · ${user.department} · Year ${user.year}, Division ${user.division}`}
    />
  )

  if (state.error && !state.data) {
    return (
      <>
        {header}
        <ErrorState error={state.error} onRetry={state.reload} />
      </>
    )
  }
  if (!state.data) {
    return (
      <>
        {header}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="panel p-5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-3 h-6 w-32" />
              <Skeleton className="mt-2 h-3 w-40" />
            </div>
          ))}
        </div>
        <div className="panel mt-6">
          <SkeletonBlock className="h-56" />
        </div>
      </>
    )
  }

  const data = state.data
  const upcoming = [
    ...data.upcoming_meetings.map((m) => ({
      key: `m${m.id}`,
      start: m.slot.start_time,
      end: m.slot.end_time,
      type: m.invited_by_mentor ? 'Meeting (mentor invitation)' : 'Meeting',
      with: m.slot.mentor.name,
      agenda: m.agenda,
    })),
    ...data.upcoming_group_sessions.map((s) => ({
      key: `g${s.id}`,
      start: s.start_time,
      end: s.end_time,
      type: 'Group session',
      with: s.mentor.name,
      agenda: s.title,
    })),
  ].sort((a, b) => new Date(a.start) - new Date(b.start))

  return (
    <>
      {header}
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <MentorCard mentor={data.mentor} />
          <DeadlineCard deadline={data.next_deadline} />
          <FlagCountsCard counts={data.flag_counts} />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <Panel title="SGPA trend" description="Verified semester results" className="lg:col-span-3">
            {data.sgpa_trend.length === 0 ? (
              <EmptyState message="Your trend appears after your first result is verified." />
            ) : (
              <LineChart
                points={data.sgpa_trend.map((p) => ({ label: p.semester.label, value: p.sgpa }))}
                threshold={{ value: 6, label: 'F3 threshold 6.0' }}
              />
            )}
          </Panel>

          <Panel title="Active flags" className="lg:col-span-2" bodyClassName="">
            {data.active_flags.length === 0 ? (
              <EmptyState
                message="You have no unresolved flags."
                action={<LinkButton to="/student/flags">View flag history</LinkButton>}
              />
            ) : (
              <ul>
                {data.active_flags.map((flag) => (
                  <li key={flag.id} className="border-b border-neutral-200 last:border-b-0">
                    <Link to={`/student/flags/${flag.id}`} className="block px-4 py-3 hover:bg-neutral-50 md:px-5">
                      <FlagLine flag={flag} />
                      <p className="mt-1 pl-[54px] text-xs text-neutral-500">
                        {flag.semester.label} · raised {formatDate(flag.raised_at)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <Panel
          title="Coming up"
          actions={
            <Link to="/student/meetings" className="link text-sm">
              Book a meeting
            </Link>
          }
          bodyClassName=""
        >
          {upcoming.length === 0 ? (
            <EmptyState
              message="Nothing is scheduled. Book one of your mentor's open slots when you want to talk."
              action={<LinkButton to="/student/meetings">Book a meeting</LinkButton>}
            />
          ) : (
            <DataTable columns={UPCOMING_COLUMNS} rows={upcoming} rowKey={(row) => row.key} />
          )}
        </Panel>
      </div>
    </>
  )
}
