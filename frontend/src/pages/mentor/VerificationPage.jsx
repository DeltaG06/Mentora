import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, errorMessage } from '../../api/client'
import { effectiveText } from '../../components/domain/MarksGrid'
import { openProof, ProofViewer } from '../../components/domain/ProofViewer'
import { Button, LinkButton } from '../../components/ui/Button'
import { Panel } from '../../components/ui/Card'
import { DataTable } from '../../components/ui/DataTable'
import { Alert, EmptyState, Loadable } from '../../components/ui/Feedback'
import { Select, Textarea } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { FlagLine, Status } from '../../components/ui/Status'
import { Tabs } from '../../components/ui/Tabs'
import { useToast } from '../../components/ui/Toast'
import { formatDateTime, formatSgpa } from '../../lib/format'
import { useApi } from '../../lib/useApi'

const KINDS = {
  internal: { path: '/mentor/internal-submissions', label: 'Internals' },
  result: { path: '/mentor/results', label: 'Results' },
}

const INTERNAL_COLUMNS = [
  { key: 'subject_name', header: 'Subject' },
  { key: 'i1', header: 'I1', align: 'right' },
  { key: 'i2', header: 'I2', align: 'right' },
  { key: 'i3', header: 'I3', align: 'right' },
  { key: 'max_per_test', header: 'Max / test', align: 'right' },
  { key: 'effective', header: 'Effective', align: 'right', render: effectiveText },
]

const RESULT_COLUMNS = [
  { key: 'subject_name', header: 'Subject' },
  {
    key: 'final_marks',
    header: 'Final',
    align: 'right',
    render: (s) => <span className={s.final_marks < 40 ? 'text-red-600' : ''}>{s.final_marks}</span>,
  },
  { key: 'max_marks', header: 'Max', align: 'right' },
]

function Outcome({ flags, studentId }) {
  if (flags.length === 0) return <Alert tone="success">Verified. No flags raised.</Alert>
  return (
    <Alert tone="error" title={`${flags.length} flag${flags.length === 1 ? '' : 's'} raised`}>
      <ul className="mt-2 space-y-1.5">
        {flags.map((flag) => (
          <li key={flag.id}>
            <FlagLine flag={flag} />
          </li>
        ))}
      </ul>
      <p className="mt-2 text-neutral-700">
        The student has been notified.{' '}
        <Link to={`/mentor/mentees/${studentId}`} className="link">
          Open their record
        </Link>{' '}
        to plan a meeting.
      </p>
    </Alert>
  )
}

