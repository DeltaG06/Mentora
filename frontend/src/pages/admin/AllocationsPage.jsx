import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, UserCog } from 'lucide-react'
import { api, errorMessage, fetchAll } from '../../api/client'
import { Badge, StatusBadge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { DataTable } from '../../components/ui/DataTable'
import { Alert, EmptyState, ErrorState, Loadable, Spinner } from '../../components/ui/Feedback'
import { Select } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { Pagination } from '../../components/ui/Pagination'
import { Tabs } from '../../components/ui/Tabs'
import { useToast } from '../../components/ui/Toast'
import { MENTOR_CAPACITY } from '../../lib/constants'
import { formatDate } from '../../lib/format'
import { useApi } from '../../lib/useApi'

const PAGE_SIZE = 20
const sameDept = (a, b) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase()

/** Active mentors, active students and active allocations, loaded together. */
function usePeople(refresh) {
  const [state, setState] = useState({ data: null, error: null, loading: true })
  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const [mentors, students, allocations] = await Promise.all([
        fetchAll('/admin/users', { role: 'mentor', status: 'active' }),
        fetchAll('/admin/users', { role: 'student', status: 'active' }),
        fetchAll('/admin/allocations', { status: 'active' }),
      ])
      const counts = new Map()
      for (const a of allocations) counts.set(a.mentor.id, (counts.get(a.mentor.id) || 0) + 1)
      const allocated = new Set(allocations.map((a) => a.student.id))
      setState({
        data: {
          mentors: mentors.map((m) => ({ ...m, mentees: counts.get(m.id) || 0 })),
          unallocated: students.filter((s) => !allocated.has(s.id)),
        },
        error: null,
        loading: false,
      })
    } catch (error) {
      setState({ data: null, error, loading: false })
    }
  }, [])
  useEffect(() => {
    load()
  }, [load, refresh])
  return { ...state, reload: load }
}

