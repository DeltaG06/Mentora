import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, errorMessage, fetchAll } from '../../api/client'
import { Button, LinkButton } from '../../components/ui/Button'
import { Panel } from '../../components/ui/Card'
import { DataTable } from '../../components/ui/DataTable'
import { Alert, EmptyState, ErrorState, Loadable, SkeletonRows } from '../../components/ui/Feedback'
import { Select } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { Pagination } from '../../components/ui/Pagination'
import { Status } from '../../components/ui/Status'
import { Tabs } from '../../components/ui/Tabs'
import { useToast } from '../../components/ui/Toast'
import { MENTOR_CAPACITY } from '../../lib/constants'
import { formatDate } from '../../lib/format'
import { useApi } from '../../lib/useApi'

const PAGE_SIZE = 20
const sameDept = (a, b) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase()

/** Active mentors (with mentee counts) and active students without a mentor. */
function usePeople(refresh) {
  const [state, setState] = useState({ data: null, error: null })
  const load = useCallback(async () => {
    setState((s) => ({ ...s, error: null }))
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
      })
    } catch (error) {
      setState((s) => ({ ...s, error }))
    }
  }, [])
  useEffect(() => {
    load()
  }, [load, refresh])
  return { ...state, reload: load }
}

const menteeCount = (count) =>
  count > MENTOR_CAPACITY ? <span className="text-amber-700">{count} (over {MENTOR_CAPACITY})</span> : count

const MENTOR_COLUMNS = [
  {
    key: 'name',
    header: 'Mentor',
    render: (m) => (
      <span>
        <span className="font-medium text-neutral-800">{m.name}</span>
        <span className="block text-xs text-neutral-500">{m.designation}</span>
      </span>
    ),
  },
  { key: 'department', header: 'Department' },
  { key: 'mentees', header: 'Active mentees', align: 'right', render: (m) => menteeCount(m.mentees) },
]

