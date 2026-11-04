import { Link } from 'react-router-dom'
import { formatDate, RULE_LABELS } from '../../lib/format'
import { RuleBadge, StatusBadge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { DataTable } from '../ui/DataTable'

/**
 * Flags as a table. `showStudent` adds the student column; `onResolve`
 * adds a Resolve action for unresolved flags; `studentLink` turns the
 * student name into a link.
 */
export function FlagTable({ flags, showStudent = false, onResolve, studentLink }) {
  const columns = [
    {
      key: 'rule',
      header: 'Rule',
      className: 'w-40',
      mobile: false,
      render: (flag) => (
        <span className="flex items-center gap-2">
          <RuleBadge rule={flag.rule} />
          <span className="text-xs text-slate-500">{RULE_LABELS[flag.rule]}</span>
        </span>
      ),
    },
    showStudent && {
      key: 'student',
      header: 'Student',
      mobile: false,
      render: (flag) => (
        <span>
          {studentLink ? (
            <Link to={studentLink(flag)} className="link" onClick={(e) => e.stopPropagation()}>
              {flag.student.name}
            </Link>
          ) : (
            <span className="font-medium text-slate-900">{flag.student.name}</span>
          )}
          <span className="block text-xs text-slate-500">{flag.student.roll_no}</span>
        </span>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      mobileFull: true,
      render: (flag) => (
        <span>
          {flag.reason}
          {flag.resolution_note && (
            <span className="mt-1 block text-xs text-slate-500">Resolution: {flag.resolution_note}</span>
          )}
        </span>
      ),
    },
    { key: 'semester', header: 'Semester', render: (flag) => flag.semester.label },
    { key: 'raised', header: 'Raised', render: (flag) => formatDate(flag.raised_at) },
    { key: 'status', header: 'Status', mobile: false, render: (flag) => <StatusBadge status={flag.status} /> },
    onResolve && {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      mobile: false,
      render: (flag) =>
        flag.status !== 'resolved' && (
          <Button size="sm" variant="secondary" onClick={() => onResolve(flag)}>
            Resolve
          </Button>
        ),
    },
  ].filter(Boolean)

  return (
    <DataTable
      columns={columns}
      rows={flags}
      mobileTitle={(flag) => (
        <span className="flex flex-wrap items-center gap-2">
          <RuleBadge rule={flag.rule} />
          <span>{showStudent ? flag.student.name : RULE_LABELS[flag.rule]}</span>
          <StatusBadge status={flag.status} />
        </span>
      )}
      mobileActions={
        onResolve
          ? (flag) =>
              flag.status !== 'resolved' && (
                <Button size="sm" variant="secondary" onClick={() => onResolve(flag)}>
                  Resolve
                </Button>
              )
          : undefined
      }
    />
  )
}
