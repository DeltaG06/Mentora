import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { FlagFilters } from '../../components/domain/FlagFilters'
import { FlagTable } from '../../components/domain/FlagTable'
import { ResolveFlagModal } from '../../components/domain/ResolveFlagModal'
import { Card } from '../../components/ui/Card'
import { EmptyState, Loadable } from '../../components/ui/Feedback'
import { PageHeader } from '../../components/ui/PageHeader'
import { Pagination } from '../../components/ui/Pagination'
import { Tabs } from '../../components/ui/Tabs'
import { useApi } from '../../lib/useApi'

const PAGE_SIZE = 20

export default function AdminFlagsPage() {
  const [view, setView] = useState('escalated')
  const [filters, setFilters] = useState({ status: '', rule: '', semester_id: '' })
  const [page, setPage] = useState(1)
  const [resolving, setResolving] = useState(null)

  const params = { page, page_size: PAGE_SIZE }
  if (view === 'escalated') params.escalated = true
  else if (filters.status) params.status = filters.status
  if (filters.rule) params.rule = filters.rule
  if (filters.semester_id) params.semester_id = filters.semester_id
  const state = useApi('/admin/flags', params)

  return (
    <>
      <PageHeader
        title="Flags"
        description="Flags open for more than 14 days are escalated here. You can resolve any unresolved flag with a note."
      />
      <Card bodyClassName="">
        <div className="px-4 pt-2 sm:px-5">
          <Tabs
            tabs={[
              { value: 'escalated', label: 'Escalated', count: view === 'escalated' ? state.data?.total : undefined },
              { value: 'all', label: 'All flags' },
            ]}
            value={view}
            onChange={(v) => {
              setView(v)
              setPage(1)
            }}
          />
        </div>
        <FlagFilters
          value={filters}
          statuses={view === 'escalated' ? null : undefined}
          onChange={(next) => {
            setFilters(next)
            setPage(1)
          }}
        />
        <Loadable state={state}>
          {(data) =>
            data.items.length === 0 ? (
              <EmptyState icon={ShieldCheck} title={view === 'escalated' ? 'No escalated flags' : 'No flags match these filters'}>
                {view === 'escalated' && 'Every flag is being followed up within 14 days.'}
              </EmptyState>
            ) : (
              <>
                <FlagTable flags={data.items} showStudent onResolve={setResolving} />
                <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />
              </>
            )
          }
        </Loadable>
      </Card>
      <ResolveFlagModal flag={resolving} onClose={() => setResolving(null)} onResolved={state.reload} />
    </>
  )
}
