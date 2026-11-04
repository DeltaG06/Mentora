import { useMemo, useState } from 'react'
import { api, errorMessage } from '../../api/client'
import { MeetingTable } from '../../components/domain/MeetingTable'
import { Button } from '../../components/ui/Button'
import { Panel } from '../../components/ui/Card'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { DataTable } from '../../components/ui/DataTable'
import { EmptyState, Loadable } from '../../components/ui/Feedback'
import { Textarea } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { Tabs } from '../../components/ui/Tabs'
import { useToast } from '../../components/ui/Toast'
import { formatRange, formatTime, formatWeekday } from '../../lib/format'
import { useApi } from '../../lib/useApi'

const CANCEL_NOTICE_MS = 2 * 60 * 60 * 1000

function BookModal({ slot, onClose, onBooked }) {
  const toast = useToast()
  const [agenda, setAgenda] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [current, setCurrent] = useState(null)

  if (slot !== current) {
    setCurrent(slot)
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
      <form id="book-form" onSubmit={submit} noValidate>
        <Textarea
          label="Agenda"
          value={agenda}
          onChange={(e) => setAgenda(e.target.value)}
          error={error}
          placeholder="e.g. Discuss my drop in SGPA and plan for the re-exam"
          maxLength={2000}
          required
        />
      </form>
    </Modal>
  )
}

const SLOT_COLUMNS = [
  { key: 'day', header: 'Day', render: (s) => formatWeekday(s.start_time) },
  { key: 'time', header: 'Time', render: (s) => `${formatTime(s.start_time)}–${formatTime(s.end_time)}` },
  {
    key: 'length',
    header: 'Length',
    align: 'right',
    render: (s) => `${Math.round((new Date(s.end_time) - new Date(s.start_time)) / 60000)} min`,
  },
]

function OpenSlots({ onBooked, refresh }) {
  const state = useApi('/students/me/mentor/slots', null, refresh)
  const [booking, setBooking] = useState(null)

  if (state.error?.response?.status === 404) {
    return (
      <Panel title="Book a meeting">
        <p className="text-sm text-neutral-600">You can book meetings once a mentor has been assigned to you.</p>
      </Panel>
    )
  }

  return (
    <Panel title="Book a meeting" description="Open slots published by your mentor" bodyClassName="">
      <Loadable state={state}>
        {(slots) =>
          slots.length === 0 ? (
            <EmptyState
              message="Your mentor has no open slots right now. Check again later."
              action={
                <Button variant="secondary" onClick={state.reload}>
                  Refresh
                </Button>
              }
            />
          ) : (
            <DataTable
              columns={SLOT_COLUMNS}
              rows={slots}
              actions={(slot) => (
                <Button variant="text" onClick={() => setBooking(slot)}>
                  Book
                </Button>
              )}
            />
          )
        }
      </Loadable>
      <BookModal slot={booking} onClose={() => setBooking(null)} onBooked={onBooked} />
    </Panel>
  )
}

export default function StudentMeetingsPage() {
  const toast = useToast()
  const [tab, setTab] = useState('upcoming')
  const [refresh, setRefresh] = useState(0)
  const meetings = useApi('/students/me/meetings', null, refresh)
  const [cancelling, setCancelling] = useState(null)
  const reload = () => setRefresh((n) => n + 1)

  const { upcoming, past } = useMemo(() => {
    const now = Date.now()
    const isUpcoming = (m) => m.status === 'scheduled' && new Date(m.slot.end_time).getTime() > now
    const all = meetings.data || []
    return { upcoming: all.filter(isUpcoming), past: all.filter((m) => !isUpcoming(m)).reverse() }
  }, [meetings.data])
  const list = tab === 'upcoming' ? upcoming : past

  return (
    <>
      <PageHeader title="Meetings" description="One-to-one meetings with your mentor." />
      <div className="space-y-6">
        <Panel bodyClassName="">
          <div className="border-b border-neutral-200 px-4 md:px-5">
            <Tabs
              tabs={[
                { value: 'upcoming', label: 'Upcoming', count: meetings.data ? upcoming.length : undefined },
                { value: 'past', label: 'Past' },
              ]}
              value={tab}
              onChange={setTab}
            />
          </div>
          <Loadable state={meetings}>
            {() =>
              list.length === 0 ? (
                <EmptyState
                  message={tab === 'upcoming' ? 'You have no upcoming meetings.' : 'You have no past meetings.'}
                  action={
                    tab === 'upcoming' ? (
                      <Button variant="secondary" onClick={() => document.getElementById('open-slots')?.scrollIntoView()}>
                        See open slots
                      </Button>
                    ) : (
                      <Button variant="secondary" onClick={() => setTab('upcoming')}>
                        View upcoming meetings
                      </Button>
                    )
                  }
                />
              ) : (
                <MeetingTable
                  meetings={list}
                  perspective="student"
                  actions={(meeting) => {
                    if (meeting.status !== 'scheduled') return null
                    const late = new Date(meeting.slot.start_time).getTime() - Date.now() < CANCEL_NOTICE_MS
                    return late ? (
                      <span className="text-xs text-neutral-500" title="Less than 2 hours to go. Contact your mentor directly.">
                        Cannot cancel
                      </span>
                    ) : (
                      <Button variant="text" onClick={() => setCancelling(meeting)}>
                        Cancel
                      </Button>
                    )
                  }}
                />
              )
            }
          </Loadable>
        </Panel>
        <div id="open-slots">
          <OpenSlots onBooked={reload} refresh={refresh} />
        </div>
      </div>

      <ConfirmModal
        open={Boolean(cancelling)}
        title="Cancel this meeting?"
        confirmLabel="Cancel meeting"
        destructive
        onClose={() => setCancelling(null)}
        onConfirm={async () => {
          await api.post(`/meetings/${cancelling.id}/cancel`)
          toast.success('Meeting cancelled. The slot is open again.')
          reload()
        }}
      >
        {cancelling && (
          <p>
            Your meeting on {formatRange(cancelling.slot.start_time, cancelling.slot.end_time)} will be cancelled and your mentor
            notified.
          </p>
        )}
      </ConfirmModal>
    </>
  )
}
