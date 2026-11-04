import { useMemo, useRef, useState } from 'react'
import { FileText, Paperclip, Pencil, Plus, Trash2 } from 'lucide-react'
import { api, errorMessage } from '../../api/client'
import { StatusBadge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Alert, EmptyState, Loadable } from '../../components/ui/Feedback'
import { Input, Select } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { useToast } from '../../components/ui/Toast'
import { formatDate, formatDateTime, formatSgpa } from '../../lib/format'
import { useApi } from '../../lib/useApi'

const LIVE = ['pending', 'verified']
const MAX_BYTES = 5 * 1024 * 1024
const ACCEPTED = ['application/pdf', 'image/jpeg', 'image/png']
const blankRow = () => ({ subject_name: '', final_marks: '', max_marks: '100' })

function validate({ sgpa, rows, file, requireFile }) {
  const value = Number(sgpa)
  if (sgpa === '' || Number.isNaN(value) || value < 0 || value > 10) return 'SGPA must be between 0 and 10.'
  if (!/^\d+(\.\d{1,2})?$/.test(String(sgpa).trim())) return 'SGPA can have at most two decimal places.'
  if (rows.length === 0) return 'Add at least one subject.'
  const names = new Set()
  for (const [index, row] of rows.entries()) {
    const name = row.subject_name.trim()
    if (!name) return `Row ${index + 1}: enter the subject name.`
    if (names.has(name.toLowerCase())) return `"${name}" is listed twice.`
    names.add(name.toLowerCase())
    const max = Number(row.max_marks)
    const marks = Number(row.final_marks)
    if (!Number.isInteger(max) || max <= 0) return `${name}: maximum marks must be a whole number above 0.`
    if (row.final_marks === '' || !Number.isInteger(marks) || marks < 0 || marks > max) {
      return `${name}: marks must be a whole number from 0 to ${max}.`
    }
  }
  if (requireFile && !file) return 'Attach your result proof (PDF, JPG or PNG).'
  if (file && !ACCEPTED.includes(file.type)) return 'The proof must be a PDF, JPG or PNG file.'
  if (file && file.size > MAX_BYTES) return 'The proof file must be 5 MB or smaller.'
  return null
}

