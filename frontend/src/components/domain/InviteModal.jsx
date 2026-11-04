import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, errorMessage } from '../../api/client'
import { formatRange } from '../../lib/format'
import { useApi } from '../../lib/useApi'
import { Button } from '../ui/Button'
import { Alert, Skeleton } from '../ui/Feedback'
import { Input, Select } from '../ui/Field'
import { Modal } from '../ui/Modal'
import { useToast } from '../ui/Toast'

const PRIORITY = { amber: 0, red: 1, green: 2 }
const INDICATOR_NOTE = { amber: ' · escalated flag', red: ' · unresolved flag', green: '' }

/**
 * Invite a mentee into an open slot. Pass `slot` to choose the student,
 * or `student` ({id, name}) to choose the slot.
 */
export function InviteModal({ open, slot, student, onClose, onInvited }) {
  const toast = useToast()
  const roster = useApi(open && slot ? '/mentor/dashboard' : null)
  const [from] = useState(() => new Date().toISOString())
  const slots = useApi(open && student ? '/mentor/slots' : null, { status: 'open', from })
  const [choice, setChoice] = useState('')
  const [agenda, setAgenda] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [lastOpen, setLastOpen] = useState(false)

  if (open !== lastOpen) {
    setLastOpen(open)
    setChoice('')
    setAgenda('')
    setError(null)
  }

  const mentees = useMemo(
    () =>
      [...(roster.data?.mentees || [])].sort(
        (a, b) => PRIORITY[a.indicator] - PRIORITY[b.indicator] || a.student.name.localeCompare(b.student.name),
      ),
    [roster.data],
  )
  const openSlots = (slots.data || []).filter((s) => new Date(s.start_time) > new Date())

  const submit = async (event) => {
    event.preventDefault()
    if (!choice) {
      setError(slot ? 'Choose a student.' : 'Choose a slot.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const body = { student_id: slot ? Number(choice) : student.id }
      if (agenda.trim()) body.agenda = agenda.trim()
      const { data } = await api.post(`/mentor/slots/${slot ? slot.id : Number(choice)}/invite`, body)
      toast.success(`${data.student.name} has been invited and notified.`)
      onInvited?.(data)
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const loading = (slot && !roster.data && !roster.error) || (student && !slots.data && !slots.error)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={slot ? 'Invite a mentee' : `Invite ${student?.name}`}
      description={slot ? formatRange(slot.start_time, slot.end_time) : 'Choose one of your open slots.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="invite-form" loading={busy} disabled={Boolean(student) && openSlots.length === 0}>
            Send invitation
          </Button>
        </>
      }
    >
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : (
        <form id="invite-form" onSubmit={submit} className="space-y-4" noValidate>
          {slot ? (
            <Select label="Student" value={choice} onChange={(e) => setChoice(e.target.value)} error={error} required>
              <option value="">Select a mentee</option>
              {mentees.map((m) => (
                <option key={m.student.id} value={m.student.id}>
                  {m.student.name} ({m.student.roll_no}){INDICATOR_NOTE[m.indicator]}
                </option>
              ))}
            </Select>
          ) : openSlots.length === 0 ? (
            <Alert tone="info">
              You have no open upcoming slots.{' '}
              <Link to="/mentor/slots" className="link">
                Publish a slot
              </Link>{' '}
              first.
            </Alert>
          ) : (
            <Select label="Slot" value={choice} onChange={(e) => setChoice(e.target.value)} error={error} required>
              <option value="">Select a slot</option>
              {openSlots.map((s) => (
                <option key={s.id} value={s.id}>
                  {formatRange(s.start_time, s.end_time)}
                </option>
              ))}
            </Select>
          )}
          <Input
            label="Agenda"
            value={agenda}
            onChange={(e) => setAgenda(e.target.value)}
            placeholder="Mentor-initiated guidance meeting"
            hint="Optional. Shown to the student in the invitation."
            maxLength={2000}
          />
        </form>
      )}
    </Modal>
  )
}
