import { useMemo, useState } from 'react'
import { CalendarClock, CalendarX2 } from 'lucide-react'
import { api, errorMessage } from '../../api/client'
import { MeetingItem } from '../../components/domain/MeetingItem'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { Alert, EmptyState, Loadable } from '../../components/ui/Feedback'
import { Textarea } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { Tabs } from '../../components/ui/Tabs'
import { useToast } from '../../components/ui/Toast'
import { formatDate, formatRange, formatTime, formatWeekday } from '../../lib/format'
import { useApi } from '../../lib/useApi'

const CANCEL_NOTICE_MS = 2 * 60 * 60 * 1000

function BookModal({ slot, onClose, onBooked }) {
  const toast = useToast()
  const [agenda, setAgenda] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [lastSlot, setLastSlot] = useState(null)

  if (slot !== lastSlot) {
    setLastSlot(slot)
    setAgenda('')
    setError(null)
  }

  const submit = async (event) => {
    event.preventDefault()
    if (!agenda.trim()) {
      setError('Tell your mentor what you would like to discuss.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await api.post(`/slots/${slot.id}/book`, { agenda: agenda.trim() })
      toast.success('Meeting booked. Your mentor has been notified.')
      onBooked()
      onClose()
    } catch (err) {
      setError(errorMessage(err))
      if (err.response?.status === 409) onBooked()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={Boolean(slot)}
      onClose={onClose}
      title="Book this slot"
      description={slot ? formatRange(slot.start_time, slot.end_time) : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="book-form" loading={saving}>
            Book meeting
          </Button>
        </>
      }
    >
      <form id="book-form" onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Textarea
          label="Agenda"
          value={agenda}
          onChange={(e) => setAgenda(e.target.value)}
          placeholder="e.g. Discuss my drop in SGPA and plan for the re-exam"
          maxLength={2000}
          required
        />
      </form>
    </Modal>
  )
}

function OpenSlots({ onBooked, refreshKey }) {
  const state = useApi('/students/me/mentor/slots', null, refreshKey)
  const [booking, setBooking] = useState(null)

  const byDay = useMemo(() => {
    const groups = new Map()
    for (const slot of state.data || []) {
      const day = formatDate(slot.start_time)
      if (!groups.has(day)) groups.set(day, [])
      groups.get(day).push(slot)
    }
    return [...groups.entries()]
  }, [state.data])

  if (state.error?.response?.status === 404) {
    return (
      <Card title="Book a meeting">
        <p className="text-sm text-slate-500">You can book meetings once a mentor has been assigned to you.</p>
      </Card>
    )
  }

  return (
    <Card title="Book a meeting" description="Open slots published by your mentor">
      <Loadable state={state}>
        {(slots) =>
          slots.length === 0 ? (
            <EmptyState icon={CalendarX2} title="No open slots right now">
              Your mentor has not published any upcoming slots. Check back later.
            </EmptyState>
          ) : (
            <div className="space-y-5">
              {byDay.map(([day, list]) => (
                <div key={day}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {formatWeekday(list[0].start_time)}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {list.map((slot) => (
                      <button
                        key={slot.id}
                        type="button"
                        onClick={() => setBooking(slot)}
                        className="h-11 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium tabular-nums text-slate-800 hover:border-brand-500 hover:bg-brand-50 hover:text-brand-800 sm:h-10"
                      >
                        {formatTime(slot.start_time)}–{formatTime(slot.end_time)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        }
      </Loadable>
      <BookModal
        slot={booking}
        onClose={() => setBooking(null)}
        onBooked={onBooked}
      />
    </Card>
  )
}

export default function StudentMeetingsPage() {
  const toast = useToast()
  const [tab, setTab] = useState('upcoming')
  const [refreshKey, setRefreshKey] = useState(0)
  const meetings = useApi('/students/me/meetings', null, refreshKey)
  const [cancelling, setCancelling] = useState(null)

  const list = useMemo(() => {
    const now = Date.now()
    const upcoming = (m) => m.status === 'scheduled' && new Date(m.slot.end_time).getTime() > now
    const items = meetings.data || []
    return tab === 'upcoming' ? items.filter(upcoming) : items.filter((m) => !upcoming(m)).reverse()
  }, [meetings.data, tab])

  const reloadAll = () => setRefreshKey((k) => k + 1)

  return (
    <>
      <PageHeader title="Meetings" description="One-to-one meetings with your mentor." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
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
          <Loadable state={meetings}>
            {() =>
              list.length === 0 ? (
                <EmptyState icon={CalendarClock} title={tab === 'upcoming' ? 'No upcoming meetings' : 'No past meetings'} />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {list.map((meeting) => {
                    const lateToCancel = new Date(meeting.slot.start_time).getTime() - Date.now() < CANCEL_NOTICE_MS
                    return (
                      <MeetingItem
                        key={meeting.id}
                        meeting={meeting}
                        perspective="student"
                        actions={
                          meeting.status === 'scheduled' ? (
                            <div className="text-right">
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={lateToCancel}
                                onClick={() => setCancelling(meeting)}
                              >
                                Cancel
                              </Button>
                              {lateToCancel && (
                                <p className="mt-1 max-w-[12rem] text-xs text-slate-500">
                                  Less than 2 hours to go. Contact your mentor directly.
                                </p>
                              )}
                            </div>
                          ) : null
                        }
                      />
                    )
                  })}
                </ul>
              )
            }
          </Loadable>
        </Card>
        <OpenSlots onBooked={reloadAll} refreshKey={refreshKey} />
      </div>

      <ConfirmModal
        open={Boolean(cancelling)}
        title="Cancel this meeting?"
        confirmLabel="Cancel meeting"
        tone="danger"
        onClose={() => setCancelling(null)}
        onConfirm={async () => {
          await api.post(`/meetings/${cancelling.id}/cancel`)
          toast.success('Meeting cancelled. The slot is open again.')
          reloadAll()
        }}
      >
        {cancelling && (
          <p>
            Your meeting on <span className="font-medium">{formatRange(cancelling.slot.start_time, cancelling.slot.end_time)}</span>{' '}
            will be cancelled and your mentor will be notified.
          </p>
        )}
      </ConfirmModal>
    </>
  )
}