function AssignPanel({ people, onAssigned }) {
  const toast = useToast()
  const [mentorId, setMentorId] = useState('')
  const [selected, setSelected] = useState([])
  const [query, setQuery] = useState('')
  const [outcome, setOutcome] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const mentor = people.mentors.find((m) => String(m.id) === mentorId)
  const candidates = useMemo(() => {
    if (!mentor) return []
    const q = query.trim().toLowerCase()
    return people.unallocated
      .filter((s) => sameDept(s.department, mentor.department))
      .filter((s) => !q || s.name.toLowerCase().includes(q) || (s.roll_no || '').toLowerCase().includes(q))
      .sort((a, b) => a.year - b.year || a.name.localeCompare(b.name))
  }, [mentor, people.unallocated, query])

  const toggle = (id) => setSelected((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  const projected = (mentor?.mentees || 0) + selected.length

  const submit = async () => {
    setBusy(true)
    setError(null)
    setOutcome(null)
    try {
      const { data } = await api.post('/admin/allocations', { mentor_id: mentor.id, student_ids: selected })
      const names = new Map(people.unallocated.map((s) => [s.id, s.name]))
      const assigned = data.results.filter((r) => r.status === 'assigned').length
      setOutcome({ ...data, names })
      if (assigned) toast.success(`${assigned} student${assigned === 1 ? '' : 's'} allocated to ${mentor.name}.`)
      setSelected([])
      onAssigned()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Allocate students" description="Students can only be allocated to a mentor from their own department.">
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        {outcome && (
          <div className="space-y-2">
            {outcome.warnings.map((w) => (
              <Alert key={w} tone="warning">
                {w}
              </Alert>
            ))}
            {outcome.results.some((r) => r.status === 'failed') && (
              <Alert tone="error" title="Some students were not allocated">
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {outcome.results
                    .filter((r) => r.status === 'failed')
                    .map((r) => (
                      <li key={r.student_id}>
                        {outcome.names.get(r.student_id) || `Student ${r.student_id}`}: {r.reason}
                      </li>
                    ))}
                </ul>
              </Alert>
            )}
          </div>
        )}
        <Select
          label="Mentor"
          value={mentorId}
          onChange={(e) => {
            setMentorId(e.target.value)
            setSelected([])
            setOutcome(null)
          }}
        >
          <option value="">Select a mentor</option>
          {people.mentors.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} · {m.department} · {m.mentees} mentee{m.mentees === 1 ? '' : 's'}
            </option>
          ))}
        </Select>

        {mentor && (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by name or roll number"
                className="input pl-9"
                aria-label="Filter students"
              />
            </div>
            {candidates.length === 0 ? (
              <p className="rounded-md bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
                No unallocated students in the {mentor.department} department{query ? ' match this filter' : ''}.
              </p>
            ) : (
              <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200">
                {candidates.map((s) => (
                  <li key={s.id}>
                    <label className="flex min-h-[44px] cursor-pointer items-center gap-3 px-3 py-2 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-500"
                        checked={selected.includes(s.id)}
                        onChange={() => toggle(s.id)}
                      />
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="text-slate-900">{s.name}</span>
                        <span className="ml-2 text-slate-500">{s.roll_no}</span>
                      </span>
                      <span className="text-xs text-slate-500">
                        Y{s.year} {s.division}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-600">
                {selected.length} selected · {mentor.name} will have{' '}
                <span className={projected > MENTOR_CAPACITY ? 'font-semibold text-amber-700' : 'font-medium'}>{projected}</span> mentees
                {projected > MENTOR_CAPACITY && ` (above the recommended ${MENTOR_CAPACITY})`}
              </p>
              <Button onClick={submit} loading={busy} disabled={selected.length === 0}>
                Allocate {selected.length || ''}
              </Button>
            </div>
          </>
        )}
      </div>
    </Card>
  )
}

function ReassignModal({ allocation, mentors, onClose, onDone }) {
  const toast = useToast()
  const [mentorId, setMentorId] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setMentorId('')
    setError(null)
  }, [allocation])

  const options = allocation
    ? mentors.filter((m) => m.id !== allocation.mentor.id && sameDept(m.department, allocation.student.department))
    : []

  const submit = async () => {
    if (!mentorId) return setError('Choose the new mentor.')
    setBusy(true)
    setError(null)
    try {
      const { data } = await api.post(`/admin/allocations/${allocation.id}/reassign`, { new_mentor_id: Number(mentorId) })
      toast.success(`${data.allocation.student.name} reassigned to ${data.allocation.mentor.name}.`)
      data.warnings.forEach((w) => toast.error(w))
      onDone()
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={Boolean(allocation)}
      onClose={onClose}
      size="sm"
      title="Reassign student"
      description={allocation ? `${allocation.student.name} · currently with ${allocation.mentor.name}` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy} disabled={options.length === 0}>
            Reassign
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        {options.length === 0 ? (
          <Alert tone="info">There is no other active mentor in the {allocation?.student.department} department.</Alert>
        ) : (
          <Select label="New mentor" value={mentorId} onChange={(e) => setMentorId(e.target.value)}>
            <option value="">Select a mentor</option>
            {options.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} · {m.mentees} mentee{m.mentees === 1 ? '' : 's'}
              </option>
            ))}
          </Select>
        )}
        <p className="text-xs text-slate-500">
          The current allocation is ended, not deleted, so the history stays on record. All three people are notified.
        </p>
      </div>
    </Modal>
  )
}

export default function AllocationsPage() {
  const [refresh, setRefresh] = useState(0)
  const people = usePeople(refresh)
  const [status, setStatus] = useState('active')
  const [mentorFilter, setMentorFilter] = useState('')
  const [page, setPage] = useState(1)
  const [reassigning, setReassigning] = useState(null)
  const reload = () => setRefresh((n) => n + 1)

  const params = { status, page, page_size: PAGE_SIZE }
  if (mentorFilter) params.mentor_id = mentorFilter
  const list = useApi('/admin/allocations', params, refresh)

  const columns = [
    {
      key: 'student',
      header: 'Student',
      render: (a) => (
        <span>
          <span className="font-medium text-slate-900">{a.student.name}</span>
          <span className="block text-xs text-slate-500">
            {a.student.roll_no} · Y{a.student.year} {a.student.division}
          </span>
        </span>
      ),
    },
    {
      key: 'mentor',
      header: 'Mentor',
      render: (a) => (
        <span>
          {a.mentor.name}
          <span className="block text-xs text-slate-500">{a.mentor.department}</span>
        </span>
      ),
    },
    { key: 'since', header: 'Since', render: (a) => formatDate(a.start_date) },
    {
      key: 'status',
      header: 'Status',
      render: (a) => (a.status === 'ended' ? <span className="text-sm text-slate-500">Ended {formatDate(a.ended_at)}</span> : <StatusBadge status="active" />),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      mobile: false,
      render: (a) =>
        a.status === 'active' && (
          <Button size="sm" variant="secondary" onClick={() => setReassigning(a)}>
            Reassign
          </Button>
        ),
    },
  ]

  return (
    <>
      <PageHeader title="Allocations" description="Every student has exactly one active mentor from their department." />
      {people.loading && !people.data ? (
        <Spinner />
      ) : people.error ? (
        <ErrorState error={people.error} onRetry={people.reload} />
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[26rem_minmax(0,1fr)]">
          <div className="space-y-4">
            <AssignPanel people={people.data} onAssigned={reload} />
            {people.data.unallocated.length > 0 && (
              <p className="px-1 text-sm text-slate-500">
                <Badge tone="amber">{people.data.unallocated.length}</Badge> active student
                {people.data.unallocated.length === 1 ? ' has' : 's have'} no mentor yet.
              </p>
            )}
          </div>
          <Card bodyClassName="">
            <div className="flex flex-col gap-3 px-4 pt-2 sm:flex-row sm:items-end sm:justify-between sm:px-5">
              <Tabs
                tabs={[
                  { value: 'active', label: 'Active' },
                  { value: 'ended', label: 'History' },
                ]}
                value={status}
                onChange={(v) => {
                  setStatus(v)
                  setPage(1)
                }}
              />
              <Select
                aria-label="Mentor"
                value={mentorFilter}
                onChange={(e) => {
                  setMentorFilter(e.target.value)
                  setPage(1)
                }}
                className="pb-3 sm:w-60"
              >
                <option value="">All mentors</option>
                {people.data.mentors.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </div>
            <Loadable state={list}>
              {(data) =>
                data.items.length === 0 ? (
                  <EmptyState icon={UserCog} title={status === 'active' ? 'No active allocations' : 'No ended allocations'} />
                ) : (
                  <>
                    <DataTable
                      columns={columns}
                      rows={data.items}
                      mobileActions={(a) =>
                        a.status === 'active' && (
                          <Button size="sm" variant="secondary" onClick={() => setReassigning(a)}>
                            Reassign
                          </Button>
                        )
                      }
                    />
                    <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />
                  </>
                )
              }
            </Loadable>
          </Card>
        </div>
      )}
      <ReassignModal
        allocation={reassigning}
        mentors={people.data?.mentors || []}
        onClose={() => setReassigning(null)}
        onDone={reload}
      />
    </>
  )
}
