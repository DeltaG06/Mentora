import { useMemo, useState } from 'react'
import { api, errorMessage } from '../../api/client'
import { MeetingTable } from '../../components/domain/MeetingTable'
import { ResolveFlagModal } from '../../components/domain/ResolveFlagModal'
import { Button, LinkButton } from '../../components/ui/Button'
import { Panel } from '../../components/ui/Card'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { Alert, EmptyState, Loadable, Skeleton } from '../../components/ui/Feedback'
import { Textarea } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { FlagLine } from '../../components/ui/Status'
import { Tabs } from '../../components/ui/Tabs'
import { useToast } from '../../components/ui/Toast'
import { formatRange } from '../../lib/format'
import { useApi } from '../../lib/useApi'

function CompleteModal({ meeting, onClose, onCompleted }) {
  const detail = useApi(meeting ? `/mentor/mentees/${meeting.student.id}` : null)
  const [minutes, setMinutes] = useState('')
  const [minutesError, setMinutesError] = useState(null)
  const [linked, setLinked] = useState([])
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [current, setCurrent] = useState(null)

  if (meeting !== current) {
    setCurrent(meeting)
    setMinutes('')
    setMinutesError(null)
    setLinked([])
    setError(null)
  }

  const unresolved = (detail.data?.flags || []).filter((f) => f.status !== 'resolved')
  const toggle = (id) => setLinked((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))

  const submit = async (event) => {
    event.preventDefault()
    if (!minutes.trim()) {
      setMinutesError('Record what was discussed.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { data } = await api.post(`/meetings/${meeting.id}/complete`, { minutes: minutes.trim(), linked_flag_ids: linked })
      onCompleted(data, unresolved.filter((f) => linked.includes(f.id)))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={Boolean(meeting)}
      onClose={onClose}
      size="lg"
      title="Record meeting"
      description={meeting ? `${meeting.student.name} · ${formatRange(meeting.slot.start_time, meeting.slot.end_time)}` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="complete-form" loading={busy}>
            Mark as held
          </Button>
        </>
      }
    >
      {meeting && (
        <form id="complete-form" onSubmit={submit} className="space-y-5" noValidate>
          <p className="text-base text-neutral-600">
            Agenda: <span className="text-neutral-800">{meeting.agenda}</span>
          </p>
          <Textarea
            label="Minutes"
            rows={6}
            value={minutes}
            onChange={(e) => {
              setMinutes(e.target.value)
              if (minutesError) setMinutesError(null)
            }}
            error={minutesError}
            placeholder="What was discussed, what the student agreed to do, and any follow-up."
            required
          />
          <fieldset>
            <legend className="label">Flags discussed</legend>
            {!detail.data && !detail.error ? (
              <Skeleton className="h-10 w-full" />
            ) : unresolved.length === 0 ? (
              <p className="text-sm text-neutral-600">This student has no unresolved flags.</p>
            ) : (
              <ul className="rounded-md border border-neutral-200">
                {unresolved.map((flag) => (
                  <li key={flag.id} className="border-b border-neutral-200 last:border-b-0">
                    <label className="flex min-h-[44px] cursor-pointer items-center gap-3 px-3 py-2 hover:bg-neutral-50">
                      <input type="checkbox" className="checkbox" checked={linked.includes(flag.id)} onChange={() => toggle(flag.id)} />
                      <FlagLine flag={flag} meta={flag.semester.label} />
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1.5 text-xs text-neutral-500">Linked open flags move to in discussion. You can resolve them after saving.</p>
          </fieldset>
          {error && <Alert tone="error">{error}</Alert>}
        </form>
      )}
    </Modal>
  )
}

function FollowUp({ flags, onClose }) {
  const [queue, setQueue] = useState(flags)
  const [resolving, setResolving] = useState(null)

  return (
    <>
      <Modal
        open={queue.length > 0 && !resolving}
        onClose={onClose}
        title="Resolve the flags you discussed?"
        description="Each flag needs a resolution note."
        footer={
          <Button variant="secondary" onClick={onClose}>
            Later
          </Button>
        }
      >
        <ul className="rounded-md border border-neutral-200">
          {queue.map((flag) => (
            <li key={flag.id} className="flex items-center justify-between gap-3 border-b border-neutral-200 px-3 py-2 last:border-b-0">
              <FlagLine flag={flag} />
              <Button variant="text" onClick={() => setResolving(flag)}>
                Resolve
              </Button>
            </li>
          ))}
        </ul>
      </Modal>
      <ResolveFlagModal
        flag={resolving}
        onClose={() => setResolving(null)}
        onResolved={(done) => {
          const rest = queue.filter((f) => f.id !== done.id)
          setQueue(rest)
          if (rest.length === 0) onClose()
        }}
      />
    </>
  )
}

const TABS = [
  { value: 'record', label: 'To record' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'completed', label: 'Held' },
  { value: 'cancelled', label: 'Cancelled' },
]

const EMPTY = {
  record: 'Meetings that have started appear here until you record them.',
  upcoming: 'You have no upcoming meetings.',
  completed: 'You have not held any meetings yet.',
  cancelled: 'No meetings have been cancelled.',
}

export default function MentorMeetingsPage() {
  const toast = useToast()
  const [refresh, setRefresh] = useState(0)
  const state = useApi('/mentor/meetings', null, refresh)
  const [tab, setTab] = useState(null)
  const [completing, setCompleting] = useState(null)
  const [cancelling, setCancelling] = useState(null)
  const [followUp, setFollowUp] = useState(null)
  const reload = () => setRefresh((n) => n + 1)

  const groups = useMemo(() => {
    const now = Date.now()
    const all = state.data || []
    const started = (m) => new Date(m.slot.start_time).getTime() <= now
    return {
      record: all.filter((m) => m.status === 'scheduled' && started(m)),
      upcoming: all.filter((m) => m.status === 'scheduled' && !started(m)),
      completed: all.filter((m) => m.status === 'completed').reverse(),
      cancelled: all.filter((m) => m.status === 'cancelled').reverse(),
    }
  }, [state.data])

  // Open on "To record" when something is waiting, otherwise on "Upcoming".
  const activeTab = tab || (groups.record.length ? 'record' : 'upcoming')

  return (
    <>
      <PageHeader title="Meetings" description="One-to-one meetings with your mentees. Record the minutes once a meeting is held." />
      <Panel bodyClassName="">
        <div className="border-b border-neutral-200 px-4 md:px-5">
          <Tabs
            tabs={TABS.map((t) => ({ ...t, count: state.data && t.value !== 'cancelled' ? groups[t.value].length : undefined }))}
            value={activeTab}
            onChange={setTab}
          />
        </div>
        <Loadable state={state}>
          {() =>
            groups[activeTab].length === 0 ? (
              <EmptyState message={EMPTY[activeTab]} action={<LinkButton to="/mentor/slots">Manage slots</LinkButton>} />
            ) : (
              <MeetingTable
                meetings={groups[activeTab]}
                perspective="mentor"
                actions={(meeting) =>
                  meeting.status === 'scheduled' && (
                    <>
                      <Button variant="text" onClick={() => setCompleting(meeting)}>
                        Record
                      </Button>
                      <Button variant="text" onClick={() => setCancelling(meeting)}>
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

      <CompleteModal
        meeting={completing}
        onClose={() => setCompleting(null)}
        onCompleted={(data, linkedFlags) => {
          setCompleting(null)
          toast.success(`Meeting with ${data.meeting.student.name} recorded.`)
          reload()
          // Prompt to resolve every linked flag that is still unresolved.
          const moved = new Set(data.flags_moved.map((f) => f.id))
          const toResolve = [...data.flags_moved, ...linkedFlags.filter((f) => !moved.has(f.id))]
          if (toResolve.length) setFollowUp(toResolve)
        }}
      />
      {followUp && <FollowUp flags={followUp} onClose={() => setFollowUp(null)} />}
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
            {cancelling.student.name} will be notified, and the slot on {formatRange(cancelling.slot.start_time, cancelling.slot.end_time)}{' '}
            goes back on offer.
          </p>
        )}
      </ConfirmModal>
    </>
  )
}
