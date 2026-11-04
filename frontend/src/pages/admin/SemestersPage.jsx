import { useEffect, useState } from 'react'
import { api, errorMessage } from '../../api/client'
import { Button } from '../../components/ui/Button'
import { Panel } from '../../components/ui/Card'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { DataTable } from '../../components/ui/DataTable'
import { Alert, EmptyState, Loadable } from '../../components/ui/Feedback'
import { Input } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { Status } from '../../components/ui/Status'
import { useToast } from '../../components/ui/Toast'
import { formatDate, formatDateTime, isoToLocalInput, localInputToIso } from '../../lib/format'
import { useApi } from '../../lib/useApi'

function CreateModal({ open, onClose, onCreated }) {
  const toast = useToast()
  const [form, setForm] = useState({ label: '', start_date: '' })
  const [labelError, setLabelError] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setForm({ label: '', start_date: '' })
      setLabelError(null)
      setError(null)
    }
  }, [open])

  const submit = async (event) => {
    event.preventDefault()
    if (!form.label.trim()) return setLabelError('Enter a label, for example 2026-27 Odd.')
    setBusy(true)
    setError(null)
    try {
      const { data } = await api.post('/admin/semesters', {
        label: form.label.trim(),
        start_date: form.start_date || null,
      })
      toast.success(`${data.label} created. Set its deadlines next.`)
      onCreated()
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="New semester"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="semester-form" loading={busy}>
            Create semester
          </Button>
        </>
      }
    >
      <form id="semester-form" onSubmit={submit} className="space-y-4" noValidate>
        <Input
          label="Label"
          value={form.label}
          onChange={(e) => {
            setForm({ ...form, label: e.target.value })
            setLabelError(null)
          }}
          error={labelError}
          placeholder="e.g. 2026-27 Odd"
          maxLength={50}
          required
        />
        <Input
          label="Start date"
          type="date"
          value={form.start_date}
          onChange={(e) => setForm({ ...form, start_date: e.target.value })}
          hint="Used to order semesters when comparing a student with their previous semester."
        />
        {error && <Alert tone="error">{error}</Alert>}
      </form>
    </Modal>
  )
}

function DeadlinesModal({ semester, onClose, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState({ internal: '', result: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (semester) {
      setForm({
        internal: isoToLocalInput(semester.internal_deadline),
        result: isoToLocalInput(semester.result_deadline),
      })
      setError(null)
    }
  }, [semester])

  const submit = async (event) => {
    event.preventDefault()
    const body = {}
    if (form.internal) body.internal_deadline = localInputToIso(form.internal)
    if (form.result) body.result_deadline = localInputToIso(form.result)
    if (Object.keys(body).length === 0) return setError('Set at least one deadline.')
    setBusy(true)
    setError(null)
    try {
      await api.patch(`/admin/semesters/${semester.id}`, body)
      toast.success('Deadlines saved.')
      onSaved()
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={Boolean(semester)}
      onClose={onClose}
      size="sm"
      title="Submission deadlines"
      description={semester?.label}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="deadline-form" loading={busy}>
            Save deadlines
          </Button>
        </>
      }
    >
      <form id="deadline-form" onSubmit={submit} className="space-y-4" noValidate>
        <Input
          label="Internal marks deadline"
          type="datetime-local"
          value={form.internal}
          onChange={(e) => setForm({ ...form, internal: e.target.value })}
        />
        <Input
          label="Semester result deadline"
          type="datetime-local"
          value={form.result}
          onChange={(e) => setForm({ ...form, result: e.target.value })}
        />
        <p className="text-xs text-neutral-500">
          After a deadline passes, the daily check raises an F5 flag for every active student without a submission of that
          kind. Past dates are accepted so that records can be corrected.
        </p>
        {error && <Alert tone="error">{error}</Alert>}
      </form>
    </Modal>
  )
}

export default function SemestersPage() {
  const toast = useToast()
  const state = useApi('/semesters')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(null)
  const [toggling, setToggling] = useState(null)

  const deadline = (value) => {
    if (!value) return <span className="text-neutral-400">Not set</span>
    const past = new Date(value) < new Date()
    return <span className={past ? 'text-neutral-500' : 'text-neutral-800'}>{formatDateTime(value)}</span>
  }

  const actions = (s) => (
    <>
      <Button variant="text" onClick={() => setEditing(s)}>
        Deadlines
      </Button>
      <Button variant="text" onClick={() => setToggling(s)}>
        {s.status === 'open' ? 'Close' : 'Reopen'}
      </Button>
    </>
  )

  const columns = [
    { key: 'label', header: 'Semester', render: (s) => <span className="font-medium text-neutral-800">{s.label}</span> },
    { key: 'start', header: 'Starts', render: (s) => (s.start_date ? formatDate(`${s.start_date}T00:00:00`) : null) },
    { key: 'internal', header: 'Internal deadline', render: (s) => deadline(s.internal_deadline) },
    { key: 'result', header: 'Result deadline', render: (s) => deadline(s.result_deadline) },
    { key: 'status', header: 'Status', render: (s) => <Status kind="semester" status={s.status} /> },
  ]

  return (
    <>
      <PageHeader
        title="Semesters"
        description="Open semesters accept submissions. Closing one stops new submissions."
        actions={<Button onClick={() => setCreating(true)}>New semester</Button>}
      />
      <Panel bodyClassName="">
        <Loadable state={state}>
          {(list) =>
            list.length === 0 ? (
              <EmptyState
                message="There are no semesters yet. Create the current semester so students can submit their marks."
                action={
                  <Button variant="secondary" onClick={() => setCreating(true)}>
                    New semester
                  </Button>
                }
              />
            ) : (
              <DataTable columns={columns} rows={list} actions={actions} />
            )
          }
        </Loadable>
      </Panel>

      <CreateModal open={creating} onClose={() => setCreating(false)} onCreated={state.reload} />
      <DeadlinesModal semester={editing} onClose={() => setEditing(null)} onSaved={state.reload} />
      <ConfirmModal
        open={Boolean(toggling)}
        title={toggling?.status === 'open' ? `Close ${toggling?.label}?` : `Reopen ${toggling?.label}?`}
        confirmLabel={toggling?.status === 'open' ? 'Close semester' : 'Reopen semester'}
        destructive={toggling?.status === 'open'}
        onClose={() => setToggling(null)}
        onConfirm={async () => {
          const status = toggling.status === 'open' ? 'closed' : 'open'
          await api.patch(`/admin/semesters/${toggling.id}`, { status })
          toast.success(`${toggling.label} is now ${status}.`)
          state.reload()
        }}
      >
        {toggling?.status === 'open'
          ? 'Students will no longer be able to submit internal marks or results for this semester. Deadline checks still apply.'
          : 'Students will be able to submit for this semester again.'}
      </ConfirmModal>
    </>
  )
}
