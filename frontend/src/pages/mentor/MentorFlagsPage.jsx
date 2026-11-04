import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { FlagFilters } from '../../components/domain/FlagFilters'
import { FlagTable } from '../../components/domain/FlagTable'
import { ResolveFlagModal } from '../../components/domain/ResolveFlagModal'
import { Card } from '../../components/ui/Card'
import { EmptyState, Loadable } from '../../components/ui/Feedback'
import { PageHeader } from '../../components/ui/PageHeader'
import { Pagination } from '../../components/ui/Pagination'
import { useApi } from '../../lib/useApi'

const PAGE_SIZE = 20

export default function MentorFlagsPage() {
  const [filters, setFilters] = useState({ status: '', rule: '', semester_id: '' })
  const [page, setPage] = useState(1)
  const [resolving, setResolving] = useState(null)

  const params = { page, page_size: PAGE_SIZE }
  for (const [key, value] of Object.entries(filters)) if (value) params[key] = value
  const state = useApi('/mentor/flags', params)

  return (
    <>
      <PageHeader title="Flags" description="Flags raised for your current mentees." />
      <Card bodyClassName="">
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
              <EmptyState icon={ShieldCheck} title="No flags match these filters" />
            ) : (
              <>
                <FlagTable
                  flags={data.items}
                  showStudent
                  studentLink={(flag) => `/mentor/mentees/${flag.student.id}`}
                  onResolve={setResolving}
                />
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
