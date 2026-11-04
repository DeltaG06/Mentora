import { useMemo, useState } from 'react'
import { CalendarDays, Plus } from 'lucide-react'
import { api, errorMessage } from '../../api/client'
import { InviteModal } from '../../components/domain/InviteModal'
import { StatusBadge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { Alert, EmptyState, Loadable } from '../../components/ui/Feedback'
import { Input, Select } from '../../components/ui/Field'
import { PageHeader } from '../../components/ui/PageHeader'
import { Tabs } from '../../components/ui/Tabs'
import { useToast } from '../../components/ui/Toast'
import { formatDate, formatRange, formatTime, formatWeekday, isoToLocalInput, localInputToIso } from '../../lib/format'
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
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    const iso = localInputToIso(start)
    if (!iso) {
      setError('Choose a date and time.')
      return
    }
    if (new Date(iso) <= new Date()) {
      setError('The slot must start in the future.')
      return
    }
    setSaving(true)
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
    <Card title="Publish a slot" description="Mentees can book open slots with an agenda.">
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Input label="Starts" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required />
        <Select label="Duration" value={duration} onChange={(e) => setDuration(e.target.value)}>
          {[15, 30, 45, 60, 90].map((m) => (
            <option key={m} value={m}>
              {m} minutes
            </option>
          ))}
        </Select>
        <Button type="submit" icon={Plus} loading={saving} className="w-full">
          Publish slot
        </Button>
      </form>
    </Card>
  )
}

export default function SlotsPage() {
  const toast = useToast()
  const [tab, setTab] = useState('upcoming')
  const [refresh, setRefresh] = useState(0)
  const [now] = useState(() => new Date().toISOString())
  const state = useApi('/mentor/slots', tab === 'upcoming' ? { from: now } : { to: now }, refresh)
  const [inviting, setInviting] = useState(null)
  const [cancelling, setCancelling] = useState(null)
  const reload = () => setRefresh((n) => n + 1)

  const groups = useMemo(() => {
    const list = tab === 'upcoming' ? state.data || [] : [...(state.data || [])].reverse()
    const byDay = new Map()
    for (const slot of list) {
      const day = formatDate(slot.start_time)
      if (!byDay.has(day)) byDay.set(day, [])
      byDay.get(day).push(slot)
    }
    return [...byDay.values()]
  }, [state.data, tab])

  return (
    <>
      <PageHeader title="Slots" description="Your published availability for one-to-one meetings." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card bodyClassName="">
          <div className="px-4 pt-2 sm:px-5">
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
            {() =>
              groups.length === 0 ? (
                <EmptyState icon={CalendarDays} title={tab === 'upcoming' ? 'No upcoming slots' : 'No past slots'}>
                  {tab === 'upcoming' && 'Publish a slot so your mentees can book time with you.'}
                </EmptyState>
              ) : (
                <div className="divide-y divide-slate-100">
                  {groups.map((slots) => (
                    <section key={slots[0].id} className="px-4 py-4 sm:px-5">
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {formatWeekday(slots[0].start_time)}
                      </h3>
                      <ul className="space-y-2">
                        {slots.map((slot) => (
                          <li
                            key={slot.id}
                            className="flex flex-col gap-3 rounded-md border border-slate-200 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium tabular-nums text-slate-900">
                                  {formatTime(slot.start_time)}–{formatTime(slot.end_time)}
                                </span>
                                <StatusBadge status={slot.status} kind="slot" />
                              </div>
                              {slot.meeting && (
                                <p className="mt-1 truncate text-sm text-slate-600">
                                  {slot.meeting.student.name} · {slot.meeting.agenda}
                                </p>
                              )}
                            </div>
                            {tab === 'upcoming' && ['open', 'booked'].includes(slot.status) && (
                              <div className="flex gap-2">
                                {slot.status === 'open' && (
                                  <Button size="sm" variant="secondary" onClick={() => setInviting(slot)}>
                                    Invite
                                  </Button>
                                )}
                                <Button size="sm" variant="ghost" onClick={() => setCancelling(slot)}>
                                  Cancel
                                </Button>
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )
            }
          </Loadable>
        </Card>
        <div>
          <PublishForm onPublished={reload} />
        </div>
      </div>

      <InviteModal open={Boolean(inviting)} slot={inviting} onClose={() => setInviting(null)} onInvited={reload} />
      <ConfirmModal
        open={Boolean(cancelling)}
        title="Cancel this slot?"
        confirmLabel="Cancel slot"
        tone="danger"
        onClose={() => setCancelling(null)}
        onConfirm={async () => {
          await api.patch(`/mentor/slots/${cancelling.id}/cancel`)
          toast.success('Slot cancelled.')
          reload()
        }}
      >
        {cancelling && (
          <>
            <p>
              The slot on <span className="font-medium">{formatRange(cancelling.start_time, cancelling.end_time)}</span> will
              no longer be available.
            </p>
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
