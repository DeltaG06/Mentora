import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BarList, ColumnChart } from '../../components/charts/Charts'
import { LinkButton } from '../../components/ui/Button'
import { Panel, SummaryCard } from '../../components/ui/Card'
import { DataTable } from '../../components/ui/DataTable'
import { Alert, EmptyState, ErrorState, Skeleton, SkeletonBlock, SkeletonRows } from '../../components/ui/Feedback'
import { Select } from '../../components/ui/Field'
import { PageHeader } from '../../components/ui/PageHeader'
import { Dot } from '../../components/ui/Status'
import { MENTOR_CAPACITY } from '../../lib/constants'
import { formatHours, RULE_LABELS } from '../../lib/format'
import { useApi } from '../../lib/useApi'
import { useSort } from '../../lib/useSort'

const shortDate = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' })

const MENTOR_COLUMNS = [
  {
    key: 'mentor',
    header: 'Mentor',
    sort: (a, b) => a.mentor.name.localeCompare(b.mentor.name),
    render: (row) => (
      <span>
        <span className="font-medium text-neutral-800">{row.mentor.name}</span>
        <span className="block text-xs text-neutral-500">{row.mentor.department}</span>
      </span>
    ),
  },
  {
    key: 'mentees',
    header: 'Mentees',
    align: 'right',
    sort: (a, b) => a.active_mentees - b.active_mentees,
    render: (row) =>
      row.active_mentees > MENTOR_CAPACITY ? (
        <span className="text-amber-700">{row.active_mentees} (over {MENTOR_CAPACITY})</span>
      ) : (
        row.active_mentees
      ),
  },
  { key: 'held', header: 'Meetings held', align: 'right', sort: (a, b) => a.meetings_completed - b.meetings_completed, render: (r) => r.meetings_completed },
  { key: 'scheduled', header: 'Scheduled', align: 'right', render: (r) => r.meetings_scheduled },
  { key: 'groups', header: 'Group sessions', align: 'right', render: (r) => r.group_sessions_completed },
  {
    key: 'flags',
    header: 'Unresolved flags',
    align: 'right',
    sort: (a, b) => a.unresolved_flags - b.unresolved_flags,
    render: (r) => <span className={r.unresolved_flags ? 'text-red-600' : 'text-neutral-400'}>{r.unresolved_flags}</span>,
  },
  {
    key: 'engagement',
    header: 'Engagement',
    render: (r) => {
      if (r.active_mentees === 0) return <span className="text-neutral-500">No mentees</span>
      if (r.meetings_completed + r.group_sessions_completed === 0) {
        return (
          <span className="inline-flex items-center gap-1.5 text-sm text-neutral-700">
            <Dot tone="red" />
            No meetings held
          </span>
        )
      }
      return (
        <span className="inline-flex items-center gap-1.5 text-sm text-neutral-700">
          <Dot tone="green" />
          Meeting regularly
        </span>
      )
    },
  },
]

function MentorTable({ mentors }) {
  const { rows, sort, onSort } = useSort(mentors, MENTOR_COLUMNS)
  if (mentors.length === 0) {
    return (
      <EmptyState
        message="There are no active mentors. Approve mentor registrations to start allocating students."
        action={<LinkButton to="/admin/approvals">Review approvals</LinkButton>}
      />
    )
  }
  return <DataTable columns={MENTOR_COLUMNS} rows={rows} rowKey={(row) => row.mentor.id} sort={sort} onSort={onSort} />
}

export default function AdminDashboard() {
  const [semesterId, setSemesterId] = useState('')
  const semesters = useApi('/semesters')
  const params = semesterId ? { semester_id: semesterId } : undefined
  const dashboard = useApi('/admin/dashboard', params)
  const analytics = useApi('/admin/analytics', params)
  const data = dashboard.data

  return (
    <>
      <PageHeader
        title="Compliance"
        description="How the mentorship scheme is running across departments."
        actions={
          <Select aria-label="Semester" value={semesterId} onChange={(e) => setSemesterId(e.target.value)} className="w-56">
            <option value="">All semesters</option>
            {(semesters.data || []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
        }
      />
      {dashboard.error && !data ? (
        <ErrorState error={dashboard.error} onRetry={dashboard.reload} />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {data ? (
              <>
                <SummaryCard
                  label="Allocation coverage"
                  value={`${data.coverage_percent.toFixed(1)}%`}
                  tone={data.active_students && data.coverage_percent < 100 ? 'amber' : undefined}
                  meta={`${data.allocated_students} of ${data.active_students} active students`}
                />
                <SummaryCard
                  label="Unresolved flags"
                  value={data.flag_counts.open + data.flag_counts.in_discussion + data.flag_counts.escalated}
                  tone={data.flag_counts.open + data.flag_counts.escalated ? 'red' : undefined}
                  meta={`${data.flag_counts.escalated} escalated · ${data.flag_counts.in_discussion} in discussion`}
                />
                <SummaryCard
                  label="Flags resolved"
                  value={data.flag_counts.resolved}
                  meta={`Average time to resolve: ${formatHours(data.avg_resolution_hours)}`}
                />
                <Link to="/admin/approvals" className="block rounded-md">
                  <SummaryCard
                    label="Pending approvals"
                    value={data.pending_mentors}
                    tone={data.pending_mentors ? 'amber' : undefined}
                    meta="Mentor registrations"
                  />
                </Link>
              </>
            ) : (
              [0, 1, 2, 3].map((i) => (
                <div key={i} className="panel p-5">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="mt-3 h-6 w-16" />
                  <Skeleton className="mt-2 h-3 w-36" />
                </div>
              ))
            )}
          </div>

          {data?.flag_counts.escalated > 0 && (
            <Alert tone="warning">
              {data.flag_counts.escalated} flag{data.flag_counts.escalated === 1 ? ' has' : 's have'} been open for more than 14 days
              without follow-up.{' '}
              <Link to="/admin/flags" className="link">
                Review escalated flags
              </Link>
            </Alert>
          )}

          <Panel title="Mentors" description="Meeting activity across all time. Flag counts follow the semester filter." bodyClassName="">
            {data ? <MentorTable mentors={data.mentors} /> : <SkeletonRows columns={6} />}
          </Panel>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Panel title="Flags by rule">
              {analytics.data ? (
                <BarList rows={analytics.data.flags_by_rule.map((r) => ({ label: r.rule, sublabel: RULE_LABELS[r.rule], value: r.count }))} />
              ) : (
                <SkeletonBlock className="h-40" />
              )}
            </Panel>
            <Panel title="Meetings held per week" description="Last 8 weeks">
              {analytics.data ? (
                <ColumnChart
                  columns={analytics.data.meetings_trend.map((w) => ({
                    label: shortDate.format(new Date(`${w.week_start}T00:00:00`)),
                    value: w.completed,
                  }))}
                />
              ) : (
                <SkeletonBlock className="h-40" />
              )}
            </Panel>
          </div>
        </div>
      )}
    </>
  )
}
