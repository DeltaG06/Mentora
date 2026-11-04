import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Inbox } from 'lucide-react'
import { api, errorMessage } from '../../api/client'
import { ProofViewer } from '../../components/domain/ProofViewer'
import { RuleBadge, StatusBadge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { DataTable } from '../../components/ui/DataTable'
import { Alert, EmptyState, Loadable } from '../../components/ui/Feedback'
import { Select, Textarea } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { Tabs } from '../../components/ui/Tabs'
import { useToast } from '../../components/ui/Toast'
import { formatDateTime, formatSgpa } from '../../lib/format'
import { useApi } from '../../lib/useApi'

const KINDS = {
  internal: { path: '/mentor/internal-submissions', label: 'Internal marks', key: 'submission' },
  result: { path: '/mentor/results', label: 'Semester results', key: 'result' },
}

function InternalDetail({ record }) {
  return (
    <div className="overflow-x-auto rounded-md border border-slate-200">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="table-head">Subject</th>
            <th className="table-head text-center">I1</th>
            <th className="table-head text-center">I2</th>
            <th className="table-head text-center">I3</th>
            <th className="table-head text-center">Max / test</th>
            <th className="table-head text-right">Effective</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {record.subjects.map((s) => (
            <tr key={s.subject_name}>
              <td className="table-cell font-medium text-slate-900">{s.subject_name}</td>
              {[s.i1, s.i2, s.i3].map((m, i) => (
                <td key={i} className="table-cell text-center tabular-nums">
                  {m ?? <span className="text-slate-300">—</span>}
                </td>
              ))}
              <td className="table-cell text-center tabular-nums">{s.max_per_test}</td>
              <td className="table-cell text-right tabular-nums">
                {s.effective_internal === null ? (
                  <span className="text-slate-400">On verify</span>
                ) : (
                  `${s.effective_internal.toFixed(1)} (${((s.effective_internal / s.max_per_test) * 100).toFixed(0)}%)`
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ResultDetail({ record }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">SGPA claimed</p>
        <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">{formatSgpa(record.sgpa)}</p>
        <ul className="mt-4 divide-y divide-slate-100 rounded-md border border-slate-200">
          {record.subjects.map((s) => (
            <li key={s.subject_name} className="flex justify-between gap-3 px-3 py-2 text-sm">
              <span className="text-slate-700">{s.subject_name}</span>
              <span className={`tabular-nums ${s.final_marks < 40 ? 'font-medium text-red-600' : 'text-slate-900'}`}>
                {s.final_marks}/{s.max_marks}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Proof</p>
        <ProofViewer path={`/mentor/results/${record.id}/proof`} />
      </div>
    </div>
  )
}

function FlagsRaised({ flags, studentId }) {
  if (flags.length === 0) {
    return (
      <Alert tone="success" title="Verified. No flags raised.">
        The record did not meet any flag rule.
      </Alert>
    )
  }
  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-4">
      <p className="flex items-center gap-2 font-semibold text-red-800">
        <AlertTriangle className="h-5 w-5" aria-hidden />
        {flags.length} flag{flags.length === 1 ? '' : 's'} raised
      </p>
      <ul className="mt-3 space-y-2">
        {flags.map((flag) => (
          <li key={flag.id} className="flex items-start gap-3 rounded bg-white px-3 py-2 text-sm">
            <RuleBadge rule={flag.rule} />
            <span className="text-slate-800">{flag.reason}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-red-900">
        The student has been notified. Plan a meeting from their{' '}
        <Link to={`/mentor/mentees/${studentId}`} className="font-medium underline">
          profile
        </Link>{' '}
        or the Slots page.
      </p>
    </div>
  )
}

function ReviewModal({ kind, record, onClose, onDone }) {
  const toast = useToast()
  const [mode, setMode] = useState('review')
  const [note, setNote] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [raised, setRaised] = useState(null)
  const [current, setCurrent] = useState(null)

  if (record !== current) {
    setCurrent(record)
    setMode('review')
    setNote('')
    setError(null)
    setRaised(null)
  }
  if (!record) return null
  const { path } = KINDS[kind]
  const pending = record.status === 'pending'

  const verify = async () => {
    setBusy(true)
    setError(null)
    try {
      const { data } = await api.post(`${path}/${record.id}/verify`)
      setRaised(data.flags_raised)
      setMode('done')
      onDone()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const reject = async () => {
    if (!note.trim()) {
      setError('Explain what the student needs to correct.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.post(`${path}/${record.id}/reject`, { note: note.trim() })
      toast.success(`Returned to ${record.student.name} for correction.`)
      onDone()
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  let footer = null
  if (mode === 'done') {
    footer = <Button onClick={onClose}>Done</Button>
  } else if (mode === 'reject') {
    footer = (
      <>
        <Button variant="secondary" onClick={() => setMode('review')} disabled={busy}>
          Back
        </Button>
        <Button variant="danger" onClick={reject} loading={busy}>
          Return to student
        </Button>
      </>
    )
  } else if (pending) {
    footer = (
      <>
        <Button variant="secondary" onClick={() => setMode('reject')} disabled={busy}>
          Reject
        </Button>
        <Button icon={CheckCircle2} onClick={verify} loading={busy}>
          Verify
        </Button>
      </>
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`${record.student.name} · ${record.semester.label}`}
      description={`${KINDS[kind].label} · ${record.student.roll_no} · submitted ${formatDateTime(record.submitted_at)}`}
      footer={footer}
    >
      <div className="space-y-5">
        {error && <Alert tone="error">{error}</Alert>}
        {mode === 'done' && <FlagsRaised flags={raised} studentId={record.student.id} />}
        {record.status === 'rejected' && record.rejection_note && (
          <Alert tone="warning" title="Returned to the student">
            {record.rejection_note}
          </Alert>
        )}
        {mode === 'reject' ? (
          <Textarea
            label="Reason for returning"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. The DSA marks do not match the uploaded result. Please correct and resubmit."
            hint="The student sees this note and can submit again."
            required
          />
        ) : (
          mode === 'review' && (
            <>
              {pending && (
                <p className="text-sm text-slate-600">
                  Check the figures against {kind === 'result' ? 'the proof' : 'your records'}. Verified records cannot be
                  changed, and verification runs the flag rules immediately.
                </p>
              )}
              {kind === 'internal' ? <InternalDetail record={record} /> : <ResultDetail record={record} />}
            </>
          )
        )}
      </div>
    </Modal>
  )
}

function Queue({ kind, status, onChanged, refresh }) {
  const state = useApi(KINDS[kind].path, { status }, refresh)
  const [selected, setSelected] = useState(null)

  const columns = [
    {
      key: 'student',
      header: 'Student',
      render: (r) => (
        <span>
          <span className="font-medium text-slate-900">{r.student.name}</span>
          <span className="block text-xs text-slate-500">{r.student.roll_no}</span>
        </span>
      ),
    },
    { key: 'semester', header: 'Semester', render: (r) => r.semester.label },
    kind === 'result'
      ? { key: 'sgpa', header: 'SGPA', render: (r) => <span className="tabular-nums">{formatSgpa(r.sgpa)}</span> }
      : { key: 'subjects', header: 'Subjects', render: (r) => r.subjects.length },
    { key: 'submitted', header: 'Submitted', render: (r) => formatDateTime(r.submitted_at) },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'open',
      header: <span className="sr-only">Open</span>,
      className: 'text-right',
      mobile: false,
      render: () => <span className="text-sm font-medium text-brand-600">{status === 'pending' ? 'Review' : 'View'}</span>,
    },
  ]

  return (
    <>
      <Loadable state={state}>
        {(rows) =>
          rows.length === 0 ? (
            <EmptyState icon={Inbox} title={status === 'pending' ? 'Nothing waiting for verification' : `No ${status} records`}>
              {status === 'pending' && 'New submissions from your mentees will appear here.'}
            </EmptyState>
          ) : (
            <DataTable columns={columns} rows={rows} onRowClick={setSelected} />
          )
        }
      </Loadable>
      <ReviewModal
        kind={kind}
        record={selected}
        onClose={() => setSelected(null)}
        onDone={onChanged}
      />
    </>
  )
}

export default function VerificationPage() {
  const [kind, setKind] = useState('internal')
  const [status, setStatus] = useState('pending')
  const [refresh, setRefresh] = useState(0)
  const internal = useApi('/mentor/internal-submissions', { status: 'pending' }, refresh)
  const results = useApi('/mentor/results', { status: 'pending' }, refresh)

  return (
    <>
      <PageHeader title="Verification" description="Check your mentees' submissions. Verifying a record runs the flag rules." />
      <Card bodyClassName="">
        <div className="flex flex-col gap-3 px-4 pt-2 sm:flex-row sm:items-end sm:justify-between sm:px-5">
          <Tabs
            className="flex-1"
            tabs={[
              { value: 'internal', label: 'Internal marks', count: internal.data?.length },
              { value: 'result', label: 'Semester results', count: results.data?.length },
            ]}
            value={kind}
            onChange={setKind}
          />
          <Select
            aria-label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="pb-3 sm:w-44"
          >
            <option value="pending">Pending</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
          </Select>
        </div>
        <Queue
          key={`${kind}-${status}`}
          kind={kind}
          status={status}
          refresh={refresh}
          onChanged={() => setRefresh((n) => n + 1)}
        />
      </Card>
    </>
  )
}
