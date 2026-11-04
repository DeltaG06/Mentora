import { useState } from 'react'
import { api, errorMessage } from '../../api/client'
import { InviteModal } from '../../components/domain/InviteModal'
import { Button } from '../../components/ui/Button'
import { Panel } from '../../components/ui/Card'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { DataTable } from '../../components/ui/DataTable'
import { Alert, EmptyState, Loadable } from '../../components/ui/Feedback'
import { Input, Select } from '../../components/ui/Field'
import { PageHeader } from '../../components/ui/PageHeader'
import { Status } from '../../components/ui/Status'
import { Tabs } from '../../components/ui/Tabs'
import { useToast } from '../../components/ui/Toast'
import { formatRange, formatTime, formatWeekday, isoToLocalInput, localInputToIso } from '../../lib/format'
import { useApi } from '../../lib/useApi'

function defaultStart() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000)
  date.setMinutes(0, 0, 0)
  date.setHours(Math.min(Math.max(date.getHours(), 10), 16))
  return isoToLocalInput(date.toISOString())
}

function PublishForm({ onPublished }) {
  const toast = useToast()
  const [start, setStart] = useState(defaultStart)
  const [duration, setDuration] = useState('30')
  const [fieldError, setFieldError] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    const iso = localInputToIso(start)
    if (!iso) return setFieldError('Choose a date and time.')
    if (new Date(iso) <= new Date()) return setFieldError('The slot must start in the future.')
    setSaving(true)
    setFieldError(null)
    setError(null)
    try {
      await api.post('/mentor/slots', { date_time: iso, duration_minutes: Number(duration) })
      toast.success('Slot published. Your mentees can book it now.')
      onPublished()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Panel title="Publish a slot" description="Mentees book open slots with an agenda.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Input label="Starts" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} error={fieldError} required />
        <Select label="Length" value={duration} onChange={(e) => setDuration(e.target.value)}>
          {[15, 30, 45, 60, 90].map((m) => (
            <option key={m} value={m}>
              {m} minutes
            </option>
          ))}
        </Select>
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" loading={saving} className="w-full">
          Publish slot
        </Button>
      </form>
    </Panel>
  )
}

const COLUMNS = [
  { key: 'day', header: 'Day', render: (s) => formatWeekday(s.start_time) },
  { key: 'time', header: 'Time', render: (s) => `${formatTime(s.start_time)}–${formatTime(s.end_time)}` },
  { key: 'status', header: 'Status', render: (s) => <Status kind="slot" status={s.status} /> },
  {
    key: 'meeting',
    header: 'Booked by',
    mobileFull: true,
    render: (s) =>
      s.meeting && (
        <span>
          {s.meeting.student.name}
          <span className="block text-xs text-neutral-500">{s.meeting.agenda}</span>
        </span>
      ),
  },
]

export default function SlotsPage() {
  const toast = useToast()
  const [tab, setTab] = useState('upcoming')
  const [refresh, setRefresh] = useState(0)
  const [now] = useState(() => new Date().toISOString())
  const state = useApi('/mentor/slots', tab === 'upcoming' ? { from: now } : { to: now }, refresh)
  const [inviting, setInviting] = useState(null)
  const [cancelling, setCancelling] = useState(null)
  const reload = () => setRefresh((n) => n + 1)

  return (
    <>
      <PageHeader title="Slots" description="Your published availability for one-to-one meetings." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Panel bodyClassName="">
          <div className="border-b border-neutral-200 px-4 md:px-5">
            <Tabs
              tabs={[
                { value: 'upcoming', label: 'Upcoming' },
                { value: 'past', label: 'Past' },
              ]}
              value={tab}
              onChange={setTab}
            />
          </div>
          <Loadable state={state}>
            {(slots) =>
              slots.length === 0 ? (
                <EmptyState
                  message={
                    tab === 'upcoming'
                      ? 'You have no upcoming slots. Publish one so your mentees can book time with you.'
                      : 'You have no past slots.'
                  }
                  action={
                    tab === 'past' && (
                      <Button variant="secondary" onClick={() => setTab('upcoming')}>
                        View upcoming slots
                      </Button>
                    )
                  }
                />
              ) : (
                <DataTable
                  columns={COLUMNS}
                  rows={tab === 'upcoming' ? slots : [...slots].reverse()}
                  actions={(slot) =>
                    tab === 'upcoming' &&
                    ['open', 'booked'].includes(slot.status) && (
                      <>
                        {slot.status === 'open' && (
                          <Button variant="text" onClick={() => setInviting(slot)}>
                            Invite
                          </Button>
                        )}
                        <Button variant="text" onClick={() => setCancelling(slot)}>
                          Cancel
                        </Button>
                      </>
                    )
                  }
                />
              )
            }
          </Loadable>
        </Panel>
        <div>
          <PublishForm onPublished={reload} />
        </div>
      </div>

      <InviteModal open={Boolean(inviting)} slot={inviting} onClose={() => setInviting(null)} onInvited={reload} />
      <ConfirmModal
        open={Boolean(cancelling)}
        title="Cancel this slot?"
        confirmLabel="Cancel slot"
        destructive
        onClose={() => setCancelling(null)}
        onConfirm={async () => {
          await api.patch(`/mentor/slots/${cancelling.id}/cancel`)
          toast.success('Slot cancelled.')
          reload()
        }}
      >
        {cancelling && (
          <>
            <p>The slot on {formatRange(cancelling.start_time, cancelling.end_time)} will no longer be available.</p>
            {cancelling.status === 'booked' && cancelling.meeting && (
              <Alert tone="warning">
                {cancelling.meeting.student.name}'s meeting in this slot will be cancelled and they will be notified.
              </Alert>
            )}
          </>
        )}
      </ConfirmModal>
    </>
  )
}
