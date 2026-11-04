import { useMemo, useState } from 'react'
import { api, errorMessage } from '../../api/client'
import { Button } from '../../components/ui/Button'
import { Panel } from '../../components/ui/Card'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { DataTable } from '../../components/ui/DataTable'
import { Alert, EmptyState, Loadable, Skeleton } from '../../components/ui/Feedback'
import { Input, Select, Textarea } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { IndicatorDot, Status } from '../../components/ui/Status'
import { Tabs } from '../../components/ui/Tabs'
import { useToast } from '../../components/ui/Toast'
import { formatRange, isoToLocalInput, localInputToIso } from '../../lib/format'
import { useApi } from '../../lib/useApi'

const AUDIENCES = [
  { value: 'all', label: 'All mentees', hint: 'Everyone currently allocated to you.' },
  { value: 'flagged', label: 'Flagged mentees', hint: 'Mentees with an unresolved flag when you save.' },
  { value: 'selected', label: 'Selected mentees', hint: 'Pick the students yourself.' },
]
const AUDIENCE_LABEL = { all: 'All mentees', flagged: 'Flagged mentees', selected: 'Selected mentees' }

function defaultStart() {
  const date = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
  date.setHours(15, 0, 0, 0)
  return isoToLocalInput(date.toISOString())
}