function ReviewModal({ kind, record, onClose, onDone }) {
  const toast = useToast()
  const [mode, setMode] = useState('review')
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [raised, setRaised] = useState(null)
  const [current, setCurrent] = useState(null)

  if (record !== current) {
    setCurrent(record)
    setMode('review')
    setNote('')
    setNoteError(null)
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
      setNoteError('Explain what the student needs to correct.')
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
  if (mode === 'done') footer = <Button onClick={onClose}>Done</Button>
  else if (mode === 'reject') {
    footer = (
      <>
        <Button variant="secondary" onClick={() => setMode('review')} disabled={busy}>
          Back
        </Button>
        <Button variant="destructive" onClick={reject} loading={busy}>
          Return to student
        </Button>
      </>
    )
  } else if (pending) {
    footer = (
      <>
        <Button variant="destructive" onClick={() => setMode('reject')} disabled={busy}>
          Reject
        </Button>
        <Button onClick={verify} loading={busy}>
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
      description={`${kind === 'internal' ? 'Internal marks' : 'Semester result'} · ${record.student.roll_no} · submitted ${formatDateTime(
        record.submitted_at,
      )}`}
      footer={footer}
    >
      <div className="space-y-5">
        {mode === 'done' && <Outcome flags={raised} studentId={record.student.id} />}
        {error && <Alert tone="error">{error}</Alert>}
        {record.status === 'rejected' && record.rejection_note && (
          <Alert tone="warning" title="Returned to the student">
            {record.rejection_note}
          </Alert>
        )}
        {mode === 'reject' ? (
          <Textarea
            label="Reason for returning"
            value={note}
            onChange={(e) => {
              setNote(e.target.value)
              if (noteError) setNoteError(null)
            }}
            error={noteError}
            placeholder="e.g. The marks do not match the uploaded result. Please correct and resubmit."
            hint="The student sees this note and can submit again."
            required
          />
        ) : (
          mode === 'review' && (
            <>
              {pending && (
                <p className="text-base text-neutral-600">
                  Check the figures against {kind === 'result' ? 'the proof' : 'your records'}. A verified record cannot be
                  changed, and verifying runs the flag rules immediately.
                </p>
              )}
              {kind === 'internal' ? (
                <div className="rounded-md border border-neutral-200">
                  <DataTable columns={INTERNAL_COLUMNS} rows={record.subjects} rowKey={(s) => s.subject_name} />
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                  <div>
                    <p className="text-xs text-neutral-500">SGPA claimed</p>
                    <p className="text-xl text-neutral-900">{formatSgpa(record.sgpa)}</p>
                    <div className="mt-3 rounded-md border border-neutral-200">
                      <DataTable columns={RESULT_COLUMNS} rows={record.subjects} rowKey={(s) => s.subject_name} />
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-xs text-neutral-500">Proof</p>
                    <ProofViewer path={`/mentor/results/${record.id}/proof`} />
                  </div>
                </div>
              )}
            </>
          )
        )}
      </div>
    </Modal>
  )
}

function Queue({ kind, status, refresh, onChanged }) {
  const toast = useToast()
  const state = useApi(KINDS[kind].path, { status }, refresh)
  const [selected, setSelected] = useState(null)

  const viewProof = async (record) => {
    try {
      await openProof(`/mentor/results/${record.id}/proof`)
    } catch (err) {
      toast.error(errorMessage(err, 'The proof file could not be opened.'))
    }
  }

  const columns = [
    {
      key: 'student',
      header: 'Student',
      render: (r) => (
        <span>
          <span className="font-medium text-neutral-800">{r.student.name}</span>
          <span className="block font-mono text-xs text-neutral-500">{r.student.roll_no}</span>
        </span>
      ),
    },
    { key: 'semester', header: 'Semester', render: (r) => r.semester.label },
    kind === 'result'
      ? { key: 'sgpa', header: 'SGPA', align: 'right', render: (r) => formatSgpa(r.sgpa) }
      : { key: 'subjects', header: 'Subjects', align: 'right', render: (r) => r.subjects.length },
    { key: 'submitted', header: 'Submitted', render: (r) => formatDateTime(r.submitted_at) },
    kind === 'result' && {
      key: 'proof',
      header: 'Proof',
      render: (r) => (
        <Button variant="text" onClick={() => viewProof(r)}>
          View proof
        </Button>
      ),
    },
    { key: 'status', header: 'Status', render: (r) => <Status kind="submission" status={r.status} /> },
  ].filter(Boolean)

  return (
    <>
      <Loadable state={state}>
        {(rows) =>
          rows.length === 0 ? (
            <EmptyState
              message={status === 'pending' ? 'Nothing is waiting for verification.' : `There are no ${status} records.`}
              action={<LinkButton to="/mentor">Back to roster</LinkButton>}
            />
          ) : (
            <DataTable
              columns={columns}
              rows={rows}
              actions={(r) => (
                <Button variant="text" onClick={() => setSelected(r)}>
                  {r.status === 'pending' ? 'Review' : 'View'}
                </Button>
              )}
            />
          )
        }
      </Loadable>
      <ReviewModal kind={kind} record={selected} onClose={() => setSelected(null)} onDone={onChanged} />
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
      <Panel bodyClassName="">
        <div className="flex flex-col gap-2 border-b border-neutral-200 px-4 md:flex-row md:items-center md:justify-between md:px-5">
          <Tabs
            tabs={[
              { value: 'internal', label: KINDS.internal.label, count: internal.data?.length },
              { value: 'result', label: KINDS.result.label, count: results.data?.length },
            ]}
            value={kind}
            onChange={setKind}
          />
          <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="pb-3 md:w-40 md:pb-0">
            <option value="pending">Pending</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
          </Select>
        </div>
        <Queue key={`${kind}-${status}`} kind={kind} status={status} refresh={refresh} onChanged={() => setRefresh((n) => n + 1)} />
      </Panel>
    </>
  )
}