function AllocatePanels({ people, onAssigned }) {
  const toast = useToast()
  const [mentorId, setMentorId] = useState(null)
  const [selected, setSelected] = useState([])
  const [query, setQuery] = useState('')
  const [year, setYear] = useState('')
  const [outcome, setOutcome] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const mentor = people.mentors.find((m) => m.id === mentorId)
  const students = useMemo(() => {
    if (!mentor) return []
    const q = query.trim().toLowerCase()
    return people.unallocated
      .filter((s) => sameDept(s.department, mentor.department))
      .filter((s) => !year || String(s.year) === year)
      .filter((s) => !q || s.name.toLowerCase().includes(q) || (s.roll_no || '').toLowerCase().includes(q))
      .sort((a, b) => a.year - b.year || a.name.localeCompare(b.name))
  }, [mentor, people.unallocated, query, year])

  const visibleIds = students.map((s) => s.id)
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id))
  const toggle = (id) => setSelected((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  const toggleAll = () =>
    setSelected((ids) => (allSelected ? ids.filter((id) => !visibleIds.includes(id)) : [...new Set([...ids, ...visibleIds])]))
  const projected = (mentor?.mentees || 0) + selected.length

  const chooseMentor = (m) => {
    setMentorId(m.id)
    setSelected([])
    setOutcome(null)
    setError(null)
  }

  const allocate = async () => {
    setBusy(true)
    setError(null)
    setOutcome(null)
    try {
      const names = new Map(people.unallocated.map((s) => [s.id, s]))
      const { data } = await api.post('/admin/allocations', { mentor_id: mentor.id, student_ids: selected })
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

  const studentColumns = [
    {
      key: 'select',
      header: (
        <input type="checkbox" className="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all visible students" />
      ),
      width: 40,
      mobile: false,
      render: (s) => (
        <input
          type="checkbox"
          className="checkbox"
          checked={selected.includes(s.id)}
          onChange={() => toggle(s.id)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select ${s.name}`}
        />
      ),
    },
    {
      key: 'student',
      header: 'Student',
      render: (s) => (
        <span>
          <span className="text-neutral-800">{s.name}</span>
          <span className="ml-2 font-mono text-xs text-neutral-500">{s.roll_no}</span>
        </span>
      ),
    },
    { key: 'year', header: 'Year / Div', render: (s) => `${s.year} · ${s.division}` },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_3fr]">
        <Panel title="Mentors" description="Select the mentor to allocate to." bodyClassName="">
          {people.mentors.length === 0 ? (
            <EmptyState message="There are no active mentors yet." action={<LinkButton to="/admin/approvals">Review approvals</LinkButton>} />
          ) : (
            <DataTable
              columns={MENTOR_COLUMNS}
              rows={people.mentors}
              selectedKey={mentorId ?? undefined}
              onRowClick={chooseMentor}
              maxHeight="28rem"
              mobileTitle={(m) => (
                <label className="flex min-h-[44px] items-center gap-3">
                  <input type="radio" name="mentor" checked={m.id === mentorId} onChange={() => chooseMentor(m)} className="h-4 w-4 accent-accent-700" />
                  {m.name}
                </label>
              )}
            />
          )}
        </Panel>

        <Panel
          title={mentor ? `Unallocated students · ${mentor.department}` : 'Unallocated students'}
          description={mentor ? 'Only students from the mentor’s department can be allocated.' : undefined}
          bodyClassName=""
        >
          {!mentor ? (
            <EmptyState message="Select a mentor to see the unallocated students in their department." />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 border-b border-neutral-200 p-4 sm:grid-cols-[1fr_10rem] md:px-5">
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name or roll number"
                  className="input"
                  aria-label="Search students"
                />
                <Select aria-label="Year" value={year} onChange={(e) => setYear(e.target.value)}>
                  <option value="">All years</option>
                  {[1, 2, 3, 4].map((y) => (
                    <option key={y} value={y}>
                      Year {y}
                    </option>
                  ))}
                </Select>
              </div>
              {students.length === 0 ? (
                <EmptyState
                  message={
                    query || year
                      ? 'No unallocated students match this search.'
                      : `Every active student in the ${mentor.department} department has a mentor.`
                  }
                  action={
                    (query || year) && (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setQuery('')
                          setYear('')
                        }}
                      >
                        Clear search
                      </Button>
                    )
                  }
                />
              ) : (
                <DataTable
                  columns={studentColumns}
                  rows={students}
                  maxHeight="22rem"
                  onRowClick={(s) => toggle(s.id)}
                  selectedKey={undefined}
                  mobileTitle={(s) => (
                    <label className="flex min-h-[44px] items-center gap-3">
                      <input type="checkbox" className="checkbox" checked={selected.includes(s.id)} onChange={() => toggle(s.id)} />
                      {s.name}
                      <span className="font-mono text-xs font-normal text-neutral-500">{s.roll_no}</span>
                    </label>
                  )}
                />
              )}
              <div className="sticky bottom-0 flex flex-col gap-3 border-t border-neutral-200 bg-neutral-0 px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:px-5">
                <p className="text-sm text-neutral-600">
                  {selected.length} selected · {mentor.name} will have{' '}
                  <span className={projected > MENTOR_CAPACITY ? 'text-amber-700' : 'text-neutral-900'}>{projected}</span> mentees
                </p>
                <Button onClick={allocate} loading={busy} disabled={selected.length === 0}>
                  Allocate {selected.length || ''}
                </Button>
              </div>
            </>
          )}
        </Panel>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {outcome && (
        <Panel title="Allocation results" bodyClassName="">
          {outcome.warnings.length > 0 && (
            <div className="space-y-2 border-b border-neutral-200 p-4 md:px-5">
              {outcome.warnings.map((w) => (
                <Alert key={w} tone="warning">
                  {w}
                </Alert>
              ))}
            </div>
          )}
          <DataTable
            columns={[
              {
                key: 'student',
                header: 'Student',
                render: (r) => outcome.names.get(r.student_id)?.name || `Student ${r.student_id}`,
              },
              { key: 'result', header: 'Result', render: (r) => <Status kind="outcome" status={r.status} /> },
              { key: 'reason', header: 'Reason', mobileFull: true, render: (r) => r.reason },
            ]}
            rows={outcome.results}
            rowKey={(r) => r.student_id}
          />
        </Panel>
      )}
    </div>
  )
}

function ReassignModal({ allocation, mentors, onClose, onDone }) {
  const toast = useToast()
  const [mentorId, setMentorId] = useState('')
  const [fieldError, setFieldError] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setMentorId('')
    setFieldError(null)
    setError(null)
  }, [allocation])

  const options = allocation
    ? mentors.filter((m) => m.id !== allocation.mentor.id && sameDept(m.department, allocation.student.department))
    : []

  const submit = async () => {
    if (!mentorId) return setFieldError('Choose the new mentor.')
    setBusy(true)
    setError(null)
    try {
      const { data } = await api.post(`/admin/allocations/${allocation.id}/reassign`, { new_mentor_id: Number(mentorId) })
      toast.success(`${data.allocation.student.name} reassigned to ${data.allocation.mentor.name}.`)
      onDone(data.warnings)
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
        {options.length === 0 ? (
          <Alert tone="info">There is no other active mentor in the {allocation?.student.department} department.</Alert>
        ) : (
          <Select label="New mentor" value={mentorId} onChange={(e) => setMentorId(e.target.value)} error={fieldError}>
            <option value="">Select a mentor</option>
            {options.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} · {m.mentees} mentee{m.mentees === 1 ? '' : 's'}
              </option>
            ))}
          </Select>
        )}
        <p className="text-xs text-neutral-500">The current allocation is ended, not deleted. All three people are notified.</p>
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    </Modal>
  )
}

const ALLOCATION_COLUMNS = [
  {
    key: 'student',
    header: 'Student',
    render: (a) => (
      <span>
        <span className="text-neutral-800">{a.student.name}</span>
        <span className="block font-mono text-xs text-neutral-500">{a.student.roll_no}</span>
      </span>
    ),
  },
  { key: 'year', header: 'Year / Div', render: (a) => `${a.student.year} · ${a.student.division}` },
  { key: 'mentor', header: 'Mentor', render: (a) => a.mentor.name },
  { key: 'department', header: 'Department', render: (a) => a.mentor.department },
  { key: 'since', header: 'Since', render: (a) => formatDate(a.start_date) },
  { key: 'ended', header: 'Ended', render: (a) => (a.ended_at ? formatDate(a.ended_at) : null) },
  { key: 'status', header: 'Status', render: (a) => <Status kind="allocation" status={a.status} /> },
]

export default function AllocationsPage() {
  const [refresh, setRefresh] = useState(0)
  const people = usePeople(refresh)
  const [status, setStatus] = useState('active')
  const [mentorFilter, setMentorFilter] = useState('')
  const [page, setPage] = useState(1)
  const [reassigning, setReassigning] = useState(null)
  const [warnings, setWarnings] = useState([])
  const reload = () => setRefresh((n) => n + 1)

  const params = { status, page, page_size: PAGE_SIZE }
  if (mentorFilter) params.mentor_id = mentorFilter
  const list = useApi('/admin/allocations', params, refresh)

  return (
    <>
      <PageHeader title="Allocations" description="Every student has exactly one active mentor from their own department." />
      {people.error && !people.data ? (
        <ErrorState error={people.error} onRetry={people.reload} />
      ) : !people.data ? (
        <div className="panel">
          <SkeletonRows rows={5} columns={3} />
        </div>
      ) : (
        <div className="space-y-6">
          <AllocatePanels people={people.data} onAssigned={reload} />
          {warnings.map((w) => (
            <Alert key={w} tone="warning">
              {w}
            </Alert>
          ))}
          <Panel bodyClassName="">
            <div className="flex flex-col gap-2 border-b border-neutral-200 px-4 md:flex-row md:items-center md:justify-between md:px-5">
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
                className="pb-3 md:w-60 md:pb-0"
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
                  <EmptyState
                    message={status === 'active' ? 'There are no active allocations.' : 'No allocations have ended yet.'}
                    action={
                      mentorFilter ? (
                        <Button variant="secondary" onClick={() => setMentorFilter('')}>
                          Show all mentors
                        </Button>
                      ) : undefined
                    }
                  />
                ) : (
                  <>
                    <DataTable
                      columns={ALLOCATION_COLUMNS}
                      rows={data.items}
                      actions={(a) =>
                        a.status === 'active' && (
                          <Button variant="text" onClick={() => setReassigning(a)}>
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
          </Panel>
        </div>
      )}
      <ReassignModal
        allocation={reassigning}
        mentors={people.data?.mentors || []}
        onClose={() => setReassigning(null)}
        onDone={(w) => {
          setWarnings(w)
          reload()
        }}
      />
    </>
  )
}
