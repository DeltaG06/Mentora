import { useMemo, useRef, useState } from 'react'
import { api, errorMessage } from '../../api/client'
import { MarksGrid } from '../../components/domain/MarksGrid'
import { Button } from '../../components/ui/Button'
import { Panel } from '../../components/ui/Card'
import { DataTable } from '../../components/ui/DataTable'
import { Alert, EmptyState, Loadable, SkeletonRows } from '../../components/ui/Feedback'
import { Input, Select } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { Status } from '../../components/ui/Status'
import { useToast } from '../../components/ui/Toast'
import { formatDate, formatDateTime, formatSgpa } from '../../lib/format'
import { useApi } from '../../lib/useApi'

const LIVE = ['pending', 'verified']
const MAX_BYTES = 5 * 1024 * 1024
const ACCEPTED = ['application/pdf', 'image/jpeg', 'image/png']
const blankRow = () => ({ subject_name: '', final_marks: '', max_marks: '100' })

const GRID_COLUMNS = [
  { key: 'subject_name', header: 'Subject', type: 'text', placeholder: 'e.g. Operating Systems' },
  { key: 'final_marks', header: 'Final marks', type: 'number', width: 120 },
  { key: 'max_marks', header: 'Max marks', type: 'number', width: 120 },
]

function validateRows(rows) {
  const problems = []
  const seen = new Set()
  rows.forEach((row, index) => {
    const name = row.subject_name.trim()
    const label = name || `Row ${index + 1}`
    if (!name) problems.push({ row: index, cols: ['subject_name'], message: `Row ${index + 1}: enter the subject name.` })
    else if (seen.has(name.toLowerCase())) problems.push({ row: index, cols: ['subject_name'], message: `${name} is listed twice.` })
    else seen.add(name.toLowerCase())
    const max = Number(row.max_marks)
    if (!Number.isInteger(max) || max <= 0) {
      problems.push({ row: index, cols: ['max_marks'], message: `${label}: maximum marks must be a whole number above 0.` })
      return
    }
    const marks = Number(row.final_marks)
    if (row.final_marks === '' || !Number.isInteger(marks) || marks < 0 || marks > max) {
      problems.push({ row: index, cols: ['final_marks'], message: `${label}: marks must be a whole number from 0 to ${max}.` })
    }
  })
  return problems
}

