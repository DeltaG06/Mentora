import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { LinkButton } from '../../components/ui/Button'
import { Panel, SummaryCard } from '../../components/ui/Card'
import { DataTable } from '../../components/ui/DataTable'
import { EmptyState, ErrorState, Skeleton, SkeletonRows } from '../../components/ui/Feedback'
import { PageHeader } from '../../components/ui/PageHeader'
import { IndicatorDot } from '../../components/ui/Status'
import { formatSgpa } from '../../lib/format'
import { useApi } from '../../lib/useApi'
import { useSort } from '../../lib/useSort'

const PRIORITY = { amber: 0, red: 1, green: 2 }
const byName = (a, b) => a.student.name.localeCompare(b.student.name)

const COLUMNS = [
  {
    key: 'status',
    header: <span className="sr-only">Status</span>,
    width: 32,
    align: 'center',
    mobile: false,
    sort: (a, b) => PRIORITY[a.indicator] - PRIORITY[b.indicator] || byName(a, b),
    render: (row) => <IndicatorDot indicator={row.indicator} />,
  },
  {
    key: 'student',
    header: 'Student',
    sort: byName,
    render: (row) => (
      <span>
        <span className="font-medium text-neutral-800">{row.student.name}</span>
        <span className="block font-mono text-xs text-neutral-500">{row.student.roll_no}</span>
      </span>
    ),
  },
  { key: 'year', header: 'Year / Div', render: (row) => `${row.student.year} · ${row.student.division}` },
  {
    key: 'sgpa',
    header: 'Latest SGPA',
    align: 'right',
    sort: (a, b) => (a.latest_sgpa ?? 99) - (b.latest_sgpa ?? 99),
    render: (row) =>
      row.latest_sgpa === null ? null : (
        <span className={row.latest_sgpa < 6 ? 'text-red-600' : ''}>{formatSgpa(row.latest_sgpa)}</span>
      ),
  },
  {
    key: 'flags',
    header: 'Unresolved flags',
    align: 'right',
    sort: (a, b) => a.unresolved_flags - b.unresolved_flags,
    render: (row) => <span className={row.unresolved_flags ? '' : 'text-neutral-400'}>{row.unresolved_flags}</span>,
  },
]

function Roster({ mentees }) {
  const navigate = useNavigate()
  const { rows, sort, onSort } = useSort(mentees, COLUMNS, { key: 'status', dir: 'asc' })

  if (mentees.length === 0) {
    return (
      <EmptyState
        message="No students are allocated to you yet."
        action={<LinkButton to="/notifications">View notifications</LinkButton>}
      />
    )
  }
  return (
    <DataTable
      columns={COLUMNS}
      rows={rows}
      rowKey={(row) => row.student.id}
      sort={sort}
      onSort={onSort}
      onRowClick={(row) => navigate(`/mentor/mentees/${row.student.id}`)}
      mobileTitle={(row) => (
        <span className="flex items-center gap-2">
          <IndicatorDot indicator={row.indicator} />
          {row.student.name}
          <span className="font-mono text-xs font-normal text-neutral-500">{row.student.roll_no}</span>
        </span>
      )}
      actions={(row) => (
        <Link to={`/mentor/mentees/${row.student.id}`} className="link inline-flex min-h-[44px] items-center text-sm md:min-h-0">
          Open
        </Link>
      )}
    />
  )
}

export default function MentorDashboard() {
  const { user } = useAuth()
  const state = useApi('/mentor/dashboard')
  const data = state.data

  return (
    <>
      <PageHeader title="Mentees" description={`${user.designation}, ${user.department} department`} />
      {state.error && !data ? (
        <ErrorState error={state.error} onRetry={state.reload} />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {data ? (
              (() => {
                const attention = data.mentees.filter((m) => m.indicator !== 'green').length
                const pending = data.pending_internal_submissions + data.pending_results
                return (
                  <>
                    <SummaryCard label="Mentees" value={data.mentees.length} />
                    <SummaryCard
                      label="Need attention"
                      value={attention}
                      tone={attention ? 'red' : undefined}
                      meta="Students with unresolved flags"
                    />
                    <Link to="/mentor/verification" className="block rounded-md">
                      <SummaryCard
                        label="Awaiting verification"
                        value={pending}
                        tone={pending ? 'amber' : undefined}
                        meta={`${data.pending_internal_submissions} internal · ${data.pending_results} result`}
                      />
                    </Link>
                    <Link to="/mentor/meetings" className="block rounded-md">
                      <SummaryCard
                        label="Upcoming"
                        value={data.upcoming_meetings + data.upcoming_group_sessions}
                        meta={`${data.upcoming_meetings} one-to-one · ${data.upcoming_group_sessions} group`}
                      />
                    </Link>
                  </>
                )
              })()
            ) : (
              [0, 1, 2, 3].map((i) => (
                <div key={i} className="panel p-5">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="mt-3 h-6 w-10" />
                </div>
              ))
            )}
          </div>

          <Panel
            title="Roster"
            description="Escalated and flagged students are listed first."
            actions={
              <span className="hidden gap-4 md:flex">
                <IndicatorDot indicator="amber" withLabel />
                <IndicatorDot indicator="red" withLabel />
                <IndicatorDot indicator="green" withLabel />
              </span>
            }
            bodyClassName=""
          >
            {data ? <Roster mentees={data.mentees} /> : <SkeletonRows rows={6} columns={5} />}
          </Panel>
        </div>
      )}
    </>
  )
}
