import { useState } from 'react'
import { formatRange } from '../../lib/format'
import { Button } from '../ui/Button'
import { DataTable } from '../ui/DataTable'
import { Modal } from '../ui/Modal'
import { FlagLine, Status } from '../ui/Status'

function RecordModal({ meeting, perspective, onClose }) {
  return (
    <Modal
      open={Boolean(meeting)}
      onClose={onClose}
      title="Meeting record"
      description={
        meeting
          ? `${perspective === 'student' ? meeting.slot.mentor.name : meeting.student.name} · ${formatRange(
              meeting.slot.start_time,
              meeting.slot.end_time,
            )}`
          : undefined
      }
    >
      {meeting && (
        <dl className="space-y-4">
          <div>
            <dt className="text-xs text-neutral-500">Agenda</dt>
            <dd className="mt-0.5 text-base text-neutral-800">{meeting.agenda}</dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500">Minutes</dt>
            <dd className="mt-0.5 whitespace-pre-line text-base text-neutral-800">
              {meeting.minutes || 'No minutes recorded yet.'}
            </dd>
          </div>
          {meeting.linked_flags.length > 0 && (
            <div>
              <dt className="text-xs text-neutral-500">Flags discussed</dt>
              <dd className="mt-1 space-y-1.5">
                {meeting.linked_flags.map((flag) => (
                  <FlagLine key={flag.id} flag={flag} />
                ))}
              </dd>
            </div>
          )}
        </dl>
      )}
    </Modal>
  )
}

/**
 * One-to-one meetings as a table. `perspective` is 'student' (shows the
 * mentor) or 'mentor' (shows the student). `actions(meeting)` adds row actions.
 */
export function MeetingTable({ meetings, perspective, actions }) {
  const [viewing, setViewing] = useState(null)

  const columns = [
    {
      key: 'when',
      header: 'When',
      render: (m) => <span className="whitespace-nowrap">{formatRange(m.slot.start_time, m.slot.end_time)}</span>,
    },
    {
      key: 'with',
      header: perspective === 'student' ? 'Mentor' : 'Student',
      render: (m) =>
        perspective === 'student' ? (
          m.slot.mentor.name
        ) : (
          <span>
            {m.student.name}
            <span className="ml-1.5 font-mono text-xs text-neutral-500">{m.student.roll_no}</span>
          </span>
        ),
    },
    {
      key: 'agenda',
      header: 'Agenda',
      mobileFull: true,
      render: (m) => (
        <span>
          {m.agenda}
          {m.invited_by_mentor && <span className="ml-2 text-xs text-neutral-500">Mentor invitation</span>}
        </span>
      ),
    },
    { key: 'flags', header: 'Flags', align: 'right', render: (m) => m.linked_flags.length || null },
    { key: 'status', header: 'Status', render: (m) => <Status kind="meeting" status={m.status} /> },
  ]

  return (
    <>
      <DataTable
        columns={columns}
        rows={meetings}
        actions={(m) => (
          <>
            {m.status === 'completed' && (
              <Button variant="text" onClick={() => setViewing(m)}>
                View record
              </Button>
            )}
            {actions?.(m)}
          </>
        )}
      />
      <RecordModal meeting={viewing} perspective={perspective} onClose={() => setViewing(null)} />
    </>
  )
}
