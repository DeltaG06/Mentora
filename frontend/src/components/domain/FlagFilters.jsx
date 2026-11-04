import { RULE_LABELS } from '../../lib/format'
import { useApi } from '../../lib/useApi'
import { Select } from '../ui/Field'

/** Status / rule / semester filters for flag lists. `statuses` limits the status options. */
export function FlagFilters({ value, onChange, statuses = ['open', 'in_discussion', 'escalated', 'resolved'], extra }) {
  const semesters = useApi('/semesters')
  const set = (field) => (event) => onChange({ ...value, [field]: event.target.value })
  const labels = { open: 'Open', in_discussion: 'In discussion', escalated: 'Escalated', resolved: 'Resolved' }

  return (
    <div className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-3 sm:px-5 lg:grid-cols-4">
      {statuses && (
        <Select aria-label="Status" value={value.status} onChange={set('status')}>
          <option value="">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {labels[s]}
            </option>
          ))}
        </Select>
      )}
      <Select aria-label="Rule" value={value.rule} onChange={set('rule')}>
        <option value="">All rules</option>
        {Object.entries(RULE_LABELS).map(([rule, label]) => (
          <option key={rule} value={rule}>
            {rule} · {label}
          </option>
        ))}
      </Select>
      <Select aria-label="Semester" value={value.semester_id} onChange={set('semester_id')}>
        <option value="">All semesters</option>
        {(semesters.data || []).map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </Select>
      {extra}
    </div>
  )
}
