import { useMemo, useState } from 'react'
import { api, errorMessage } from '../../api/client'
import { effectiveText, MarksGrid } from '../../components/domain/MarksGrid'
import { Button } from '../../components/ui/Button'
import { Panel } from '../../components/ui/Card'
import { DataTable } from '../../components/ui/DataTable'
import { Alert, EmptyState, Loadable, SkeletonRows } from '../../components/ui/Feedback'
import { Select } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { Status } from '../../components/ui/Status'
import { useToast } from '../../components/ui/Toast'
import { formatDate, formatDateTime } from '../../lib/format'
import { useApi } from '../../lib/useApi'

const LIVE = ['pending', 'verified']
const blankRow = () => ({ subject_name: '', i1: '', i2: '', i3: '', max_per_test: '20', effective_internal: null })
const toNumber = (value) => (value === '' || value === null || value === undefined ? null : Number(value))

const GRID_COLUMNS = [
  { key: 'subject_name', header: 'Subject', type: 'text', placeholder: 'e.g. Data Structures' },
  { key: 'i1', header: 'I1', type: 'number', width: 80 },
  { key: 'i2', header: 'I2', type: 'number', width: 80 },
  { key: 'i3', header: 'I3', type: 'number', width: 80 },
  { key: 'max_per_test', header: 'Max / test', type: 'number', width: 96 },
  { key: 'effective', header: 'Effective', width: 120, readOnly: effectiveText },
]

function validate(rows) {
  const problems = []
  const seen = new Map()
  rows.forEach((row, index) => {
    const name = row.subject_name.trim()
    const label = name || `Row ${index + 1}`
    if (!name) problems.push({ row: index, cols: ['subject_name'], message: `Row ${index + 1}: enter the subject name.` })
    else if (seen.has(name.toLowerCase())) {
      problems.push({ row: index, cols: ['subject_name'], message: `${name} is listed twice.` })
    } else seen.set(name.toLowerCase(), index)

    const max = toNumber(row.max_per_test)
    if (!Number.isInteger(max) || max <= 0) {
      problems.push({ row: index, cols: ['max_per_test'], message: `${label}: the maximum per test must be a whole number above 0.` })
      return
    }
    const marks = ['i1', 'i2', 'i3'].filter((key) => row[key] !== '')
    if (marks.length === 0) {
      problems.push({ row: index, cols: ['i1', 'i2', 'i3'], message: `${label}: enter at least one test mark.` })
      return
    }
    const bad = marks.filter((key) => {
      const value = Number(row[key])
      return !Number.isInteger(value) || value < 0 || value > max
    })
    if (bad.length) problems.push({ row: index, cols: bad, message: `${label}: marks must be whole numbers from 0 to ${max}.` })
  })
  if (rows.length === 0) problems.push({ row: -1, cols: [], message: 'Add at least one subject.' })
  return problems
}

const toPayload = (rows) =>
  rows.map((row) => ({
    subject_name: row.subject_name.trim(),
    i1: toNumber(row.i1),
    i2: toNumber(row.i2),
    i3: toNumber(row.i3),
    max_per_test: Number(row.max_per_test),
  }))

function SubmissionForm({ open, onClose, semesters, existing, onSaved }) {
  const toast = useToast()
  const editing = Boolean(existing)
  const [semesterId, setSemesterId] = useState('')
  const [rows, setRows] = useState([blankRow()])
  const [problems, setProblems] = useState([])
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [lastOpen, setLastOpen] = useState(false)

  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) {
      setError(null)
      setProblems([])
      setSemesterId(existing ? String(existing.semester.id) : semesters[0] ? String(semesters[0].id) : '')
      setRows(
        existing
          ? existing.subjects.map((s) => ({
              subject_name: s.subject_name,
              i1: s.i1 ?? '',
              i2: s.i2 ?? '',
              i3: s.i3 ?? '',
              max_per_test: String(s.max_per_test),
              effective_internal: s.effective_internal,
            }))
          : [blankRow()],
      )
    }
  }

  const submit = async (event) => {
    event.preventDefault()
    const found = validate(rows)
    setProblems(found)
    setError(null)
    if (found.length) return
    setSaving(true)
    try {
      if (editing) {
        await api.patch(`/students/me/internal-submissions/${existing.id}`, { subjects: toPayload(rows) })
        toast.success('Submission updated.')
      } else {
        await api.post('/students/me/internal-submissions', { semester_id: Number(semesterId), subjects: toPayload(rows) })
        toast.success('Internal marks submitted for verification.')
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? 'Edit internal marks' : 'Submit internal marks'}
      description="Enter the marks for each internal test. Leave a test blank if it has not been held."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="internals-form" loading={saving}>
            {editing ? 'Save changes' : 'Submit for verification'}
          </Button>
        </>
      }
    >
      <form id="internals-form" onSubmit={submit} className="space-y-5" noValidate>
        {editing ? (
          <p className="text-base text-neutral-600">
            Semester: <span className="text-neutral-900">{existing.semester.label}</span>
          </p>
        ) : (
          <Select label="Semester" value={semesterId} onChange={(e) => setSemesterId(e.target.value)} required className="md:max-w-xs">
            {semesters.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
        )}
        <MarksGrid columns={GRID_COLUMNS} rows={rows} onChange={setRows} newRow={blankRow} problems={problems} label="Subjects" />
        <p className="text-xs text-neutral-500">
          The effective score for each subject is the average of your best two tests. The system calculates it when your
          mentor verifies the submission.
        </p>
        {error && <Alert tone="error">{error}</Alert>}
      </form>
    </Modal>
  )
}

