import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { FlagTable } from '../../components/domain/FlagTable'
import { RuleBadge } from '../../components/ui/Badge'
import { Card } from '../../components/ui/Card'
import { EmptyState, Loadable } from '../../components/ui/Feedback'
import { PageHeader } from '../../components/ui/PageHeader'
import { Pagination } from '../../components/ui/Pagination'
import { useApi } from '../../lib/useApi'

const PAGE_SIZE = 20

const RULES = [
  ['F1', 'SGPA dropped by 1.0 or more compared with your previous verified result.'],
  ['F2', 'A subject’s final marks are below 40.'],
  ['F3', 'SGPA is below 6.0.'],
  ['F4', 'An internal subject is below 40%, or your internal average fell by 15 points or more.'],
  ['F5', 'A submission deadline passed without an internal or result submission.'],
]

export default function StudentFlagsPage() {
  const [page, setPage] = useState(1)
  const state = useApi('/students/me/flags', { page, page_size: PAGE_SIZE })

  return (
    <>
      <PageHeader
        title="My flags"
        description="Flags are raised automatically when a verified record meets one of the scheme’s rules."
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card bodyClassName="">
          <Loadable state={state}>
            {(data) =>
              data.items.length === 0 ? (
                <EmptyState icon={ShieldCheck} title="No flags">
                  Nothing in your verified records needs attention.
                </EmptyState>
              ) : (
                <>
                  <FlagTable flags={data.items} />
                  <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />
                </>
              )
            }
          </Loadable>
        </Card>
        <Card title="How flags work">
          <ul className="space-y-3">
            {RULES.map(([rule, text]) => (
              <li key={rule} className="flex gap-3 text-sm text-slate-600">
                <RuleBadge rule={rule} />
                <span>{text}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t border-slate-100 pt-4 text-xs leading-relaxed text-slate-500">
            Your mentor discusses each flag with you in a meeting and records how it was resolved. Flags left
            open for 14 days are escalated to the scheme coordinator.
          </p>
        </Card>
      </div>
    </>
  )
}
