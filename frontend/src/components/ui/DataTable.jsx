/**
 * A table on wide screens and a stacked card list on phones.
 *
 * columns: [{ key, header, render?(row), className?, mobile?: false }]
 * `mobile: false` hides a column in the card view (e.g. an actions column
 * that is rendered separately through `mobileActions`); `mobileFull: true`
 * gives a column the full card width.
 */
export function DataTable({ columns, rows, rowKey = (row) => row.id, onRowClick, mobileTitle, mobileActions }) {
  const cell = (column, row) => (column.render ? column.render(row) : row[column.key])

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              {columns.map((column) => (
                <th key={column.key} scope="col" className={`table-head ${column.className || ''}`}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={onRowClick ? 'cursor-pointer hover:bg-slate-50' : undefined}
              >
                {columns.map((column) => (
                  <td key={column.key} className={`table-cell ${column.className || ''}`}>
                    {cell(column, row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-slate-100 md:hidden">
        {rows.map((row) => {
          const visible = columns.filter((column) => column.mobile !== false)
          const title = mobileTitle ? mobileTitle(row) : visible[0] && cell(visible[0], row)
          const fields = mobileTitle ? visible : visible.slice(1)
          return (
            <li key={rowKey(row)} className="px-4 py-3.5">
              <div
                role={onRowClick ? 'button' : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (event) => {
                        if (event.key === 'Enter') onRowClick(row)
                      }
                    : undefined
                }
                className={onRowClick ? 'cursor-pointer' : undefined}
              >
                <div className="text-sm font-medium text-slate-900">{title}</div>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
                  {fields.map((column) => (
                    <div key={column.key} className={`min-w-0 ${column.mobileFull ? 'col-span-2' : ''}`}>
                      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                        {column.header}
                      </dt>
                      <dd className="mt-0.5 break-words text-sm text-slate-700">{cell(column, row)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              {mobileActions && <div className="mt-3 flex flex-wrap gap-2">{mobileActions(row)}</div>}
            </li>
          )
        })}
      </ul>
    </>
  )
}
