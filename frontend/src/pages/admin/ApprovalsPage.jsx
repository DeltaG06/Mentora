import { useState } from 'react'
import { api } from '../../api/client'
import { Button, LinkButton } from '../../components/ui/Button'
import { Panel } from '../../components/ui/Card'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { DataTable } from '../../components/ui/DataTable'
import { EmptyState, Loadable } from '../../components/ui/Feedback'
import { PageHeader } from '../../components/ui/PageHeader'
import { useToast } from '../../components/ui/Toast'
import { formatDateTime } from '../../lib/format'
import { useApi } from '../../lib/useApi'

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
  { key: 'designation', header: 'Designation' },
  { key: 'department', header: 'Department' },
  { key: 'phone', header: 'Phone' },
  { key: 'created', header: 'Registered', render: (u) => formatDateTime(u.created_at) },
]

export default function ApprovalsPage() {
  const toast = useToast()
  const state = useApi('/admin/users', { role: 'mentor', status: 'pending', page_size: 100 })
  const [approving, setApproving] = useState(null)

  return (
    <>
      <PageHeader title="Mentor approvals" description="Faculty who registered as mentors. Approve them so they can sign in and receive mentees." />
      <Panel bodyClassName="">
        <Loadable state={state}>
          {(data) =>
            data.items.length === 0 ? (
              <EmptyState
                message="No mentor registrations are waiting for approval."
                action={<LinkButton to="/admin/users">View all users</LinkButton>}
              />
            ) : (
              <DataTable
                columns={COLUMNS}
                rows={data.items}
                actions={(u) => (
                  <Button variant="text" onClick={() => setApproving(u)}>
                    Approve
                  </Button>
                )}
              />
            )
          }
        </Loadable>
      </Panel>
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
            {approving.name} ({approving.designation}, {approving.department}) will be able to sign in and can be allocated
            students.
          </p>
        )}
      </ConfirmModal>
    </>
  )
}
