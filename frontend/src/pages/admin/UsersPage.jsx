import { useEffect, useState } from 'react'
import { api, errorMessage } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { Button } from '../../components/ui/Button'
import { Panel } from '../../components/ui/Card'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { DataTable } from '../../components/ui/DataTable'
import { Alert, EmptyState, Loadable } from '../../components/ui/Feedback'
import { Input, Select } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { Pagination } from '../../components/ui/Pagination'
import { Status } from '../../components/ui/Status'
import { useToast } from '../../components/ui/Toast'
import { DEPARTMENTS } from '../../lib/constants'
import { useApi } from '../../lib/useApi'

const PAGE_SIZE = 20
const NO_FILTERS = { role: '', status: '', department: '', year: '', search: '' }

// Allowed status transitions (contract, Module 1).
const NEXT_STATUS = {
  pending: { status: 'active', label: 'Approve' },
  active: { status: 'deactivated', label: 'Deactivate' },
  deactivated: { status: 'active', label: 'Reactivate' },
}

function EditStudentModal({ student, onClose, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState({ year: '', division: '' })
  const [divisionError, setDivisionError] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (student) {
      setForm({ year: String(student.year ?? ''), division: student.division ?? '' })
      setDivisionError(null)
      setError(null)
    }
  }, [student])

  const submit = async (event) => {
    event.preventDefault()
    if (!form.division.trim()) return setDivisionError('Enter a division.')
    setBusy(true)
    setError(null)
    try {
      const { data } = await api.patch(`/admin/users/${student.id}`, { year: Number(form.year), division: form.division.trim() })
      toast.success(`${data.name} updated.`)
      onSaved(data)
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={Boolean(student)}
      onClose={onClose}
      size="sm"
      title="Edit year and division"
      description={student ? `${student.name} · ${student.roll_no}` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="edit-student-form" loading={busy}>
            Save
          </Button>
        </>
      }
    >
      <form id="edit-student-form" onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-4">
          <Select label="Year" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })}>
            {[1, 2, 3, 4].map((y) => (
              <option key={y} value={y}>
                Year {y}
              </option>
            ))}
          </Select>
          <Input
            label="Division"
            value={form.division}
            maxLength={10}
            error={divisionError}
            onChange={(e) => {
              setForm({ ...form, division: e.target.value })
              setDivisionError(null)
            }}
          />
        </div>
        {error && <Alert tone="error">{error}</Alert>}
      </form>
    </Modal>
  )
}

const COLUMNS = [
  {
    key: 'name',
    header: 'Name',
    render: (u) => (
      <span>
        <span className="font-medium text-neutral-800">{u.name}</span>
        <span className="block text-xs text-neutral-500">{u.email}</span>
      </span>
    ),
  },
  { key: 'role', header: 'Role', render: (u) => u.role.charAt(0).toUpperCase() + u.role.slice(1) },
  { key: 'department', header: 'Department' },
  {
    key: 'details',
    header: 'Details',
    render: (u) =>
      u.role === 'student' ? (
        <span>
          <span className="font-mono text-xs">{u.roll_no}</span> · Year {u.year}, {u.division}
        </span>
      ) : u.role === 'mentor' ? (
        u.designation
      ) : null,
  },
  { key: 'status', header: 'Status', render: (u) => <Status kind="user" status={u.status} /> },
]

export default function UsersPage() {
  const { user: me } = useAuth()
  const toast = useToast()
  const [filters, setFilters] = useState(NO_FILTERS)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState(null)
  const [changing, setChanging] = useState(null)

  // Debounce the search box.
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((f) => (f.search === search.trim() ? f : { ...f, search: search.trim() }))
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const params = { page, page_size: PAGE_SIZE }
  for (const [key, value] of Object.entries(filters)) if (value) params[key] = value
  const state = useApi('/admin/users', params)

  const setFilter = (field) => (e) => {
    setFilters({ ...filters, [field]: e.target.value })
    setPage(1)
  }
  const clearFilters = () => {
    setSearch('')
    setFilters(NO_FILTERS)
    setPage(1)
  }

  const replace = (updated) =>
    state.setData((data) => ({ ...data, items: data.items.map((u) => (u.id === updated.id ? updated : u)) }))

  const actions = (u) => (
    <>
      {u.role === 'student' && (
        <Button variant="text" onClick={() => setEditing(u)}>
          Edit
        </Button>
      )}
      {u.id !== me.id && (
        <Button variant="text" onClick={() => setChanging(u)}>
          {NEXT_STATUS[u.status].label}
        </Button>
      )}
    </>
  )

  const next = changing ? NEXT_STATUS[changing.status] : null

  return (
    <>
      <PageHeader title="Users" description="Every student, mentor and administrator account." />
      <Panel bodyClassName="">
        <div className="grid grid-cols-1 gap-3 border-b border-neutral-200 p-4 sm:grid-cols-2 md:px-5 lg:grid-cols-5">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or roll number"
            className="input sm:col-span-2 lg:col-span-1"
            aria-label="Search by name or roll number"
          />
          <Select aria-label="Role" value={filters.role} onChange={setFilter('role')}>
            <option value="">All roles</option>
            <option value="student">Students</option>
            <option value="mentor">Mentors</option>
            <option value="admin">Administrators</option>
          </Select>
          <Select aria-label="Status" value={filters.status} onChange={setFilter('status')}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="pending">Awaiting approval</option>
            <option value="deactivated">Deactivated</option>
          </Select>
          <Select aria-label="Department" value={filters.department} onChange={setFilter('department')}>
            <option value="">All departments</option>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
          <Select aria-label="Year" value={filters.year} onChange={setFilter('year')}>
            <option value="">All years</option>
            {[1, 2, 3, 4].map((y) => (
              <option key={y} value={y}>
                Year {y}
              </option>
            ))}
          </Select>
        </div>
        <Loadable state={state}>
          {(data) =>
            data.items.length === 0 ? (
              <EmptyState
                message="No users match these filters."
                action={
                  <Button variant="secondary" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <>
                <DataTable columns={COLUMNS} rows={data.items} actions={actions} />
                <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />
              </>
            )
          }
        </Loadable>
      </Panel>

      <EditStudentModal student={editing} onClose={() => setEditing(null)} onSaved={replace} />
      <ConfirmModal
        open={Boolean(changing)}
        title={next ? `${next.label} account?` : ''}
        confirmLabel={next?.label}
        destructive={next?.status === 'deactivated'}
        onClose={() => setChanging(null)}
        onConfirm={async () => {
          const { data } = await api.patch(`/admin/users/${changing.id}/status`, { status: next.status })
          replace(data)
          toast.success(`${data.name} is now ${data.status}.`)
        }}
      >
        {changing && next && (
          <p>
            {next.status === 'deactivated'
              ? `${changing.name} will no longer be able to sign in. Their records are kept.`
              : `${changing.name} will be able to sign in.`}
          </p>
        )}
      </ConfirmModal>
    </>
  )
}
