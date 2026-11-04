import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarPlus, Mail, Phone } from 'lucide-react'
import { LineChart } from '../../components/charts/Charts'
import { FlagTable } from '../../components/domain/FlagTable'
import { InviteModal } from '../../components/domain/InviteModal'
import { MeetingItem } from '../../components/domain/MeetingItem'
import { ResolveFlagModal } from '../../components/domain/ResolveFlagModal'
import { IndicatorDot } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState, ErrorState, Spinner } from '../../components/ui/Feedback'
import { Tabs } from '../../components/ui/Tabs'
import { formatDate, formatSgpa } from '../../lib/format'
import { useApi } from '../../lib/useApi'

function indicatorFor(flags) {
  if (flags.some((f) => f.status === 'escalated')) return 'amber'
  if (flags.some((f) => f.status !== 'resolved')) return 'red'
  return 'green'
}

function ResultsHistory({ results }) {
  if (results.length === 0) return <EmptyState title="No verified results yet" />
  return (
    <div className="space-y-6">
      {results.length > 1 && (
        <LineChart
          points={results.map((r) => ({ label: r.semester.label, value: r.sgpa }))}
          reference={{ value: 6, label: 'F3 threshold (6.0)' }}
        />
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="border-b border-slate-200">
            <tr>
              <th className="table-head">Semester</th>
              <th className="table-head">SGPA</th>
              <th className="table-head">Subjects below 40</th>
              <th className="table-head">Verified</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {results.map((r) => {
              const weak = r.subjects.filter((s) => s.final_marks < 40)
              return (
                <tr key={r.id}>
                  <td className="table-cell font-medium text-slate-900">{r.semester.label}</td>
                  <td className={`table-cell tabular-nums ${r.sgpa < 6 ? 'font-medium text-red-600' : ''}`}>
                    {formatSgpa(r.sgpa)}
                  </td>
                  <td className="table-cell">
                    {weak.length ? weak.map((s) => `${s.subject_name} (${s.final_marks})`).join(', ') : '—'}
                  </td>
                  <td className="table-cell">{formatDate(r.verified_at)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function InternalsHistory({ submissions }) {
  if (submissions.length === 0) return <EmptyState title="No verified internal marks yet" />
  return (
    <div className="space-y-5">
      {submissions.map((sub) => (
        <div key={sub.id}>
          <p className="mb-2 text-sm font-semibold text-slate-900">{sub.semester.label}</p>
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="table-head">Subject</th>
                  <th className="table-head text-center">I1</th>
                  <th className="table-head text-center">I2</th>
                  <th className="table-head text-center">I3</th>
                  <th className="table-head text-right">Effective</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sub.subjects.map((s) => {
                  const pct = (s.effective_internal / s.max_per_test) * 100
                  return (
                    <tr key={s.subject_name}>
                      <td className="table-cell text-slate-900">{s.subject_name}</td>
                      {[s.i1, s.i2, s.i3].map((m, i) => (
                        <td key={i} className="table-cell text-center tabular-nums">
                          {m ?? '—'}
                        </td>
                      ))}
                      <td className={`table-cell text-right tabular-nums ${pct < 40 ? 'font-medium text-red-600' : ''}`}>
                        {s.effective_internal.toFixed(1)}/{s.max_per_test} ({pct.toFixed(0)}%)
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function MenteeDetailPage() {
  const { studentId } = useParams()
  const state = useApi(`/mentor/mentees/${studentId}`)
  const [tab, setTab] = useState('flags')
  const [resolving, setResolving] = useState(null)
  const [inviting, setInviting] = useState(false)

  if (state.loading && !state.data) return <Spinner />
  if (state.error && !state.data) {
    if (state.error.response?.status === 404) {
      return (
        <EmptyState title="Student not found" action={<Link to="/mentor" className="text-sm link">Back to your roster</Link>}>
          This student is not one of your current mentees.
        </EmptyState>
      )
    }
    return <ErrorState error={state.error} onRetry={state.reload} />
  }

  const { student, results, internal_submissions: internals, flags, meetings } = state.data
  const unresolved = flags.filter((f) => f.status !== 'resolved').length
  const latest = results.at(-1)

  return (
    <>
      <Link to="/mentor" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Roster
      </Link>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{student.name}</h1>
            <IndicatorDot indicator={indicatorFor(flags)} withLabel />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {student.roll_no} · {student.department} · Year {student.year}, Division {student.division}
          </p>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <a href={`mailto:${student.email}`} className="inline-flex items-center gap-1.5 link">
              <Mail className="h-3.5 w-3.5" aria-hidden /> {student.email}
            </a>
            {student.phone && (
              <a href={`tel:${student.phone}`} className="inline-flex items-center gap-1.5 link">
                <Phone className="h-3.5 w-3.5" aria-hidden /> {student.phone}
              </a>
            )}
          </div>
        </div>
        <Button icon={CalendarPlus} onClick={() => setInviting(true)}>
          Invite to a meeting
        </Button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="card px-4 py-3">
          <p className="text-xs text-slate-500">Latest SGPA</p>
          <p className={`text-xl font-semibold tabular-nums ${latest && latest.sgpa < 6 ? 'text-red-600' : ''}`}>
            {formatSgpa(latest?.sgpa)}
          </p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-xs text-slate-500">Unresolved flags</p>
          <p className={`text-xl font-semibold tabular-nums ${unresolved ? 'text-red-600' : ''}`}>{unresolved}</p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-xs text-slate-500">Meetings held</p>
          <p className="text-xl font-semibold tabular-nums">{meetings.filter((m) => m.status === 'completed').length}</p>
        </div>
        <div className="card px-4 py-3">
          <p className="text-xs text-slate-500">Semesters on record</p>
          <p className="text-xl font-semibold tabular-nums">{results.length}</p>
        </div>
      </div>

      <Card bodyClassName="">
        <div className="px-4 pt-2 sm:px-5">
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
            <EmptyState title="No flags on record" />
          ) : (
            <FlagTable flags={flags} onResolve={setResolving} />
          ))}
        {tab === 'results' && (
          <div className="p-4 sm:p-5">
            <ResultsHistory results={results} />
          </div>
        )}
        {tab === 'internals' && (
          <div className="p-4 sm:p-5">
            <InternalsHistory submissions={internals} />
          </div>
        )}
        {tab === 'meetings' &&
          (meetings.length === 0 ? (
            <EmptyState title="No meetings yet" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {[...meetings].reverse().map((m) => (
                <MeetingItem key={m.id} meeting={m} perspective="mentor" />
              ))}
            </ul>
          ))}
      </Card>

      <ResolveFlagModal flag={resolving} onClose={() => setResolving(null)} onResolved={state.reload} />
      <InviteModal
        open={inviting}
        student={student}
        onClose={() => setInviting(false)}
        onInvited={state.reload}
      />
    </>
  )
}
