import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BarList, ColumnChart } from '../../components/charts/Charts'
import { Badge } from '../../components/ui/Badge'
import { Card, Stat } from '../../components/ui/Card'
import { DataTable } from '../../components/ui/DataTable'
import { EmptyState, Loadable } from '../../components/ui/Feedback'
import { Select } from '../../components/ui/Field'
import { PageHeader } from '../../components/ui/PageHeader'
import { MENTOR_CAPACITY } from '../../lib/constants'
import { formatHours, RULE_LABELS } from '../../lib/format'
import { useApi } from '../../lib/useApi'

const shortDate = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' })

function MentorTable({ mentors }) {
  if (mentors.length === 0) {
    return <EmptyState title="No active mentors">Approve mentor registrations to start allocating students.</EmptyState>
  }
  const columns = [
    {
      key: 'mentor',
      header: 'Mentor',
      render: (row) => (
        <span>
          <span className="font-medium text-slate-900">{row.mentor.name}</span>
          <span className="block text-xs text-slate-500">{row.mentor.department}</span>
        </span>
      ),
    },
    {
      key: 'mentees',
      header: 'Mentees',
      render: (row) => (
        <span className="inline-flex items-center gap-2 tabular-nums">
          {row.active_mentees}
          {row.active_mentees > MENTOR_CAPACITY && <Badge tone="amber">Over {MENTOR_CAPACITY}</Badge>}
        </span>
      ),
    },
    { key: 'held', header: 'Meetings held', render: (row) => <span className="tabular-nums">{row.meetings_completed}</span> },
    { key: 'scheduled', header: 'Scheduled', render: (row) => <span className="tabular-nums">{row.meetings_scheduled}</span> },
    { key: 'groups', header: 'Group sessions', render: (row) => <span className="tabular-nums">{row.group_sessions_completed}</span> },
    {
      key: 'flags',
      header: 'Unresolved flags',
      render: (row) => (
        <span className={`tabular-nums ${row.unresolved_flags ? 'font-medium text-red-600' : 'text-slate-400'}`}>
          {row.unresolved_flags}
        </span>
      ),
    },
    {
      key: 'compliance',
      header: 'Engagement',
      render: (row) => {
        if (row.active_mentees === 0) return <span className="text-slate-400">No mentees</span>
        if (row.meetings_completed + row.group_sessions_completed === 0) return <Badge tone="red">No meetings held</Badge>
        return <Badge tone="green">Active</Badge>
      },
    },
  ]
  return <DataTable columns={columns} rows={mentors} rowKey={(row) => row.mentor.id} />
}

export default function AdminDashboard() {
  const [semesterId, setSemesterId] = useState('')
  const semesters = useApi('/semesters')
  const params = semesterId ? { semester_id: semesterId } : undefined
  const dashboard = useApi('/admin/dashboard', params)
  const analytics = useApi('/admin/analytics', params)

  return (
    <>
      <PageHeader
        title="Compliance overview"
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
      <Loadable state={dashboard}>
        {(data) => {
          const unresolved = data.flag_counts.open + data.flag_counts.in_discussion + data.flag_counts.escalated
          return (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Stat
                  label="Allocation coverage"
                  value={`${data.coverage_percent.toFixed(1)}%`}
                  tone={data.coverage_percent < 100 && data.active_students ? 'amber' : undefined}
                  hint={`${data.allocated_students} of ${data.active_students} active students`}
                />
                <Stat
                  label="Unresolved flags"
                  value={unresolved}
                  tone={data.flag_counts.escalated ? 'red' : undefined}
                  hint={`${data.flag_counts.escalated} escalated · ${data.flag_counts.in_discussion} in discussion`}
                />
                <Stat
                  label="Flags resolved"
                  value={data.flag_counts.resolved}
                  hint={`Average time to resolve: ${formatHours(data.avg_resolution_hours)}`}
                />
                <Link to="/admin/approvals" className="block rounded-lg focus-visible:ring-2">
                  <Stat
                    label="Pending approvals"
                    value={data.pending_mentors}
                    tone={data.pending_mentors ? 'amber' : undefined}
                    hint="Mentor registrations"
                  />
                </Link>
              </div>

              {data.flag_counts.escalated > 0 && (
                <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    <span className="font-semibold">{data.flag_counts.escalated} flag{data.flag_counts.escalated === 1 ? ' has' : 's have'}</span> been
                    open for more than 14 days without follow-up.
                  </span>
                  <Link to="/admin/flags" className="font-medium underline">
                    Review escalated flags
                  </Link>
                </div>
              )}

              <Card title="Mentors" description="Activity per mentor across all time; flag counts follow the semester filter." bodyClassName="">
                <MentorTable mentors={data.mentors} />
              </Card>

              <Loadable state={analytics}>
                {(stats) => (
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <Card title="Flags by rule">
                      <BarList
                        rows={stats.flags_by_rule.map((r) => ({ label: r.rule, sublabel: RULE_LABELS[r.rule], value: r.count }))}
                      />
                    </Card>
                    <Card title="Meetings held per week" description="Last 8 weeks">
                      <ColumnChart
                        columns={stats.meetings_trend.map((w) => ({
                          label: shortDate.format(new Date(`${w.week_start}T00:00:00`)),
                          value: w.completed,
                        }))}
                      />
                    </Card>
                  </div>
                )}
              </Loadable>
            </div>
          )
        }}
      </Loadable>
    </>
  )
}
