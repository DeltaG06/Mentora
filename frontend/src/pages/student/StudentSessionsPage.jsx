import { useMemo, useState } from 'react'
import { UsersRound } from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import { Badge, StatusBadge } from '../../components/ui/Badge'
import { Card } from '../../components/ui/Card'
import { EmptyState, Loadable } from '../../components/ui/Feedback'
import { PageHeader } from '../../components/ui/PageHeader'
import { Tabs } from '../../components/ui/Tabs'
import { formatRange } from '../../lib/format'
import { useApi } from '../../lib/useApi'

function isUpcomingSession(session) {
  return session.status === 'scheduled' && new Date(session.end_time).getTime() > Date.now()
}

export default function StudentSessionsPage() {
  const { user } = useAuth()
  const state = useApi('/students/me/group-sessions')
  const [tab, setTab] = useState('upcoming')

  const { upcoming, past } = useMemo(() => {
    const all = state.data || []
    return {
      upcoming: all.filter(isUpcomingSession),
      past: all.filter((s) => !isUpcomingSession(s)).reverse(),
    }
  }, [state.data])
  const list = tab === 'upcoming' ? upcoming : past

  return (
    <>
      <PageHeader title="Group sessions" description="Sessions your mentor has invited you to." />
      <Card bodyClassName="">
        <div className="px-4 pt-2 sm:px-5">
          <Tabs
            tabs={[
              { value: 'upcoming', label: 'Upcoming', count: state.data ? upcoming.length : null },
              { value: 'past', label: 'Past' },
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>
        <Loadable state={state}>
          {() =>
            list.length === 0 ? (
              <EmptyState icon={UsersRound} title={tab === 'upcoming' ? 'No upcoming sessions' : 'No past sessions'} />
            ) : (
              <ul className="divide-y divide-slate-100">
                {list.map((session) => {
                  const me = session.attendees.find((a) => a.student.id === user.id)
                  return (
                    <li key={session.id} className="px-4 py-4 sm:px-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900">{session.title}</p>
                          <p className="mt-0.5 text-sm tabular-nums text-slate-600">
                            {formatRange(session.start_time, session.end_time)} · {session.mentor.name}
                          </p>
                          {session.agenda && <p className="mt-1 text-sm text-slate-500">{session.agenda}</p>}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <StatusBadge status={session.status} />
                          {session.status === 'completed' && me && (
                            <Badge tone={me.attended ? 'green' : 'slate'}>{me.attended ? 'Attended' : 'Absent'}</Badge>
                          )}
                        </div>
                      </div>
                      {session.minutes && (
                        <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm">
                          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Minutes</p>
                          <p className="mt-1 whitespace-pre-line text-slate-700">{session.minutes}</p>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )
          }
        </Loadable>
      </Card>
    </>
  )
}