function ResultForm({ open, onClose, semesters, existing, onSaved }) {
  const toast = useToast()
  const editing = Boolean(existing)
  const fileInput = useRef(null)
  const [semesterId, setSemesterId] = useState('')
  const [sgpa, setSgpa] = useState('')
  const [rows, setRows] = useState([blankRow()])
  const [file, setFile] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [lastOpen, setLastOpen] = useState(false)

  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) {
      setError(null)
      setFile(null)
      setSemesterId(existing ? String(existing.semester.id) : semesters[0] ? String(semesters[0].id) : '')
      setSgpa(existing ? String(existing.sgpa) : '')
      setRows(
        existing
          ? existing.subjects.map((s) => ({
              subject_name: s.subject_name,
              final_marks: String(s.final_marks),
              max_marks: String(s.max_marks),
            }))
          : [blankRow()],
      )
    }
  }

  const update = (index, field) => (e) =>
    setRows(rows.map((row, i) => (i === index ? { ...row, [field]: e.target.value } : row)))

  const submit = async (event) => {
    event.preventDefault()
    const problem =
      !editing && !semesterId ? 'Choose a semester.' : validate({ sgpa, rows, file, requireFile: !editing })
    if (problem) {
      setError(problem)
      return
    }
    const body = new FormData()
    body.append('sgpa', String(sgpa).trim())
    body.append(
      'subjects',
      JSON.stringify(
        rows.map((row) => ({
          subject_name: row.subject_name.trim(),
          final_marks: Number(row.final_marks),
          max_marks: Number(row.max_marks),
        })),
      ),
    )
    if (file) body.append('proof_file', file)

    setSaving(true)
    setError(null)
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
        {error && <Alert tone="error">{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          {editing ? (
            <div>
              <p className="label">Semester</p>
              <p className="flex h-10 items-center text-sm font-medium text-slate-900">{existing.semester.label}</p>
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
            placeholder="e.g. 7.85"
            required
          />
        </div>

        <div>
          <p className="label">Subjects</p>
          <div className="space-y-2">
            {rows.map((row, index) => (
              <div key={index} className="grid grid-cols-[minmax(0,1fr)_5rem_5rem_2.75rem] items-center gap-2">
                <input
                  value={row.subject_name}
                  onChange={update(index, 'subject_name')}
                  className="input"
                  placeholder="Subject"
                  aria-label="Subject"
                  maxLength={120}
                />
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={row.final_marks}
                  onChange={update(index, 'final_marks')}
                  className="input text-center tabular-nums"
                  placeholder="Marks"
                  aria-label="Final marks"
                />
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  value={row.max_marks}
                  onChange={update(index, 'max_marks')}
                  className="input text-center tabular-nums"
                  aria-label="Maximum marks"
                  title="Maximum marks"
                />
                <Button
                  variant="ghost"
                  className="w-11 px-0"
                  icon={Trash2}
                  aria-label="Remove subject"
                  disabled={rows.length === 1}
                  onClick={() => setRows(rows.filter((_, i) => i !== index))}
                />
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">Columns: subject, final marks, maximum marks.</p>
          <Button variant="link" icon={Plus} className="mt-2" onClick={() => setRows([...rows, blankRow()])}>
            Add subject
          </Button>
        </div>

        <div>
          <p className="label">
            Result proof{!editing && <span className="ml-0.5 text-red-600">*</span>}
          </p>
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-dashed border-slate-300 px-4 py-3">
            <Button variant="secondary" icon={Paperclip} onClick={() => fileInput.current?.click()}>
              {file ? 'Choose another file' : 'Choose file'}
            </Button>
            <span className="min-w-0 truncate text-sm text-slate-600">
              {file ? `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)` : editing ? 'Keep the current file' : 'No file chosen'}
            </span>
            <input
              ref={fileInput}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>
          <p className="mt-1.5 text-xs text-slate-500">PDF, JPG or PNG, up to 5 MB. Only your mentor and the coordinator can open it.</p>
        </div>
      </form>
    </Modal>
  )
}

function ResultCard({ result, onEdit }) {
  return (
    <Card
      title={result.semester.label}
      description={`Submitted ${formatDateTime(result.submitted_at)}${
        result.verified_at ? ` · verified ${formatDate(result.verified_at)}` : ''
      }`}
      actions={
        <>
          <StatusBadge status={result.status} />
          {result.status === 'pending' && (
            <Button size="sm" variant="secondary" icon={Pencil} onClick={() => onEdit(result)}>
              Edit
            </Button>
          )}
        </>
      }
      bodyClassName=""
    >
      {result.status === 'rejected' && result.rejection_note && (
        <div className="px-4 pt-4 sm:px-5">
          <Alert tone="error" title="Returned by your mentor">
            {result.rejection_note}
          </Alert>
        </div>
      )}
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:p-5">
        <div className="shrink-0 sm:w-32">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">SGPA</p>
          <p className={`mt-1 text-3xl font-semibold tabular-nums ${result.sgpa < 6 ? 'text-red-600' : 'text-slate-900'}`}>
            {formatSgpa(result.sgpa)}
          </p>
        </div>
        <ul className="grid flex-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {result.subjects.map((s) => (
            <li key={s.subject_name} className="flex justify-between gap-3 border-b border-slate-100 py-1.5 text-sm">
              <span className="truncate text-slate-700">{s.subject_name}</span>
              <span className={`tabular-nums ${s.final_marks < 40 ? 'font-medium text-red-600' : 'text-slate-900'}`}>
                {s.final_marks}
                <span className="text-slate-400">/{s.max_marks}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
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

  return (
    <>
      <PageHeader
        title="Semester results"
        description="End-of-semester SGPA and marks, with the official result as proof."
        actions={
          <Button icon={Plus} onClick={() => setForm({ open: true, existing: null })} disabled={available.length === 0}>
            Upload result
          </Button>
        }
      />
      {semesters.data && results.data && available.length === 0 && (
        <Alert tone="info" className="mb-6">
          There is no open semester waiting for a result. If your mentor returns a result, you can upload it again.
        </Alert>
      )}
      <Loadable state={results}>
        {(list) =>
          list.length === 0 ? (
            <Card>
              <EmptyState icon={FileText} title="No results uploaded">
                Upload your result once it is declared. Your mentor verifies it against the proof.
              </EmptyState>
            </Card>
          ) : (
            <div className="space-y-4">
              {list.map((result) => (
                <ResultCard key={result.id} result={result} onEdit={(existing) => setForm({ open: true, existing })} />
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
