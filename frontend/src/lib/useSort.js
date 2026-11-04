import { useMemo, useState } from 'react'

/**
 * Client-side sorting for DataTable. `columns` provide `sort(a, b)`
 * comparators; `initial` is { key, dir } or null for the natural order.
 */
export function useSort(rows, columns, initial = null) {
  const [sort, setSort] = useState(initial)

  const sorted = useMemo(() => {
    if (!sort) return rows
    const column = columns.find((c) => c.key === sort.key)
    if (!column?.sort) return rows
    const list = [...rows].sort(column.sort)
    return sort.dir === 'desc' ? list.reverse() : list
  }, [rows, columns, sort])

  const onSort = (key) =>
    setSort((current) =>
      current?.key === key ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' },
    )

  return { rows: sorted, sort, onSort }
}
