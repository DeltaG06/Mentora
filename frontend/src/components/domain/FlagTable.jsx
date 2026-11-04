import { Link } from 'react-router-dom'
import { formatDate } from '../../lib/format'
import { Button } from '../ui/Button'
import { DataTable } from '../ui/DataTable'
import { FlagLine, Status } from '../ui/Status'

/**
 * Flags as a table of flag lines. `detailPath(flag)` links each row to the
 * flag detail page; `onResolve` adds a Resolve action for unresolved flags;
 * `studentPath(flag)` links the student's name.
 */
export function FlagTable({ flags, showStudent = false, onResolve, detailPath, studentPath }) {
  const columns = [
    { key: 'flag', header: 'Flag', mobile: false, render: (flag) => <FlagLine flag={flag} /> },
    showStudent && {
      key: 'student',
      header: 'Student',
      render: (flag) => (
        <span>
          {studentPath ? (
            <Link to={studentPath(flag)} className="link">
              {flag.student.name}
            </Link>
          ) : (
            <span className="font-medium text-neutral-800">{flag.student.name}</span>
          )}
          <span className="block font-mono text-xs text-neutral-500">{flag.student.roll_no}</span>
        </span>
      ),
    },
    { key: 'semester', header: 'Semester', render: (flag) => flag.semester.label },
    { key: 'raised', header: 'Raised', render: (flag) => formatDate(flag.raised_at) },
    { key: 'status', header: 'Status', render: (flag) => <Status kind="flag" status={flag.status} /> },
  ].filter(Boolean)

  const actions =
    detailPath || onResolve
      ? (flag) => (
          <>
            {detailPath && (
              <Link to={detailPath(flag)} className="link inline-flex min-h-[44px] items-center text-sm md:min-h-0">
                Open
              </Link>
            )}
            {onResolve && flag.status !== 'resolved' && (
              <Button variant="text" onClick={() => onResolve(flag)}>
                Resolve
              </Button>
            )}
          </>
        )
      : undefined

  return <DataTable columns={columns} rows={flags} mobileTitle={(flag) => <FlagLine flag={flag} />} actions={actions} />
}
