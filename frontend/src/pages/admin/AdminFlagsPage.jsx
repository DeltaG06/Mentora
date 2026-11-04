import { useState } from 'react'
import { FlagFilters, hasFilters } from '../../components/domain/FlagFilters'
import { FlagTable } from '../../components/domain/FlagTable'
import { ResolveFlagModal } from '../../components/domain/ResolveFlagModal'
import { Button } from '../../components/ui/Button'
import { Panel } from '../../components/ui/Card'
import { EmptyState, Loadable } from '../../components/ui/Feedback'
import { PageHeader } from '../../components/ui/PageHeader'
import { Pagination } from '../../components/ui/Pagination'
import { Tabs } from '../../components/ui/Tabs'
import { useApi } from '../../lib/useApi'

const PAGE_SIZE = 20
const NO_FILTERS = { status: '', rule: '', semester_id: '' }

export default function AdminFlagsPage() {
  const [view, setView] = useState('escalated')
  const [filters, setFilters] = useState(NO_FILTERS)
  const [page, setPage] = useState(1)
  const [resolving, setResolving] = useState(null)

  const params = { page, page_size: PAGE_SIZE }
  if (view === 'escalated') params.escalated = true
  else if (filters.status) params.status = filters.status
  if (filters.rule) params.rule = filters.rule
  if (filters.semester_id) params.semester_id = filters.semester_id
  const state = useApi('/admin/flags', params)

  const empty = () => {
    if (hasFilters(filters)) {
      return (
        <EmptyState
          message="No flags match these filters."
          action={
            <Button variant="secondary" onClick={() => setFilters(NO_FILTERS)}>
              Clear filters
            </Button>
          }
        />
      )
    }
    return view === 'escalated' ? (
      <EmptyState
        message="No flags are escalated. Every flag is being followed up within 14 days."
        action={
          <Button variant="secondary" onClick={() => setView('all')}>
            View all flags
          </Button>
        }
      />
    ) : (
      <EmptyState message="No flags have been raised yet." />
    )
  }

  return (
    <>
      <PageHeader
        title="Flags"
        description="Flags open for more than 14 days are escalated here. Any unresolved flag can be resolved with a note."
      />
      <Panel bodyClassName="">
        <div className="border-b border-neutral-200 px-4 md:px-5">
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
              empty()
            ) : (
              <>
                <FlagTable flags={data.items} showStudent detailPath={(flag) => `/admin/flags/${flag.id}`} onResolve={setResolving} />
                <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />
              </>
            )
          }
        </Loadable>
      </Panel>
      <ResolveFlagModal flag={resolving} onClose={() => setResolving(null)} onResolved={state.reload} />
    </>
  )
}
