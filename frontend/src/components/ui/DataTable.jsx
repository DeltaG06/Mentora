/**
 * Tables (docs/ui-design-system.md §4.5): 13px rows with 1px borders, no
 * zebra, sticky header, right-aligned numbers. Below `md` each row becomes
 * a stacked block in a list (still separated by lines, not cards).
 *
 * columns: [{ key, header, render?(row), align?: 'right'|'center', width?,
 *             mobile?: false, mobileFull?: true, sort?: (a, b) => number }]
 * `mobileTitle(row)` replaces the first column as the block title on phones.
 * `actions(row)` renders the row's text-button actions (last column).
 * `selectedKey` highlights one row.
 */
export function DataTable({ columns, rows, rowKey = (row) => row.id, mobileTitle, actions, selectedKey, onRowClick, sort, onSort, maxHeight = '70vh' }) {
  const cell = (column, row) => {
    const value = column.render ? column.render(row) : row[column.key]
    return value === null || value === undefined || value === '' ? <span className="text-neutral-400">—</span> : value
  }
  const align = (column) => (column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : '')

  return (
    <>
      <div className="hidden overflow-auto md:block" style={{ maxHeight }}>
        <table className="min-w-full border-separate border-spacing-0">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={`th ${align(column)}`}
                  style={column.width ? { width: column.width } : undefined}
                  aria-sort={sort?.key === column.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {column.sort && onSort ? (
                    <button type="button" onClick={() => onSort(column.key)} className="font-medium hover:text-neutral-800">
                      {column.header}
                      {sort?.key === column.key && <span aria-hidden>{sort.dir === 'asc' ? ' ↑' : ' ↓'}</span>}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              ))}
              {actions && (
                <th scope="col" className="th text-right">
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const key = rowKey(row)
              const selected = selectedKey !== undefined && key === selectedKey
              return (
                <tr
                  key={key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`${selected ? 'bg-accent-100' : 'hover:bg-neutral-50'} ${onRowClick ? 'cursor-pointer' : ''}`}
                >
                  {columns.map((column) => (
                    <td key={column.key} className={`td ${align(column)}`}>
                      {cell(column, row)}
                    </td>
                  ))}
                  {actions && (
                    <td className="td whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                      <span className="inline-flex justify-end gap-4">{actions(row)}</span>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <ul className="md:hidden">
        {rows.map((row) => {
          const key = rowKey(row)
          const visible = columns.filter((column) => column.mobile !== false)
          const title = mobileTitle ? mobileTitle(row) : visible[0] && cell(visible[0], row)
          const fields = mobileTitle ? visible : visible.slice(1)
          return (
            <li
              key={key}
              className={`border-b border-neutral-200 px-4 py-3 ${selectedKey !== undefined && key === selectedKey ? 'bg-accent-100' : ''}`}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              <div className="text-sm font-medium text-neutral-800">{title}</div>
              {fields.length > 0 && (
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
                  {fields.map((column) => (
                    <div key={column.key} className={`min-w-0 ${column.mobileFull ? 'col-span-2' : ''}`}>
                      <dt className="text-xs text-neutral-500">{column.header}</dt>
                      <dd className="mt-0.5 break-words text-sm text-neutral-700">{cell(column, row)}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {actions && (
                <div className="mt-1 flex flex-wrap gap-x-5" onClick={(e) => e.stopPropagation()}>
                  {actions(row)}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}
