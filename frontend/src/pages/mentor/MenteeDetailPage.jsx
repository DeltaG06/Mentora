import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { LineChart } from '../../components/charts/Charts'
import { FlagTable } from '../../components/domain/FlagTable'
import { InviteModal } from '../../components/domain/InviteModal'
import { effectiveText } from '../../components/domain/MarksGrid'
import { MeetingTable } from '../../components/domain/MeetingTable'
import { ResolveFlagModal } from '../../components/domain/ResolveFlagModal'
import { Button, LinkButton } from '../../components/ui/Button'
import { Panel, SummaryCard } from '../../components/ui/Card'
import { DataTable } from '../../components/ui/DataTable'
import { EmptyState, ErrorState, Skeleton, SkeletonRows } from '../../components/ui/Feedback'
import { IndicatorDot } from '../../components/ui/Status'
import { Tabs } from '../../components/ui/Tabs'
import { useBreadcrumb } from '../../lib/breadcrumb'
import { formatDate, formatSgpa } from '../../lib/format'
import { useApi } from '../../lib/useApi'

function indicatorFor(flags) {
  if (flags.some((f) => f.status === 'escalated')) return 'amber'
  if (flags.some((f) => f.status !== 'resolved')) return 'red'
  return 'green'
}

const RESULT_COLUMNS = [
  { key: 'semester', header: 'Semester', render: (r) => r.semester.label },
  {
    key: 'sgpa',
    header: 'SGPA',
    align: 'right',
    render: (r) => <span className={r.sgpa < 6 ? 'text-red-600' : ''}>{formatSgpa(r.sgpa)}</span>,
  },
  {
    key: 'weak',
    header: 'Subjects below 40',
    mobileFull: true,
    render: (r) => {
      const weak = r.subjects.filter((s) => s.final_marks < 40)
      return weak.length ? weak.map((s) => `${s.subject_name} (${s.final_marks})`).join(', ') : null
    },
  },
  { key: 'verified', header: 'Verified', render: (r) => formatDate(r.verified_at) },
]

const INTERNAL_COLUMNS = [
  { key: 'subject_name', header: 'Subject' },
  { key: 'i1', header: 'I1', align: 'right' },
  { key: 'i2', header: 'I2', align: 'right' },
  { key: 'i3', header: 'I3', align: 'right' },
  { key: 'max_per_test', header: 'Max / test', align: 'right' },
  { key: 'effective', header: 'Effective', align: 'right', render: effectiveText },
]

export default function MenteeDetailPage() {
  const { studentId } = useParams()
  const state = useApi(`/mentor/mentees/${studentId}`)
  const [tab, setTab] = useState('flags')
  const [resolving, setResolving] = useState(null)
  const [inviting, setInviting] = useState(false)
  useBreadcrumb(state.data?.student.name)

  if (state.error && !state.data) {
    if (state.error.response?.status === 404) {
      return (
        <div className="panel">
          <EmptyState
            message="This student is not one of your current mentees."
            action={<LinkButton to="/mentor">Back to roster</LinkButton>}
          />
        </div>
      )
    }
    return <ErrorState error={state.error} onRetry={state.reload} />
  }
  if (!state.data) {
    return (
      <>
        <Skeleton className="h-7 w-56" />
        <Skeleton className="mt-2 h-4 w-80" />
        <div className="panel mt-6">
          <SkeletonRows />
        </div>
      </>
    )
  }

  const { student, results, internal_submissions: internals, flags, meetings } = state.data
  const unresolved = flags.filter((f) => f.status !== 'resolved').length
  const latest = results.at(-1)

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-lg font-semibold">{student.name}</h1>
            <IndicatorDot indicator={indicatorFor(flags)} withLabel />
          </div>
          <p className="mt-0.5 text-base text-neutral-500">
            <span className="font-mono text-sm">{student.roll_no}</span> · {student.department} · Year {student.year}, Division{' '}
            {student.division}
          </p>
          <p className="mt-1 flex flex-wrap gap-x-4 text-sm">
            <a href={`mailto:${student.email}`} className="link">
              {student.email}
            </a>
            {student.phone && (
              <a href={`tel:${student.phone}`} className="link">
                {student.phone}
              </a>
            )}
          </p>
        </div>
        <Button onClick={() => setInviting(true)}>Invite to a meeting</Button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard label="Latest SGPA" value={formatSgpa(latest?.sgpa)} tone={latest && latest.sgpa < 6 ? 'red' : undefined} />
        <SummaryCard label="Unresolved flags" value={unresolved} tone={unresolved ? 'red' : undefined} />
        <SummaryCard label="Meetings held" value={meetings.filter((m) => m.status === 'completed').length} />
        <SummaryCard label="Semesters on record" value={results.length} />
      </div>

      <Panel bodyClassName="">
        <div className="border-b border-neutral-200 px-4 md:px-5">
          <Tabs
            tabs={[
              { value: 'flags', label: 'Flags', count: flags.length },
              { value: 'results', label: 'Results', count: results.length },
              { value: 'internals', label: 'Internals', count: internals.length },
              { value: 'meetings', label: 'Meetings', count: meetings.length },
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>

        {tab === 'flags' &&
          (flags.length === 0 ? (
            <EmptyState
              message="This student has no flags on record."
              action={
                <Button variant="secondary" onClick={() => setTab('results')}>
                  View results
                </Button>
              }
            />
          ) : (
            <FlagTable flags={flags} detailPath={(flag) => `/mentor/flags/${flag.id}`} onResolve={setResolving} />
          ))}

        {tab === 'results' &&
          (results.length === 0 ? (
            <EmptyState
              message="No semester results have been verified yet."
              action={<LinkButton to="/mentor/verification">Open the verification queue</LinkButton>}
            />
          ) : (
            <>
              {results.length > 1 && (
                <div className="border-b border-neutral-200 p-4 md:p-5">
                  <LineChart
                    points={results.map((r) => ({ label: r.semester.label, value: r.sgpa }))}
                    threshold={{ value: 6, label: 'F3 threshold 6.0' }}
                  />
                </div>
              )}
              <DataTable columns={RESULT_COLUMNS} rows={results} />
            </>
          ))}

        {tab === 'internals' &&
          (internals.length === 0 ? (
            <EmptyState
              message="No internal marks have been verified yet."
              action={<LinkButton to="/mentor/verification">Open the verification queue</LinkButton>}
            />
          ) : (
            internals.map((sub) => (
              <section key={sub.id}>
                <h3 className="border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-sm font-semibold md:px-5">{sub.semester.label}</h3>
                <DataTable columns={INTERNAL_COLUMNS} rows={sub.subjects} rowKey={(s) => s.subject_name} />
              </section>
            ))
          ))}

        {tab === 'meetings' &&
          (meetings.length === 0 ? (
            <EmptyState
              message="You have not met this student yet."
              action={
                <Button variant="secondary" onClick={() => setInviting(true)}>
                  Invite to a meeting
                </Button>
              }
            />
          ) : (
            <MeetingTable meetings={[...meetings].reverse()} perspective="mentor" />
          ))}
      </Panel>

      <ResolveFlagModal flag={resolving} onClose={() => setResolving(null)} onResolved={state.reload} />
      <InviteModal open={inviting} student={student} onClose={() => setInviting(false)} onInvited={state.reload} />
    </>
  )
}
