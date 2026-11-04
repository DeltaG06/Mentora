import { useRef } from 'react'
import { Button } from '../ui/Button'

/**
 * Spreadsheet-like entry grid (docs/ui-design-system.md §6.3).
 *
 * columns: [{ key, header, type: 'text'|'number', width?, placeholder?,
 *             readOnly?: (row) => node }]
 * rows: array of objects keyed by column key.
 * problems: [{ row, cols: [keys], message }] from validation.
 * Tab moves along a row; Enter moves down the column, adding a row at the end.
 */
export function MarksGrid({ columns, rows, onChange, newRow, problems = [], label }) {
  const table = useRef(null)
  const invalid = new Set(problems.flatMap((p) => p.cols.map((col) => `${p.row}:${col}`)))

  const update = (index, key, value) => onChange(rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)))

  const focusCell = (row, col) => {
    requestAnimationFrame(() => {
      table.current?.querySelector(`[data-row="${row}"][data-col="${col}"]`)?.focus()
    })
  }

  const onKeyDown = (event, index, key) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    if (index === rows.length - 1) onChange([...rows, newRow()])
    focusCell(index + 1, key)
  }

  const remove = (index) => onChange(rows.filter((_, i) => i !== index))

  const input = (row, index, column) => (
    <input
      data-row={index}
      data-col={column.key}
      type={column.type === 'number' ? 'number' : 'text'}
      inputMode={column.type === 'number' ? 'numeric' : undefined}
      min={column.type === 'number' ? 0 : undefined}
      step={column.type === 'number' ? 1 : undefined}
      value={row[column.key]}
      placeholder={column.placeholder}
      maxLength={column.type === 'text' ? 120 : undefined}
      onChange={(e) => update(index, column.key, e.target.value)}
      onKeyDown={(e) => onKeyDown(e, index, column.key)}
      aria-label={`${column.header}, row ${index + 1}`}
      aria-invalid={invalid.has(`${index}:${column.key}`)}
      className={`input ${column.type === 'number' ? 'text-right' : ''} ${invalid.has(`${index}:${column.key}`) ? 'input-invalid' : ''}`}
    />
  )

  const editable = columns.filter((c) => !c.readOnly)
  const readOnly = columns.filter((c) => c.readOnly)

  return (
    <div ref={table}>
      {label && <p className="label">{label}</p>}

      {/* Wide screens: a real grid. */}
      <div className="hidden overflow-x-auto rounded-md border border-neutral-200 md:block">
        <table className="min-w-full border-separate border-spacing-0">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`th ${column.type === 'number' || column.readOnly ? 'text-right' : ''}`}
                  style={column.width ? { width: column.width } : undefined}
                >
                  {column.header}
                </th>
              ))}
              <th className="th" style={{ width: 80 }}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {columns.map((column) =>
                  column.readOnly ? (
                    <td key={column.key} className="td bg-neutral-100 text-right text-neutral-600">
                      {column.readOnly(row)}
                    </td>
                  ) : (
                    <td key={column.key} className="border-b border-neutral-200 p-1.5">
                      {input(row, index, column)}
                    </td>
                  ),
                )}
                <td className="border-b border-neutral-200 px-3 text-right">
                  <Button variant="text" onClick={() => remove(index)} disabled={rows.length === 1}>
                    Remove
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phones: one block per subject. */}
      <div className="space-y-3 md:hidden">
        {rows.map((row, index) => {
          const [first, ...rest] = editable
          return (
            <div key={index} className="border-b border-neutral-200 pb-3">
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-500">{first.header}</span>
                {input(row, index, first)}
              </label>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {rest.map((column) => (
                  <label key={column.key} className="block">
                    <span className="mb-1 block text-xs text-neutral-500">{column.header}</span>
                    {input(row, index, column)}
                  </label>
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between">
                {readOnly.map((column) => (
                  <span key={column.key} className="text-sm text-neutral-600">
                    {column.header}: {column.readOnly(row)}
                  </span>
                ))}
                <Button variant="text" onClick={() => remove(index)} disabled={rows.length === 1} className="ml-auto">
                  Remove
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      {problems.length > 0 && (
        <ul className="mt-2 space-y-0.5" role="alert">
          {problems.map((p, i) => (
            <li key={i} className="text-xs text-red-600">
              {p.message}
            </li>
          ))}
        </ul>
      )}

      <Button variant="text" className="mt-2" onClick={() => onChange([...rows, newRow()])}>
        Add subject
      </Button>
    </div>
  )
}

/** Read-only effective internal score, computed by the server at verification. */
export function effectiveText(subject) {
  if (subject.effective_internal === null || subject.effective_internal === undefined) {
    return <span title="Calculated on verification">—</span>
  }
  const pct = (subject.effective_internal / subject.max_per_test) * 100
  return (
    <span className={pct < 40 ? 'text-red-600' : ''}>
      {subject.effective_internal.toFixed(1)} ({pct.toFixed(0)}%)
    </span>
  )
}
