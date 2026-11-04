import { Link } from 'react-router-dom'
import { CalendarClock, Mail, TrendingUp, UserRound } from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import { LineChart } from '../../components/charts/Charts'
import { Badge, RuleBadge, StatusBadge } from '../../components/ui/Badge'
import { Card } from '../../components/ui/Card'
import { EmptyState, Loadable } from '../../components/ui/Feedback'
import { PageHeader } from '../../components/ui/PageHeader'
import { formatDateTime, formatRange, relativeTime } from '../../lib/format'
import { useApi } from '../../lib/useApi'

function MentorCard({ mentor }) {
  return (
    <Card title="Your mentor">
      {mentor ? (
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            <UserRound className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="font-medium text-slate-900">{mentor.name}</p>
            <p className="text-sm text-slate-500">
              {mentor.designation}, {mentor.department}
            </p>
            <a href={`mailto:${mentor.email}`} className="mt-2 inline-flex items-center gap-1.5 text-sm link">
              <Mail className="h-3.5 w-3.5" aria-hidden />
              {mentor.email}
            </a>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          No mentor has been assigned to you yet. The scheme coordinator will allocate one.
        </p>
      )}
    </Card>
  )
}

function DeadlineCard({ deadline }) {
  if (!deadline) {
    return (
      <Card title="Next deadline">
        <p className="text-sm text-slate-500">No upcoming submission deadlines.</p>
      </Card>
    )
  }
  const isInternal = deadline.kind === 'internal'
  return (
    <Card title="Next deadline">
      <p className="text-sm text-slate-500">{deadline.semester.label}</p>
      <p className="mt-0.5 font-medium text-slate-900">{isInternal ? 'Internal marks' : 'Semester result'}</p>
      <p className="mt-2 text-sm text-slate-700">
        {formatDateTime(deadline.deadline)}{' '}
        <span className="text-slate-500">({relativeTime(deadline.deadline)})</span>
      </p>
      <div className="mt-3">
        {deadline.submitted ? (
          <Badge tone="green">Submitted</Badge>
        ) : (
          <Link to={isInternal ? '/student/internals' : '/student/results'} className="text-sm link">
            Submit now
          </Link>
        )}
      </div>
    </Card>
  )
}

function FlagSummary({ counts }) {
  const rows = [
    ['Open', counts.open, 'text-red-600'],
    ['In discussion', counts.in_discussion, 'text-brand-700'],
    ['Escalated', counts.escalated, 'text-amber-600'],
    ['Resolved', counts.resolved, 'text-emerald-700'],
  ]
  return (
    <Card title="Flags" actions={<Link to="/student/flags" className="text-sm link">View all</Link>}>
      <dl className="grid grid-cols-2 gap-4">
        {rows.map(([label, value, color]) => (
          <div key={label}>
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className={`text-xl font-semibold tabular-nums ${value ? color : 'text-slate-300'}`}>{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}

export default function StudentDashboard() {
  const { user } = useAuth()
  const state = useApi('/students/me/dashboard')

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`${user.roll_no} · ${user.department} · Year ${user.year}, Division ${user.division}`}
      />
      <Loadable state={state}>
        {(data) => {
          const upcoming = [
            ...data.upcoming_meetings.map((m) => ({
              key: `m${m.id}`,
              start: m.slot.start_time,
              end: m.slot.end_time,
              title: m.invited_by_mentor ? 'Meeting requested by your mentor' : 'One-to-one meeting',
              detail: m.agenda,
            })),
            ...data.upcoming_group_sessions.map((s) => ({
              key: `g${s.id}`,
              start: s.start_time,
              end: s.end_time,
              title: `Group session: ${s.title}`,
              detail: s.agenda,
            })),
          ].sort((a, b) => new Date(a.start) - new Date(b.start))

          return (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                <MentorCard mentor={data.mentor} />
                <DeadlineCard deadline={data.next_deadline} />
                <FlagSummary counts={data.flag_counts} />
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
                <Card title="SGPA trend" description="Verified semester results" className="lg:col-span-3">
                  {data.sgpa_trend.length === 0 ? (
                    <EmptyState icon={TrendingUp} title="No verified results yet">
                      Your trend appears once a mentor verifies your first semester result.
                    </EmptyState>
                  ) : (
                    <LineChart
                      points={data.sgpa_trend.map((p) => ({ label: p.semester.label, value: p.sgpa }))}
                      reference={{ value: 6, label: 'F3 threshold (6.0)' }}
                    />
                  )}
                </Card>

                <Card title="Active flags" className="lg:col-span-2" bodyClassName="">
                  {data.active_flags.length === 0 ? (
                    <p className="px-5 py-6 text-sm text-slate-500">You have no unresolved flags.</p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {data.active_flags.map((flag) => (
                        <li key={flag.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                          <RuleBadge rule={flag.rule} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-slate-800">{flag.reason}</p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {flag.semester.label} · raised {relativeTime(flag.raised_at)}
                            </p>
                          </div>
                          <StatusBadge status={flag.status} />
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>

              <Card
                title="Coming up"
                actions={<Link to="/student/meetings" className="text-sm link">Book a meeting</Link>}
                bodyClassName=""
              >
                {upcoming.length === 0 ? (
                  <EmptyState icon={CalendarClock} title="Nothing scheduled">
                    Book one of your mentor's open slots when you want to talk.
                  </EmptyState>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {upcoming.map((item) => (
                      <li key={item.key} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-6 sm:px-5">
                        <span className="w-56 shrink-0 text-sm font-medium tabular-nums text-slate-900">
                          {formatRange(item.start, item.end)}
                        </span>
                        <span className="min-w-0 text-sm">
                          <span className="text-slate-800">{item.title}</span>
                          {item.detail && <span className="block truncate text-slate-500">{item.detail}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          )
        }}
      </Loadable>
    </>
  )
}