function CreateModal({ open, onClose, onCreated }) {
  const toast = useToast()
  const roster = useApi(open ? '/mentor/dashboard' : null)
  const [form, setForm] = useState({ title: '', agenda: '', start: '', duration: '60', audience: 'all' })
  const [selected, setSelected] = useState([])
  const [errors, setErrors] = useState({})
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [lastOpen, setLastOpen] = useState(false)

  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) {
      setForm({ title: '', agenda: '', start: defaultStart(), duration: '60', audience: 'all' })
      setSelected([])
      setErrors({})
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
    const found = {}
    if (!form.title.trim()) found.title = 'Give the session a title.'
    if (!iso || new Date(iso) <= new Date()) found.start = 'The session must start in the future.'
    if (form.audience === 'selected' && selected.length === 0) found.audience = 'Select at least one mentee.'
    setErrors(found)
    setError(null)
    if (Object.keys(found).length) return

    setBusy(true)
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
        <Input
          label="Title"
          value={form.title}
          onChange={set('title')}
          error={errors.title}
          maxLength={200}
          placeholder="e.g. Preparing for end-semester exams"
          required
        />
        <Textarea label="Agenda" rows={3} value={form.agenda} onChange={set('agenda')} hint="Optional." />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Starts" type="datetime-local" value={form.start} onChange={set('start')} error={errors.start} required />
          <Select label="Length" value={form.duration} onChange={set('duration')}>
            {[30, 45, 60, 90, 120].map((m) => (
              <option key={m} value={m}>
                {m} minutes
              </option>
            ))}
          </Select>
        </div>
        <fieldset>
          <legend className="label">Audience</legend>
          <div className="space-y-1">
            {AUDIENCES.map((a) => (
              <label key={a.value} className="flex min-h-[44px] cursor-pointer items-start gap-3 py-1.5 md:min-h-0">
                <input
                  type="radio"
                  name="audience"
                  value={a.value}
                  checked={form.audience === a.value}
                  onChange={set('audience')}
                  className="mt-1 h-4 w-4 accent-accent-700"
                />
                <span>
                  <span className="text-base text-neutral-800">
                    {a.label}
                    {roster.data && a.value !== 'selected' && (
                      <span className="ml-1 text-neutral-500">({a.value === 'all' ? mentees.length : flaggedCount})</span>
                    )}
                  </span>
                  <span className="block text-xs text-neutral-500">{a.hint}</span>
                </span>
              </label>
            ))}
          </div>
          {errors.audience && <p className="mt-1.5 text-xs text-red-600">{errors.audience}</p>}
        </fieldset>
        {form.audience === 'selected' &&
          (!roster.data ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <ul className={`max-h-64 overflow-y-auto rounded-md border ${errors.audience ? 'border-red-300' : 'border-neutral-200'}`}>
              {mentees.map((m) => (
                <li key={m.student.id} className="border-b border-neutral-200 last:border-b-0">
                  <label className="flex min-h-[44px] cursor-pointer items-center gap-3 px-3 py-2 hover:bg-neutral-50">
                    <input
                      type="checkbox"
                      className="checkbox"
                      checked={selected.includes(m.student.id)}
                      onChange={() => toggle(m.student.id)}
                    />
                    <IndicatorDot indicator={m.indicator} />
                    <span className="flex-1 text-sm text-neutral-800">
                      {m.student.name} <span className="font-mono text-xs text-neutral-500">{m.student.roll_no}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          ))}
        {error && <Alert tone="error">{error}</Alert>}
      </form>
    </Modal>
  )
}

function CompleteSessionModal({ session, onClose, onCompleted }) {
  const toast = useToast()
  const [minutes, setMinutes] = useState('')
  const [minutesError, setMinutesError] = useState(null)
  const [present, setPresent] = useState([])
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [current, setCurrent] = useState(null)

  if (session !== current) {
    setCurrent(session)
    setMinutes('')
    setMinutesError(null)
    setPresent([])
    setError(null)
  }

  const toggle = (id) => setPresent((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  const all = session ? present.length === session.attendees.length : false

  const submit = async (event) => {
    event.preventDefault()
    if (!minutes.trim()) {
      setMinutesError('Record what was discussed.')
      return
    }
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
        <form id="complete-session-form" onSubmit={submit} className="space-y-5" noValidate>
          <Textarea
            label="Minutes"
            rows={5}
            value={minutes}
            onChange={(e) => {
              setMinutes(e.target.value)
              if (minutesError) setMinutesError(null)
            }}
            error={minutesError}
            required
          />
          <fieldset>
            <div className="mb-1.5 flex items-center justify-between">
              <legend className="text-sm font-medium text-neutral-700">
                Attendance{' '}
                <span className="font-normal text-neutral-500">
                  ({present.length} of {session.attendees.length} present)
                </span>
              </legend>
              <Button variant="text" onClick={() => setPresent(all ? [] : session.attendees.map((a) => a.student.id))}>
                {all ? 'Clear all' : 'Mark all present'}
              </Button>
            </div>
            <ul className="rounded-md border border-neutral-200">
              {session.attendees.map((a) => (
                <li key={a.student.id} className="border-b border-neutral-200 last:border-b-0">
                  <label className="flex min-h-[44px] cursor-pointer items-center gap-3 px-3 py-2 hover:bg-neutral-50">
                    <input
                      type="checkbox"
                      className="checkbox"
                      checked={present.includes(a.student.id)}
                      onChange={() => toggle(a.student.id)}
                    />
                    <span className="text-sm text-neutral-800">
                      {a.student.name} <span className="font-mono text-xs text-neutral-500">{a.student.roll_no}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
          {error && <Alert tone="error">{error}</Alert>}
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
    return {
      upcoming: all.filter((s) => s.status === 'scheduled'),
      past: all.filter((s) => s.status !== 'scheduled').reverse(),
    }
  }, [state.data])

  const columns = [
    { key: 'when', header: 'When', render: (s) => <span className="whitespace-nowrap">{formatRange(s.start_time, s.end_time)}</span> },
    { key: 'title', header: 'Session', render: (s) => <span className="text-neutral-800">{s.title}</span> },
    { key: 'audience', header: 'Audience', render: (s) => AUDIENCE_LABEL[s.audience] },
    {
      key: 'invited',
      header: tab === 'upcoming' ? 'Invited' : 'Attended',
      align: 'right',
      render: (s) =>
        s.status === 'completed' ? `${s.attendees.filter((a) => a.attended).length} / ${s.attendees.length}` : s.attendees.length,
    },
    { key: 'status', header: 'Status', render: (s) => <Status kind="meeting" status={s.status} /> },
  ]

  return (
    <>
      <PageHeader
        title="Group sessions"
        description="Sessions for several mentees at once, with attendance."
        actions={<Button onClick={() => setCreating(true)}>Schedule a session</Button>}
      />
      <Panel bodyClassName="">
        <div className="border-b border-neutral-200 px-4 md:px-5">
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
          {() => {
            const list = tab === 'upcoming' ? upcoming : past
            return list.length === 0 ? (
              <EmptyState
                message={tab === 'upcoming' ? 'You have no scheduled group sessions.' : 'You have not held any group sessions yet.'}
                action={
                  <Button variant="secondary" onClick={() => setCreating(true)}>
                    Schedule a session
                  </Button>
                }
              />
            ) : (
              <DataTable
                columns={columns}
                rows={list}
                actions={(s) =>
                  s.status === 'scheduled' && (
                    <>
                      <Button variant="text" onClick={() => setCompleting(s)}>
                        Record
                      </Button>
                      <Button variant="text" onClick={() => setCancelling(s)}>
                        Cancel
                      </Button>
                    </>
                  )
                }
              />
            )
          }}
        </Loadable>
      </Panel>

      <CreateModal open={creating} onClose={() => setCreating(false)} onCreated={reload} />
      <CompleteSessionModal session={completing} onClose={() => setCompleting(null)} onCompleted={reload} />
      <ConfirmModal
        open={Boolean(cancelling)}
        title="Cancel this session?"
        confirmLabel="Cancel session"
        destructive
        onClose={() => setCancelling(null)}
        onConfirm={async () => {
          await api.post(`/mentor/group-sessions/${cancelling.id}/cancel`)
          toast.success('Session cancelled. Invitees have been notified.')
          reload()
        }}
      >
        {cancelling && <p>{cancelling.title} will be cancelled and all {cancelling.attendees.length} invitees notified.</p>}
      </ConfirmModal>
    </>
  )
}
