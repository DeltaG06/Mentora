import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Users } from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import { IndicatorDot } from '../../components/ui/Badge'
import { Card, Stat } from '../../components/ui/Card'
import { EmptyState, Loadable } from '../../components/ui/Feedback'
import { PageHeader } from '../../components/ui/PageHeader'
import { formatSgpa } from '../../lib/format'
import { useApi } from '../../lib/useApi'

const PRIORITY = { amber: 0, red: 1, green: 2 }

function RosterCard({ entry }) {
  const { student } = entry
  const border =
    entry.indicator === 'amber'
      ? 'border-l-amber-500'
      : entry.indicator === 'red'
        ? 'border-l-red-500'
        : 'border-l-emerald-500'
  return (
    <Link
      to={`/mentor/mentees/${student.id}`}
      className={`card block border-l-4 ${border} p-4 transition-shadow hover:shadow-md focus-visible:ring-2`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">{student.name}</p>
          <p className="text-xs text-slate-500">
            {student.roll_no} · Year {student.year}, Div {student.division}
          </p>
        </div>
        <IndicatorDot indicator={entry.indicator} />
      </div>
      <div className="mt-4 flex items-end justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Latest SGPA</p>
          <p
            className={`text-lg font-semibold tabular-nums ${
              entry.latest_sgpa !== null && entry.latest_sgpa < 6 ? 'text-red-600' : 'text-slate-900'
            }`}
          >
            {formatSgpa(entry.latest_sgpa)}
          </p>
        </div>
        <p className="text-right text-xs text-slate-500">
          {entry.unresolved_flags === 0
            ? 'No open flags'
            : `${entry.unresolved_flags} unresolved flag${entry.unresolved_flags === 1 ? '' : 's'}`}
        </p>
      </div>
    </Link>
  )
}

export default function MentorDashboard() {
  const { user } = useAuth()
  const state = useApi('/mentor/dashboard')

  const roster = useMemo(
    () =>
      [...(state.data?.mentees || [])].sort(
        (a, b) => PRIORITY[a.indicator] - PRIORITY[b.indicator] || a.student.name.localeCompare(b.student.name),
      ),
    [state.data],
  )

  return (
    <>
      <PageHeader title="Dashboard" description={`${user.designation}, ${user.department} department`} />
      <Loadable state={state}>
        {(data) => {
          const attention = data.mentees.filter((m) => m.indicator !== 'green').length
          const pending = data.pending_internal_submissions + data.pending_results
          return (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Stat label="Mentees" value={data.mentees.length} />
                <Stat
                  label="Need attention"
                  value={attention}
                  tone={attention ? 'red' : undefined}
                  hint="Students with unresolved flags"
                />
                <Link to="/mentor/verification" className="block rounded-lg focus-visible:ring-2">
                  <Stat
                    label="Awaiting verification"
                    value={pending}
                    tone={pending ? 'amber' : undefined}
                    hint={`${data.pending_internal_submissions} internal · ${data.pending_results} result`}
                  />
                </Link>
                <Link to="/mentor/meetings" className="block rounded-lg focus-visible:ring-2">
                  <Stat
                    label="Upcoming"
                    value={data.upcoming_meetings + data.upcoming_group_sessions}
                    hint={`${data.upcoming_meetings} one-to-one · ${data.upcoming_group_sessions} group`}
                  />
                </Link>
              </div>

              <Card
                title="Mentee roster"
                description="Escalated and flagged students are listed first."
                actions={
                  <div className="hidden items-center gap-4 text-xs text-slate-500 sm:flex">
                    <IndicatorDot indicator="amber" withLabel />
                    <IndicatorDot indicator="red" withLabel />
                    <IndicatorDot indicator="green" withLabel />
                  </div>
                }
              >
                {roster.length === 0 ? (
                  <EmptyState icon={Users} title="No mentees assigned yet">
                    The scheme coordinator allocates students to you. They will appear here.
                  </EmptyState>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {roster.map((entry) => (
                      <RosterCard key={entry.student.id} entry={entry} />
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )
        }}
      </Loadable>
    </>
  )
}
