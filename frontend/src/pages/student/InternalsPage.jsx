import { useMemo, useState } from 'react'
import { ClipboardCheck, Pencil, Plus, Trash2 } from 'lucide-react'
import { api, errorMessage } from '../../api/client'
import { StatusBadge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Alert, EmptyState, Loadable } from '../../components/ui/Feedback'
import { Select } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { useToast } from '../../components/ui/Toast'
import { formatDate, formatDateTime } from '../../lib/format'
import { useApi } from '../../lib/useApi'

const LIVE = ['pending', 'verified']
const blankRow = () => ({ subject_name: '', i1: '', i2: '', i3: '', max_per_test: '20' })

const toNumber = (value) => (value === '' || value === null || value === undefined ? null : Number(value))

function validateRows(rows) {
  if (rows.length === 0) return 'Add at least one subject.'
  const names = new Set()
  for (const [index, row] of rows.entries()) {
    const label = row.subject_name.trim() || `Row ${index + 1}`
    if (!row.subject_name.trim()) return `Row ${index + 1}: enter the subject name.`
    const key = row.subject_name.trim().toLowerCase()
    if (names.has(key)) return `"${row.subject_name.trim()}" is listed twice.`
    names.add(key)
    const max = toNumber(row.max_per_test)
    if (!Number.isInteger(max) || max <= 0) return `${label}: maximum per test must be a whole number above 0.`
    const marks = [row.i1, row.i2, row.i3].map(toNumber).filter((m) => m !== null)
    if (marks.length === 0) return `${label}: enter at least one test mark.`
    if (marks.some((m) => !Number.isInteger(m) || m < 0 || m > max)) {
      return `${label}: marks must be whole numbers from 0 to ${max}.`
    }
  }
  return null
}

const toPayload = (rows) =>
  rows.map((row) => ({
    subject_name: row.subject_name.trim(),
    i1: toNumber(row.i1),
    i2: toNumber(row.i2),
    i3: toNumber(row.i3),
    max_per_test: Number(row.max_per_test),
  }))

function NumberCell({ label, value, onChange, max }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500 sm:sr-only">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min="0"
        max={max}
        step="1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input text-center tabular-nums"
        aria-label={label}
      />
    </label>
  )
}

function SubjectRows({ rows, setRows }) {
  const update = (index, field) => (value) =>
    setRows(rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)))

  return (
    <div>
      <div className="hidden grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_4.5rem_5.5rem_2.5rem] gap-2 pb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:grid">
        <span>Subject</span>
        <span className="text-center">I1</span>
        <span className="text-center">I2</span>
        <span className="text-center">I3</span>
        <span className="text-center">Max / test</span>
        <span />
      </div>
      <div className="space-y-3 sm:space-y-2">
        {rows.map((row, index) => (
          <div
            key={index}
            className="rounded-md border border-slate-200 p-3 sm:grid sm:grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_4.5rem_5.5rem_2.5rem] sm:items-center sm:gap-2 sm:border-0 sm:p-0"
          >
            <div className="flex items-end gap-2 sm:block">
              <label className="block flex-1">
                <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500 sm:sr-only">Subject</span>
                <input
                  value={row.subject_name}
                  onChange={(e) => update(index, 'subject_name')(e.target.value)}
                  className="input"
                  placeholder="e.g. Data Structures"
                  maxLength={120}
                  aria-label="Subject"
                />
              </label>
              <Button
                variant="ghost"
                className="w-11 px-0 sm:hidden"
                onClick={() => setRows(rows.filter((_, i) => i !== index))}
                disabled={rows.length === 1}
                aria-label="Remove subject"
                icon={Trash2}
              />
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2 sm:contents">
              <NumberCell label="I1" value={row.i1} onChange={update(index, 'i1')} max={row.max_per_test} />
              <NumberCell label="I2" value={row.i2} onChange={update(index, 'i2')} max={row.max_per_test} />
              <NumberCell label="I3" value={row.i3} onChange={update(index, 'i3')} max={row.max_per_test} />
              <NumberCell label="Max / test" value={row.max_per_test} onChange={update(index, 'max_per_test')} />
            </div>
            <Button
              variant="ghost"
              className="hidden w-10 px-0 sm:inline-flex"
              onClick={() => setRows(rows.filter((_, i) => i !== index))}
              disabled={rows.length === 1}
              aria-label="Remove subject"
              icon={Trash2}
            />
          </div>
        ))}
      </div>
      <Button variant="link" icon={Plus} className="mt-3" onClick={() => setRows([...rows, blankRow()])}>
        Add subject
      </Button>
    </div>
  )
}