function ResultForm({ open, onClose, semesters, existing, onSaved }) {
  const toast = useToast()
  const editing = Boolean(existing)
  const fileInput = useRef(null)
  const [semesterId, setSemesterId] = useState('')
  const [sgpa, setSgpa] = useState('')
  const [rows, setRows] = useState([blankRow()])
  const [file, setFile] = useState(null)
  const [errors, setErrors] = useState({})
  const [problems, setProblems] = useState([])
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [lastOpen, setLastOpen] = useState(false)

  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) {
      setError(null)
      setErrors({})
      setProblems([])
      setFile(null)
      setSemesterId(existing ? String(existing.semester.id) : semesters[0] ? String(semesters[0].id) : '')
      setSgpa(existing ? String(existing.sgpa) : '')
      setRows(
        existing
          ? existing.subjects.map((s) => ({ subject_name: s.subject_name, final_marks: String(s.final_marks), max_marks: String(s.max_marks) }))
          : [blankRow()],
      )
    }
  }

  const submit = async (event) => {
    event.preventDefault()
    const found = {}
    const value = Number(sgpa)
    if (sgpa === '' || Number.isNaN(value) || value < 0 || value > 10) found.sgpa = 'Enter an SGPA between 0 and 10.'
    else if (!/^\d+(\.\d{1,2})?$/.test(String(sgpa).trim())) found.sgpa = 'Use at most two decimal places.'
    if (!editing && !file) found.file = 'Attach your result as a PDF, JPG or PNG.'
    else if (file && !ACCEPTED.includes(file.type)) found.file = 'The proof must be a PDF, JPG or PNG file.'
    else if (file && file.size > MAX_BYTES) found.file = 'The proof file must be 5 MB or smaller.'
    const gridProblems = validateRows(rows)
    setErrors(found)
    setProblems(gridProblems)
    setError(null)
    if (Object.keys(found).length || gridProblems.length) return

    const body = new FormData()
    body.append('sgpa', String(sgpa).trim())
    body.append(
      'subjects',
      JSON.stringify(
        rows.map((row) => ({ subject_name: row.subject_name.trim(), final_marks: Number(row.final_marks), max_marks: Number(row.max_marks) })),
      ),
    )
    if (file) body.append('proof_file', file)

    setSaving(true)
    try {
      if (editing) {
        await api.patch(`/students/me/results/${existing.id}`, body)
        toast.success('Result updated.')
      } else {
        body.append('semester_id', semesterId)
        await api.post('/students/me/results', body)
        toast.success('Result submitted for verification.')
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
      title={editing ? 'Edit semester result' : 'Upload semester result'}
      description="Enter your SGPA and final marks exactly as they appear on the result, and attach the result as proof."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="result-form" loading={saving}>
            {editing ? 'Save changes' : 'Submit for verification'}
          </Button>
        </>
      }
    >
      <form id="result-form" onSubmit={submit} className="space-y-5" noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {editing ? (
            <div>
              <p className="label">Semester</p>
              <p className="flex h-9 items-center text-base text-neutral-900">{existing.semester.label}</p>
            </div>
          ) : (
            <Select label="Semester" value={semesterId} onChange={(e) => setSemesterId(e.target.value)} required>
              {semesters.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          )}
          <Input
            label="SGPA"
            type="number"
            inputMode="decimal"
            min="0"
            max="10"
            step="0.01"
            value={sgpa}
            onChange={(e) => setSgpa(e.target.value)}
            error={errors.sgpa}
            placeholder="e.g. 7.85"
            className="[&_input]:text-right"
            required
          />
        </div>

        <MarksGrid columns={GRID_COLUMNS} rows={rows} onChange={setRows} newRow={blankRow} problems={problems} label="Subjects" />

        <div>
          <p className="label">
            Result proof{!editing && <span className="ml-0.5 text-red-600">*</span>}
          </p>
          <div
            className={`flex flex-wrap items-center gap-3 rounded-md border px-3 py-2.5 ${errors.file ? 'border-red-300' : 'border-neutral-300'}`}
          >
            <Button variant="secondary" onClick={() => fileInput.current?.click()}>
              {file ? 'Choose another file' : 'Choose file'}
            </Button>
            <span className="min-w-0 truncate text-sm text-neutral-600">
              {file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB` : editing ? 'The current file is kept.' : 'No file chosen'}
            </span>
            <input
              ref={fileInput}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>
          {errors.file ? (
            <p className="mt-1.5 text-xs text-red-600">{errors.file}</p>
          ) : (
            <p className="mt-1.5 text-xs text-neutral-500">PDF, JPG or PNG, up to 5 MB. Only your mentor and the coordinator can open it.</p>
          )}
        </div>
        {error && <Alert tone="error">{error}</Alert>}
      </form>
    </Modal>
  )
}

const SUBJECT_COLUMNS = [
  { key: 'subject_name', header: 'Subject' },
  {
    key: 'final_marks',
    header: 'Final',
    align: 'right',
    render: (s) => <span className={s.final_marks < 40 ? 'text-red-600' : ''}>{s.final_marks}</span>,
  },
  { key: 'max_marks', header: 'Max', align: 'right' },
]

function ResultPanel({ result, onEdit }) {
  return (
    <Panel
      title={`${result.semester.label} · SGPA ${formatSgpa(result.sgpa)}`}
      description={`Submitted ${formatDateTime(result.submitted_at)}${result.verified_at ? ` · verified ${formatDate(result.verified_at)}` : ''}`}
      actions={
        <>
          <Status kind="submission" status={result.status} />
          {result.status === 'pending' && (
            <Button variant="secondary" onClick={() => onEdit(result)}>
              Edit
            </Button>
          )}
        </>
      }
      bodyClassName=""
    >
      {result.status === 'rejected' && result.rejection_note && (
        <div className="px-4 pt-4 md:px-5">
          <Alert tone="error" title="Returned by your mentor">
            {result.rejection_note}
          </Alert>
        </div>
      )}
      <DataTable columns={SUBJECT_COLUMNS} rows={result.subjects} rowKey={(s) => s.subject_name} />
    </Panel>
  )
}

export default function ResultsPage() {
  const results = useApi('/students/me/results')
  const semesters = useApi('/semesters')
  const [form, setForm] = useState({ open: false, existing: null })

  const available = useMemo(() => {
    if (!semesters.data || !results.data) return []
    const taken = new Set(results.data.filter((r) => LIVE.includes(r.status)).map((r) => r.semester.id))
    return semesters.data.filter((s) => s.status === 'open' && !taken.has(s.id))
  }, [semesters.data, results.data])

  const openNew = () => setForm({ open: true, existing: null })

  return (
    <>
      <PageHeader
        title="Semester results"
        description="End-of-semester SGPA and marks, with the official result as proof."
        actions={
          <Button onClick={openNew} disabled={available.length === 0}>
            Upload result
          </Button>
        }
      />
      <Loadable state={results} skeleton={<div className="panel"><SkeletonRows /></div>}>
        {(list) =>
          list.length === 0 ? (
            <div className="panel">
              <EmptyState
                message={
                  available.length ? 'You have not uploaded a semester result yet.' : 'There is no open semester accepting results.'
                }
                action={
                  available.length > 0 && (
                    <Button variant="secondary" onClick={openNew}>
                      Upload result
                    </Button>
                  )
                }
              />
            </div>
          ) : (
            <div className="space-y-4">
              {semesters.data && available.length === 0 && (
                <p className="text-sm text-neutral-600">
                  Every open semester already has a result. If your mentor returns one, you can upload it again.
                </p>
              )}
              {list.map((result) => (
                <ResultPanel key={result.id} result={result} onEdit={(existing) => setForm({ open: true, existing })} />
              ))}
            </div>
          )
        }
      </Loadable>
      <ResultForm
        open={form.open}
        existing={form.existing}
        semesters={available}
        onClose={() => setForm((f) => ({ ...f, open: false }))}
        onSaved={results.reload}
      />
    </>
  )
}