const VIEW_COLUMNS = [
  { key: 'subject_name', header: 'Subject' },
  { key: 'i1', header: 'I1', align: 'right' },
  { key: 'i2', header: 'I2', align: 'right' },
  { key: 'i3', header: 'I3', align: 'right' },
  { key: 'max_per_test', header: 'Max / test', align: 'right' },
  { key: 'effective', header: 'Effective', align: 'right', render: effectiveText },
]

function SubmissionPanel({ submission, onEdit }) {
  return (
    <Panel
      title={submission.semester.label}
      description={`Submitted ${formatDateTime(submission.submitted_at)}${
        submission.verified_at ? ` · verified ${formatDate(submission.verified_at)}` : ''
      }`}
      actions={
        <>
          <Status kind="submission" status={submission.status} />
          {submission.status === 'pending' && (
            <Button variant="secondary" onClick={() => onEdit(submission)}>
              Edit
            </Button>
          )}
        </>
      }
      bodyClassName=""
    >
      {submission.status === 'rejected' && submission.rejection_note && (
        <div className="px-4 pt-4 md:px-5">
          <Alert tone="error" title="Returned by your mentor">
            {submission.rejection_note}
          </Alert>
        </div>
      )}
      <DataTable columns={VIEW_COLUMNS} rows={submission.subjects} rowKey={(s) => s.subject_name} />
    </Panel>
  )
}

export default function InternalsPage() {
  const submissions = useApi('/students/me/internal-submissions')
  const semesters = useApi('/semesters')
  const [form, setForm] = useState({ open: false, existing: null })

  // Open semesters without a live submission can take a new one.
  const available = useMemo(() => {
    if (!semesters.data || !submissions.data) return []
    const taken = new Set(submissions.data.filter((s) => LIVE.includes(s.status)).map((s) => s.semester.id))
    return semesters.data.filter((s) => s.status === 'open' && !taken.has(s.id))
  }, [semesters.data, submissions.data])

  const openNew = () => setForm({ open: true, existing: null })

  return (
    <>
      <PageHeader
        title="Internal marks"
        description="Mid-semester internal test marks, verified by your mentor."
        actions={
          <Button onClick={openNew} disabled={available.length === 0}>
            Submit internal marks
          </Button>
        }
      />
      <Loadable state={submissions} skeleton={<div className="panel"><SkeletonRows /></div>}>
        {(list) =>
          list.length === 0 ? (
            <div className="panel">
              <EmptyState
                message={
                  available.length
                    ? 'You have not submitted internal marks yet.'
                    : 'There is no open semester accepting internal marks.'
                }
                action={
                  available.length > 0 && (
                    <Button variant="secondary" onClick={openNew}>
                      Submit internal marks
                    </Button>
                  )
                }
              />
            </div>
          ) : (
            <div className="space-y-4">
              {semesters.data && available.length === 0 && (
                <p className="text-sm text-neutral-600">
                  Every open semester already has a submission. If your mentor returns one, you can submit it again.
                </p>
              )}
              {list.map((submission) => (
                <SubmissionPanel key={submission.id} submission={submission} onEdit={(existing) => setForm({ open: true, existing })} />
              ))}
            </div>
          )
        }
      </Loadable>
      <SubmissionForm
        open={form.open}
        existing={form.existing}
        semesters={available}
        onClose={() => setForm((f) => ({ ...f, open: false }))}
        onSaved={submissions.reload}
      />
    </>
  )
}