function SubmissionForm({ open, onClose, semesters, existing, onSaved }) {
  const toast = useToast()
  const editing = Boolean(existing)
  const [semesterId, setSemesterId] = useState('')
  const [rows, setRows] = useState([blankRow()])
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [lastOpen, setLastOpen] = useState(false)

  // Reset the form whenever it is opened.
  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) {
      setError(null)
      setSemesterId(existing ? String(existing.semester.id) : semesters[0] ? String(semesters[0].id) : '')
      setRows(
        existing
          ? existing.subjects.map((s) => ({
              subject_name: s.subject_name,
              i1: s.i1 ?? '',
              i2: s.i2 ?? '',
              i3: s.i3 ?? '',
              max_per_test: String(s.max_per_test),
            }))
          : [blankRow()],
      )
    }
  }

  const submit = async (event) => {
    event.preventDefault()
    const problem = !editing && !semesterId ? 'Choose a semester.' : validateRows(rows)
    if (problem) {
      setError(problem)
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (editing) {
        await api.patch(`/students/me/internal-submissions/${existing.id}`, { subjects: toPayload(rows) })
        toast.success('Submission updated.')
      } else {
        await api.post('/students/me/internal-submissions', {
          semester_id: Number(semesterId),
          subjects: toPayload(rows),
        })
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
      description="Enter the marks for each internal test (I1–I3). Leave a test blank if it has not been held yet."
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
        {error && <Alert tone="error">{error}</Alert>}
        {editing ? (
          <p className="text-sm text-slate-600">
            Semester: <span className="font-medium text-slate-900">{existing.semester.label}</span>
          </p>
        ) : (
          <Select label="Semester" value={semesterId} onChange={(e) => setSemesterId(e.target.value)} required className="sm:max-w-xs">
            {semesters.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
        )}
        <SubjectRows rows={rows} setRows={setRows} />
        <p className="text-xs text-slate-500">
          Your effective internal score per subject is the average of your best two tests. It is calculated
          by the system when your mentor verifies the submission.
        </p>
      </form>
    </Modal>
  )
}

function SubmissionCard({ submission, onEdit }) {
  const verified = submission.status === 'verified'
  return (
    <Card
      title={submission.semester.label}
      description={`Submitted ${formatDateTime(submission.submitted_at)}${
        verified && submission.verified_at ? ` · verified ${formatDate(submission.verified_at)}` : ''
      }`}
      actions={
        <>
          <StatusBadge status={submission.status} />
          {submission.status === 'pending' && (
            <Button size="sm" variant="secondary" icon={Pencil} onClick={() => onEdit(submission)}>
              Edit
            </Button>
          )}
        </>
      }
      bodyClassName=""
    >
      {submission.status === 'rejected' && submission.rejection_note && (
        <div className="px-4 pt-4 sm:px-5">
          <Alert tone="error" title="Returned by your mentor">
            {submission.rejection_note}
          </Alert>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="table-head">Subject</th>
              <th className="table-head text-center">I1</th>
              <th className="table-head text-center">I2</th>
              <th className="table-head text-center">I3</th>
              <th className="table-head text-right">Effective</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {submission.subjects.map((s) => {
              const pct = s.effective_internal !== null ? (s.effective_internal / s.max_per_test) * 100 : null
              return (
                <tr key={s.subject_name}>
                  <td className="table-cell font-medium text-slate-900">{s.subject_name}</td>
                  {[s.i1, s.i2, s.i3].map((m, i) => (
                    <td key={i} className="table-cell text-center tabular-nums">
                      {m ?? <span className="text-slate-300">—</span>}
                      <span className="text-slate-400">/{s.max_per_test}</span>
                    </td>
                  ))}
                  <td className="table-cell text-right tabular-nums">
                    {pct === null ? (
                      <span className="text-slate-400">After verification</span>
                    ) : (
                      <span className={pct < 40 ? 'font-medium text-red-600' : 'text-slate-900'}>
                        {s.effective_internal.toFixed(1)} ({pct.toFixed(0)}%)
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

export default function InternalsPage() {
  const submissions = useApi('/students/me/internal-submissions')
  const semesters = useApi('/semesters')
  const [form, setForm] = useState({ open: false, existing: null })

  // Open semesters without a live submission can receive a new one.
  const available = useMemo(() => {
    if (!semesters.data || !submissions.data) return []
    const taken = new Set(submissions.data.filter((s) => LIVE.includes(s.status)).map((s) => s.semester.id))
    return semesters.data.filter((s) => s.status === 'open' && !taken.has(s.id))
  }, [semesters.data, submissions.data])

  return (
    <>
      <PageHeader
        title="Internal marks"
        description="Mid-semester internal test marks, verified by your mentor."
        actions={
          <Button icon={Plus} onClick={() => setForm({ open: true, existing: null })} disabled={available.length === 0}>
            New submission
          </Button>
        }
      />
      {semesters.data && submissions.data && available.length === 0 && (
        <Alert tone="info" className="mb-6">
          There is no open semester waiting for internal marks. Each semester takes one submission; if your
          mentor returns one, you can submit it again.
        </Alert>
      )}
      <Loadable state={submissions}>
        {(list) =>
          list.length === 0 ? (
            <Card>
              <EmptyState icon={ClipboardCheck} title="No submissions yet">
                Submit your I1–I3 marks once your internal tests are held.
              </EmptyState>
            </Card>
          ) : (
            <div className="space-y-4">
              {list.map((submission) => (
                <SubmissionCard
                  key={submission.id}
                  submission={submission}
                  onEdit={(existing) => setForm({ open: true, existing })}
                />
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
