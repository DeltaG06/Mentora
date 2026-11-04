import { useMemo, useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { api, errorMessage } from '../../api/client'
import { MeetingItem } from '../../components/domain/MeetingItem'
import { ResolveFlagModal } from '../../components/domain/ResolveFlagModal'
import { RuleBadge, StatusBadge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { Alert, EmptyState, Loadable, Spinner } from '../../components/ui/Feedback'
import { Textarea } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { Tabs } from '../../components/ui/Tabs'
import { useToast } from '../../components/ui/Toast'
import { formatRange } from '../../lib/format'
import { useApi } from '../../lib/useApi'

function CompleteModal({ meeting, onClose, onCompleted }) {
  const detail = useApi(meeting ? `/mentor/mentees/${meeting.student.id}` : null)
  const [minutes, setMinutes] = useState('')
  const [linked, setLinked] = useState([])
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [current, setCurrent] = useState(null)

  if (meeting !== current) {
    setCurrent(meeting)
    setMinutes('')
    setLinked([])
    setError(null)
  }

  const unresolved = (detail.data?.flags || []).filter((f) => f.status !== 'resolved')
  const toggle = (id) => setLinked((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))

  const submit = async (event) => {
    event.preventDefault()
    if (!minutes.trim()) {
      setError('Record the minutes of the meeting.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { data } = await api.post(`/meetings/${meeting.id}/complete`, {
        minutes: minutes.trim(),
        linked_flag_ids: linked,
      })
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
        <form id="complete-form" onSubmit={submit} className="space-y-5">
          {error && <Alert tone="error">{error}</Alert>}
          <div className="rounded-md bg-slate-50 px-3 py-2 text-sm">
            <span className="text-slate-500">Agenda: </span>
            <span className="text-slate-800">{meeting.agenda}</span>
          </div>
          <Textarea
            label="Minutes"
            rows={6}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            placeholder="What was discussed, what the student agreed to do, and any follow-up."
            required
          />
          <fieldset>
            <legend className="label">Flags discussed</legend>
            {detail.loading && !detail.data ? (
              <Spinner label="Loading flags…" />
            ) : unresolved.length === 0 ? (
              <p className="text-sm text-slate-500">This student has no unresolved flags.</p>
            ) : (
              <ul className="space-y-2">
                {unresolved.map((flag) => (
                  <li key={flag.id}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-200 p-3 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-500"
                        checked={linked.includes(flag.id)}
                        onChange={() => toggle(flag.id)}
                      />
                      <RuleBadge rule={flag.rule} />
                      <span className="min-w-0 flex-1 text-sm text-slate-700">
                        {flag.reason}
                        <span className="mt-0.5 block text-xs text-slate-500">{flag.semester.label}</span>
                      </span>
                      <StatusBadge status={flag.status} />
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-slate-500">
              Linked open flags move to “in discussion”. You can resolve them straight after saving.
            </p>
          </fieldset>
        </form>
      )}
    </Modal>
  )
}

function FollowUp({ flags, onClose }) {
  const [queue, setQueue] = useState(flags)
  const [resolving, setResolving] = useState(null)
  const open = queue.length > 0

  return (
    <>
      <Modal
        open={open && !resolving}
        onClose={onClose}
        title="Resolve the flags you discussed?"
        description="A resolution note is required for each flag."
        footer={
          <Button variant="secondary" onClick={onClose}>
            Later
          </Button>
        }
      >
        <ul className="space-y-2">
          {queue.map((flag) => (
            <li key={flag.id} className="flex items-start gap-3 rounded-md border border-slate-200 p-3">
              <RuleBadge rule={flag.rule} />
              <span className="min-w-0 flex-1 text-sm text-slate-700">{flag.reason}</span>
              <Button size="sm" onClick={() => setResolving(flag)}>
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
  const list = groups[activeTab]

  return (
    <>
      <PageHeader title="Meetings" description="One-to-one meetings with your mentees. Record minutes once a meeting is held." />
      <Card bodyClassName="">
        <div className="px-4 pt-2 sm:px-5">
          <Tabs
            tabs={TABS.map((t) => ({ ...t, count: state.data && t.value !== 'cancelled' ? groups[t.value].length : undefined }))}
            value={activeTab}
            onChange={setTab}
          />
        </div>
        <Loadable state={state}>
          {() =>
            list.length === 0 ? (
              <EmptyState icon={CalendarClock} title="No meetings here">
                {activeTab === 'record' && 'Meetings that have started appear here until you record them.'}
              </EmptyState>
            ) : (
              <ul className="divide-y divide-slate-100">
                {list.map((meeting) => (
                  <MeetingItem
                    key={meeting.id}
                    meeting={meeting}
                    perspective="mentor"
                    actions={
                      meeting.status === 'scheduled' && (
                        <>
                          <Button size="sm" onClick={() => setCompleting(meeting)}>
                            Record
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setCancelling(meeting)}>
                            Cancel
                          </Button>
                        </>
                      )
                    }
                  />
                ))}
              </ul>
            )
          }
        </Loadable>
      </Card>

      <CompleteModal
        meeting={completing}
        onClose={() => setCompleting(null)}
        onCompleted={(data, linkedFlags) => {
          setCompleting(null)
          toast.success(`Meeting with ${data.meeting.student.name} recorded.`)
          reload()
          // Prompt to resolve every linked flag that is still unresolved.
          const moved = new Set(data.flags_moved.map((f) => f.id))
          const toResolve = [
            ...data.flags_moved,
            ...linkedFlags.filter((f) => !moved.has(f.id) && f.status !== 'resolved'),
          ]
          if (toResolve.length) setFollowUp(toResolve)
        }}
      />
      {followUp && <FollowUp flags={followUp} onClose={() => setFollowUp(null)} />}
      <ConfirmModal
        open={Boolean(cancelling)}
        title="Cancel this meeting?"
        confirmLabel="Cancel meeting"
        tone="danger"
        onClose={() => setCancelling(null)}
        onConfirm={async () => {
          await api.post(`/meetings/${cancelling.id}/cancel`)
          toast.success('Meeting cancelled. The slot is open again.')
          reload()
        }}
      >
        {cancelling && (
          <p>
            {cancelling.student.name} will be notified, and the slot on{' '}
            <span className="font-medium">{formatRange(cancelling.slot.start_time, cancelling.slot.end_time)}</span> goes back on
            offer.
          </p>
        )}
      </ConfirmModal>
    </>
  )
}
