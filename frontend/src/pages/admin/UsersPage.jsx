import { useEffect, useState } from 'react'
import { Search, Users } from 'lucide-react'
import { api, errorMessage } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { StatusBadge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { DataTable } from '../../components/ui/DataTable'
import { Alert, EmptyState, Loadable } from '../../components/ui/Feedback'
import { Input, Select } from '../../components/ui/Field'
import { Modal } from '../../components/ui/Modal'
import { PageHeader } from '../../components/ui/PageHeader'
import { Pagination } from '../../components/ui/Pagination'
import { useToast } from '../../components/ui/Toast'
import { DEPARTMENTS } from '../../lib/constants'
import { useApi } from '../../lib/useApi'

const PAGE_SIZE = 20

// Allowed status transitions (contract Module 1).
const NEXT_STATUS = {
  pending: { status: 'active', label: 'Approve' },
  active: { status: 'deactivated', label: 'Deactivate' },
  deactivated: { status: 'active', label: 'Reactivate' },
}

function EditStudentModal({ student, onClose, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState({ year: '', division: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (student) {
      setForm({ year: String(student.year ?? ''), division: student.division ?? '' })
      setError(null)
    }
  }, [student])

  const submit = async (event) => {
    event.preventDefault()
    if (!form.division.trim()) return setError('Enter a division.')
    setBusy(true)
    setError(null)
    try {
      const { data } = await api.patch(`/admin/users/${student.id}`, {
        year: Number(form.year),
        division: form.division.trim(),
      })
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
      <form id="edit-student-form" onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
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
            onChange={(e) => setForm({ ...form, division: e.target.value })}
          />
        </div>
      </form>
    </Modal>
  )
}

export default function UsersPage() {
  const { user: me } = useAuth()
  const toast = useToast()
  const [filters, setFilters] = useState({ role: '', status: '', department: '', year: '', search: '' })
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

  const replace = (updated) =>
    state.setData((data) => ({ ...data, items: data.items.map((u) => (u.id === updated.id ? updated : u)) }))

  const actions = (u) => {
    const next = NEXT_STATUS[u.status]
    return (
      <div className="flex justify-end gap-2">
        {u.role === 'student' && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(u)}>
            Edit
          </Button>
        )}
        {u.id !== me.id && (
          <Button size="sm" variant={next.status === 'deactivated' ? 'secondary' : 'primary'} onClick={() => setChanging(u)}>
            {next.label}
          </Button>
        )}
      </div>
    )
  }

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (u) => (
        <span>
          <span className="font-medium text-slate-900">{u.name}</span>
          <span className="block text-xs text-slate-500">{u.email}</span>
        </span>
      ),
    },
    { key: 'role', header: 'Role', render: (u) => u.role.charAt(0).toUpperCase() + u.role.slice(1) },
    { key: 'department', header: 'Department', render: (u) => u.department || '—' },
    {
      key: 'details',
      header: 'Details',
      render: (u) =>
        u.role === 'student' ? `${u.roll_no} · Y${u.year} ${u.division}` : u.role === 'mentor' ? u.designation : '—',
    },
    { key: 'status', header: 'Status', render: (u) => <StatusBadge status={u.status} /> },
    { key: 'actions', header: <span className="sr-only">Actions</span>, className: 'text-right', mobile: false, render: actions },
  ]

  const next = changing ? NEXT_STATUS[changing.status] : null

  return (
    <>
      <PageHeader title="Users" description="Every student, mentor and administrator account." />
      <Card bodyClassName="">
        <div className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-2 sm:px-5 lg:grid-cols-5">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or roll number"
              className="input pl-9"
              aria-label="Search by name or roll number"
            />
          </div>
          <Select aria-label="Role" value={filters.role} onChange={setFilter('role')}>
            <option value="">All roles</option>
            <option value="student">Students</option>
            <option value="mentor">Mentors</option>
            <option value="admin">Administrators</option>
          </Select>
          <Select aria-label="Status" value={filters.status} onChange={setFilter('status')}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
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
              <EmptyState icon={Users} title="No users match these filters" />
            ) : (
              <>
                <DataTable columns={columns} rows={data.items} mobileActions={actions} />
                <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />
              </>
            )
          }
        </Loadable>
      </Card>

      <EditStudentModal student={editing} onClose={() => setEditing(null)} onSaved={replace} />
      <ConfirmModal
        open={Boolean(changing)}
        title={next ? `${next.label} account?` : ''}
        confirmLabel={next?.label}
        tone={next?.status === 'deactivated' ? 'danger' : 'primary'}
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
