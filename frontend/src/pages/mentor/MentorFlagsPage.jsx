import { useState } from 'react'
import { FlagFilters, hasFilters } from '../../components/domain/FlagFilters'
import { FlagTable } from '../../components/domain/FlagTable'
import { ResolveFlagModal } from '../../components/domain/ResolveFlagModal'
import { Button, LinkButton } from '../../components/ui/Button'
import { Panel } from '../../components/ui/Card'
import { EmptyState, Loadable } from '../../components/ui/Feedback'
import { PageHeader } from '../../components/ui/PageHeader'
import { Pagination } from '../../components/ui/Pagination'
import { useApi } from '../../lib/useApi'

const PAGE_SIZE = 20
const NO_FILTERS = { status: '', rule: '', semester_id: '' }

export default function MentorFlagsPage() {
  const [filters, setFilters] = useState(NO_FILTERS)
  const [page, setPage] = useState(1)
  const [resolving, setResolving] = useState(null)

  const params = { page, page_size: PAGE_SIZE }
  for (const [key, value] of Object.entries(filters)) if (value) params[key] = value
  const state = useApi('/mentor/flags', params)

  return (
    <>
      <PageHeader title="Flags" description="Flags raised for your current mentees." />
      <Panel bodyClassName="">
        <FlagFilters
          value={filters}
          onChange={(next) => {
            setFilters(next)
            setPage(1)
          }}
        />
        <Loadable state={state}>
          {(data) =>
            data.items.length === 0 ? (
              hasFilters(filters) ? (
                <EmptyState
                  message="No flags match these filters."
                  action={
                    <Button variant="secondary" onClick={() => setFilters(NO_FILTERS)}>
                      Clear filters
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  message="None of your mentees has a flag."
                  action={<LinkButton to="/mentor">Back to roster</LinkButton>}
                />
              )
            ) : (
              <>
                <FlagTable
                  flags={data.items}
                  showStudent
                  detailPath={(flag) => `/mentor/flags/${flag.id}`}
                  studentPath={(flag) => `/mentor/mentees/${flag.student.id}`}
                  onResolve={setResolving}
                />
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
