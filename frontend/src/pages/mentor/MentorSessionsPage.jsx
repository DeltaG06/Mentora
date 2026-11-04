import { useMemo, useState } from 'react'
import { Plus, UsersRound } from 'lucide-react'
import { api, errorMessage } from '../../api/client'
import { Badge, IndicatorDot, StatusBadge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { Alert, EmptyState, Loadable, Spinner } from '../../components/ui/Feedback'
import { Input, Select, Textarea } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { Tabs } from '../../components/ui/Tabs'
import { useToast } from '../../components/ui/Toast'
import { formatRange, isoToLocalInput, localInputToIso } from '../../lib/format'
import { useApi } from '../../lib/useApi'

const AUDIENCES = [
  { value: 'all', label: 'All mentees', hint: 'Everyone currently allocated to you.' },
  { value: 'flagged', label: 'Flagged mentees', hint: 'Mentees with at least one unresolved flag, decided when you save.' },
  { value: 'selected', label: 'Selected mentees', hint: 'Pick the students yourself.' },
]

const AUDIENCE_LABEL = { all: 'All mentees', flagged: 'Flagged', selected: 'Selected' }

function nextHour() {
  const date = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
  date.setHours(15, 0, 0, 0)
  return isoToLocalInput(date.toISOString())
}

function CreateModal({ open, onClose, onCreated }) {
  const toast = useToast()
  const roster = useApi(open ? '/mentor/dashboard' : null)
  const [form, setForm] = useState({ title: '', agenda: '', start: nextHour(), duration: '60', audience: 'all' })
  const [selected, setSelected] = useState([])
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [lastOpen, setLastOpen] = useState(false)

  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) {
      setForm({ title: '', agenda: '', start: nextHour(), duration: '60', audience: 'all' })
      setSelected([])
      setError(null)
    }
  }

  const mentees = roster.data?.mentees || []
  const flaggedCount = mentees.filter((m) => m.indicator !== 'green').length
  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value })
  const toggle = (id) => setSelected((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))

  const submit = async (event) => {
    event.preventDefault()
    const iso = localInputToIso(form.start)
    if (!form.title.trim()) return setError('Give the session a title.')
    if (!iso || new Date(iso) <= new Date()) return setError('The session must start in the future.')
    if (form.audience === 'selected' && selected.length === 0) return setError('Select at least one mentee.')

    setBusy(true)
    setError(null)
    try {
      const body = {
        title: form.title.trim(),
        agenda: form.agenda.trim() || null,
        date_time: iso,
        duration_minutes: Number(form.duration),
        audience: form.audience,
      }
      if (form.audience === 'selected') body.student_ids = selected
      const { data } = await api.post('/mentor/group-sessions', body)
      toast.success(`Session scheduled. ${data.attendees.length} mentee${data.attendees.length === 1 ? '' : 's'} invited.`)
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
      size="lg"
      title="Schedule a group session"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="session-form" loading={busy}>
            Schedule and invite
          </Button>
        </>
      }
    >
      <form id="session-form" onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <Input label="Title" value={form.title} onChange={set('title')} maxLength={200} placeholder="e.g. Preparing for end-semester exams" required />
        <Textarea label="Agenda" rows={3} value={form.agenda} onChange={set('agenda')} hint="Optional." />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Starts" type="datetime-local" value={form.start} onChange={set('start')} required />
          <Select label="Duration" value={form.duration} onChange={set('duration')}>
            {[30, 45, 60, 90, 120].map((m) => (
              <option key={m} value={m}>
                {m} minutes
              </option>
            ))}
          </Select>
        </div>
        <fieldset>
          <legend className="label">Audience</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {AUDIENCES.map((a) => (
              <label
                key={a.value}
                className={`cursor-pointer rounded-md border p-3 text-sm ${
                  form.audience === a.value ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500' : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input type="radio" name="audience" value={a.value} checked={form.audience === a.value} onChange={set('audience')} className="sr-only" />
                <span className="block font-medium text-slate-900">
                  {a.label}
                  {roster.data && a.value !== 'selected' && (
                    <span className="ml-1 font-normal text-slate-500">
                      ({a.value === 'all' ? mentees.length : flaggedCount})
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">{a.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {form.audience === 'selected' &&
          (roster.loading && !roster.data ? (
            <Spinner />
          ) : (
            <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200">
              {mentees.map((m) => (
                <li key={m.student.id}>
                  <label className="flex min-h-[44px] cursor-pointer items-center gap-3 px-3 py-2 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-500"
                      checked={selected.includes(m.student.id)}
                      onChange={() => toggle(m.student.id)}
                    />
                    <span className="flex-1 text-sm text-slate-800">
                      {m.student.name} <span className="text-slate-500">({m.student.roll_no})</span>
                    </span>
                    <IndicatorDot indicator={m.indicator} />
                  </label>
                </li>
              ))}
            </ul>
          ))}
      </form>
    </Modal>
  )
}

function CompleteSessionModal({ session, onClose, onCompleted }) {
  const toast = useToast()
  const [minutes, setMinutes] = useState('')
  const [present, setPresent] = useState([])
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [current, setCurrent] = useState(null)

  if (session !== current) {
    setCurrent(session)
    setMinutes('')
    setPresent([])
    setError(null)
  }

  const toggle = (id) => setPresent((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))

  const submit = async (event) => {
    event.preventDefault()
    if (!minutes.trim()) return setError('Record the minutes of the session.')
    setBusy(true)
    setError(null)
    try {
      await api.post(`/mentor/group-sessions/${session.id}/complete`, {
        minutes: minutes.trim(),
        attendance: session.attendees.map((a) => ({ student_id: a.student.id, present: present.includes(a.student.id) })),
      })
      toast.success('Session recorded.')
      onCompleted()
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={Boolean(session)}
      onClose={onClose}
      size="lg"
      title="Record group session"
      description={session ? `${session.title} · ${formatRange(session.start_time, session.end_time)}` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="complete-session-form" loading={busy}>
            Mark as held
          </Button>
        </>
      }
    >
      {session && (
        <form id="complete-session-form" onSubmit={submit} className="space-y-5">
          {error && <Alert tone="error">{error}</Alert>}
          <Textarea label="Minutes" rows={5} value={minutes} onChange={(e) => setMinutes(e.target.value)} required />
          <fieldset>
            <div className="mb-2 flex items-center justify-between">
              <legend className="label mb-0">
                Attendance <span className="font-normal text-slate-500">({present.length} of {session.attendees.length} present)</span>
              </legend>
              <Button
                variant="link"
                onClick={() =>
                  setPresent(present.length === session.attendees.length ? [] : session.attendees.map((a) => a.student.id))
                }
              >
                {present.length === session.attendees.length ? 'Clear all' : 'Mark all present'}
              </Button>
            </div>
            <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
              {session.attendees.map((a) => (
                <li key={a.student.id}>
                  <label className="flex min-h-[44px] cursor-pointer items-center gap-3 px-3 py-2 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-500"
                      checked={present.includes(a.student.id)}
                      onChange={() => toggle(a.student.id)}
                    />
                    <span className="text-sm text-slate-800">
                      {a.student.name} <span className="text-slate-500">({a.student.roll_no})</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        </form>
      )}
    </Modal>
  )
}

export default function MentorSessionsPage() {
  const toast = useToast()
  const [refresh, setRefresh] = useState(0)
  const state = useApi('/mentor/group-sessions', null, refresh)
  const [tab, setTab] = useState('upcoming')
  const [creating, setCreating] = useState(false)
  const [completing, setCompleting] = useState(null)
  const [cancelling, setCancelling] = useState(null)
  const reload = () => setRefresh((n) => n + 1)

  const { upcoming, past } = useMemo(() => {
    const all = state.data || []
    const scheduled = all.filter((s) => s.status === 'scheduled')
    return { upcoming: scheduled, past: all.filter((s) => s.status !== 'scheduled').reverse() }
  }, [state.data])
  const list = tab === 'upcoming' ? upcoming : past

  return (
    <>
      <PageHeader
        title="Group sessions"
        description="Sessions for several mentees at once, with attendance."
        actions={
          <Button icon={Plus} onClick={() => setCreating(true)}>
            New session
          </Button>
        }
      />
      <Card bodyClassName="">
        <div className="px-4 pt-2 sm:px-5">
          <Tabs
            tabs={[
              { value: 'upcoming', label: 'Scheduled', count: state.data ? upcoming.length : undefined },
              { value: 'past', label: 'Held and cancelled' },
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>
        <Loadable state={state}>
          {() =>
            list.length === 0 ? (
              <EmptyState icon={UsersRound} title={tab === 'upcoming' ? 'No scheduled sessions' : 'No past sessions'} />
            ) : (
              <ul className="divide-y divide-slate-100">
                {list.map((session) => {
                  const attended = session.attendees.filter((a) => a.attended).length
                  const started = new Date(session.start_time) <= new Date()
                  return (
                    <li key={session.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">{session.title}</p>
                        <p className="mt-0.5 text-sm tabular-nums text-slate-600">{formatRange(session.start_time, session.end_time)}</p>
                        {session.agenda && <p className="mt-1 text-sm text-slate-500">{session.agenda}</p>}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <StatusBadge status={session.status} />
                          <Badge tone="slate">{AUDIENCE_LABEL[session.audience]}</Badge>
                          <span className="text-xs text-slate-500">
                            {session.status === 'completed'
                              ? `${attended} of ${session.attendees.length} attended`
                              : `${session.attendees.length} invited`}
                          </span>
                        </div>
                        {session.minutes && (
                          <p className="mt-2 whitespace-pre-line rounded-md bg-slate-50 p-3 text-sm text-slate-700">{session.minutes}</p>
                        )}
                      </div>
                      {session.status === 'scheduled' && (
                        <div className="flex shrink-0 gap-2">
                          <Button size="sm" variant={started ? 'primary' : 'secondary'} onClick={() => setCompleting(session)}>
                            Record
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setCancelling(session)}>
                            Cancel
                          </Button>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )
          }
        </Loadable>
      </Card>

      <CreateModal open={creating} onClose={() => setCreating(false)} onCreated={reload} />
      <CompleteSessionModal session={completing} onClose={() => setCompleting(null)} onCompleted={reload} />
      <ConfirmModal
        open={Boolean(cancelling)}
        title="Cancel this session?"
        confirmLabel="Cancel session"
        tone="danger"
        onClose={() => setCancelling(null)}
        onConfirm={async () => {
          await api.post(`/mentor/group-sessions/${cancelling.id}/cancel`)
          toast.success('Session cancelled. Invitees have been notified.')
          reload()
        }}
      >
        {cancelling && (
          <p>
            “{cancelling.title}” will be cancelled and all {cancelling.attendees.length} invitees notified.
          </p>
        )}
      </ConfirmModal>
    </>
  )
}
