import { useState } from 'react'
import { UserCheck } from 'lucide-react'
import { api } from '../../api/client'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { DataTable } from '../../components/ui/DataTable'
import { EmptyState, Loadable } from '../../components/ui/Feedback'
import { PageHeader } from '../../components/ui/PageHeader'
import { useToast } from '../../components/ui/Toast'
import { formatDateTime } from '../../lib/format'
import { useApi } from '../../lib/useApi'

export default function ApprovalsPage() {
  const toast = useToast()
  const state = useApi('/admin/users', { role: 'mentor', status: 'pending', page_size: 100 })
  const [approving, setApproving] = useState(null)

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
    { key: 'designation', header: 'Designation' },
    { key: 'department', header: 'Department' },
    { key: 'phone', header: 'Phone', render: (u) => u.phone || '—' },
    { key: 'created', header: 'Registered', render: (u) => formatDateTime(u.created_at) },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      mobile: false,
      render: (u) => (
        <Button size="sm" onClick={() => setApproving(u)}>
          Approve
        </Button>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Mentor approvals"
        description="Faculty who registered as mentors. Approve them so they can sign in and receive mentees."
      />
      <Card bodyClassName="">
        <Loadable state={state}>
          {(data) =>
            data.items.length === 0 ? (
              <EmptyState icon={UserCheck} title="No registrations waiting">
                New mentor registrations will appear here.
              </EmptyState>
            ) : (
              <DataTable
                columns={columns}
                rows={data.items}
                mobileActions={(u) => (
                  <Button size="sm" onClick={() => setApproving(u)}>
                    Approve
                  </Button>
                )}
              />
            )
          }
        </Loadable>
      </Card>
      <ConfirmModal
        open={Boolean(approving)}
        title="Approve mentor?"
        confirmLabel="Approve"
        onClose={() => setApproving(null)}
        onConfirm={async () => {
          await api.patch(`/admin/users/${approving.id}/status`, { status: 'active' })
          toast.success(`${approving.name} can now sign in.`)
          state.reload()
        }}
      >
        {approving && (
          <p>
            <span className="font-medium">{approving.name}</span> ({approving.designation}, {approving.department}) will be able to
            sign in and can be allocated students.
          </p>
        )}
      </ConfirmModal>
    </>
  )
}
