import { useMemo, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { Button, LinkButton } from '../../components/ui/Button'
import { Panel } from '../../components/ui/Card'
import { DataTable } from '../../components/ui/DataTable'
import { EmptyState, Loadable } from '../../components/ui/Feedback'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { Status } from '../../components/ui/Status'
import { Tabs } from '../../components/ui/Tabs'
import { formatRange } from '../../lib/format'
import { useApi } from '../../lib/useApi'

const isUpcoming = (s) => s.status === 'scheduled' && new Date(s.end_time).getTime() > Date.now()

export default function StudentSessionsPage() {
  const { user } = useAuth()
  const state = useApi('/students/me/group-sessions')
  const [tab, setTab] = useState('upcoming')
  const [viewing, setViewing] = useState(null)

  const { upcoming, past } = useMemo(() => {
    const all = state.data || []
    return { upcoming: all.filter(isUpcoming), past: all.filter((s) => !isUpcoming(s)).reverse() }
  }, [state.data])

  const attendance = (session) => {
    if (session.status !== 'completed') return null
    const me = session.attendees.find((a) => a.student.id === user.id)
    return <Status kind="outcome" status={me?.attended ? 'attended' : 'absent'} />
  }

  const columns = [
    { key: 'when', header: 'When', render: (s) => <span className="whitespace-nowrap">{formatRange(s.start_time, s.end_time)}</span> },
    { key: 'title', header: 'Session', render: (s) => <span className="text-neutral-800">{s.title}</span> },
    { key: 'mentor', header: 'Mentor', render: (s) => s.mentor.name },
    { key: 'status', header: 'Status', render: (s) => <Status kind="meeting" status={s.status} /> },
    { key: 'attendance', header: 'Attendance', render: attendance },
  ]

  return (
    <>
      <PageHeader title="Group sessions" description="Sessions your mentor has invited you to." />
      <Panel bodyClassName="">
        <div className="border-b border-neutral-200 px-4 md:px-5">
          <Tabs
            tabs={[
              { value: 'upcoming', label: 'Upcoming', count: state.data ? upcoming.length : undefined },
              { value: 'past', label: 'Past' },
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
                message={tab === 'upcoming' ? 'You have not been invited to any upcoming sessions.' : 'You have no past sessions.'}
                action={<LinkButton to="/student/meetings">Book a one-to-one meeting</LinkButton>}
              />
            ) : (
              <DataTable
                columns={columns}
                rows={list}
                actions={(s) =>
                  (s.agenda || s.minutes) && (
                    <Button variant="text" onClick={() => setViewing(s)}>
                      Details
                    </Button>
                  )
                }
              />
            )
          }}
        </Loadable>
      </Panel>
      <Modal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title={viewing?.title || ''}
        description={viewing ? `${viewing.mentor.name} · ${formatRange(viewing.start_time, viewing.end_time)}` : undefined}
      >
        {viewing && (
          <dl className="space-y-4">
            <div>
              <dt className="text-xs text-neutral-500">Agenda</dt>
              <dd className="mt-0.5 text-base text-neutral-800">{viewing.agenda || '—'}</dd>
            </div>
            {viewing.minutes && (
              <div>
                <dt className="text-xs text-neutral-500">Minutes</dt>
                <dd className="mt-0.5 whitespace-pre-line text-base text-neutral-800">{viewing.minutes}</dd>
              </div>
            )}
          </dl>
        )}
      </Modal>
    </>
  )
}
