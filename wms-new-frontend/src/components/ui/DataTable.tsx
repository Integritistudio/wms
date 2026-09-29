import { Fragment, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import EmptyState from './EmptyState'

export type DataTableColumn<T> = {
  key: string
  header: string
  align?: 'left' | 'right'
  className?: string
  sortable?: boolean
  sortValue?: (row: T) => string | number | null | undefined
  render: (row: T) => ReactNode
}

type DataTableProps<T> = {
  columns: DataTableColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string
  emptyTitle?: string
  emptyMessage?: string
  loading?: boolean
  stickyHeader?: boolean
  loadingRows?: number
  onRowClick?: (row: T) => void
  selectedKey?: string | null
  expandedKey?: string | null
  renderExpanded?: (row: T) => ReactNode
  rowClassName?: (row: T) => string | undefined
}

export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyTitle = 'No records',
  emptyMessage,
  loading = false,
  stickyHeader = true,
  loadingRows = 4,
  onRowClick,
  selectedKey,
  expandedKey,
  renderExpanded,
  rowClassName,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const shellClass = stickyHeader ? 'demo-table-shell is-sticky' : 'demo-table-shell'
  const tableClass = stickyHeader ? 'demo-table is-sticky' : 'demo-table'

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows
    const col = columns.find((c) => c.key === sortKey)
    if (!col?.sortable) return rows
    const copy = [...rows]
    copy.sort((a, b) => {
      const av = col.sortValue ? col.sortValue(a) : ''
      const bv = col.sortValue ? col.sortValue(b) : ''
      const aVal = av ?? ''
      const bVal = bv ?? ''
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return copy
  }, [rows, columns, sortKey, sortDir])

  function toggleSort(col: DataTableColumn<T>) {
    if (!col.sortable) return
    if (sortKey === col.key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(col.key)
      setSortDir('asc')
    }
  }

  function onRowKeyDown(e: KeyboardEvent, row: T) {
    if (!onRowClick) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onRowClick(row)
    }
  }

  if (loading) {
    return (
      <div className={shellClass}>
        <table className={tableClass}>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} className={col.align === 'right' ? 'actions' : undefined}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: loadingRows }).map((_, idx) => (
              <tr key={idx} className="demo-skeleton-row">
                {columns.map((col) => (
                  <td key={col.key}>
                    <span className="demo-skeleton" style={{ width: col.align === 'right' ? '4rem' : '70%' }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className={shellClass}>
        <EmptyState title={emptyTitle} message={emptyMessage} />
      </div>
    )
  }

  return (
    <div className={shellClass}>
      <table className={tableClass}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={[col.align === 'right' ? 'actions' : '', col.className, col.sortable ? 'is-sortable' : '']
                  .filter(Boolean)
                  .join(' ') || undefined}
                aria-sort={
                  col.sortable && sortKey === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined
                }
              >
                {col.sortable ? (
                  <button type="button" className="table-sort-btn" onClick={() => toggleSort(col)}>
                    {col.header}
                    {sortKey === col.key ? <span aria-hidden>{sortDir === 'asc' ? ' ↑' : ' ↓'}</span> : null}
                  </button>
                ) : (
                  col.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => {
            const key = rowKey(row)
            const selected = selectedKey === key
            const expanded = expandedKey === key
            return (
              <Fragment key={key}>
                <tr
                  className={
                    [onRowClick ? 'is-clickable' : '', selected ? 'is-selected' : '', rowClassName?.(row)]
                      .filter(Boolean)
                      .join(' ') || undefined
                  }
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={onRowClick ? (e) => onRowKeyDown(e, row) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={[col.align === 'right' ? 'actions' : '', col.className].filter(Boolean).join(' ') || undefined}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
                {expanded && renderExpanded ? (
                  <tr className="demo-table-expand-row">
                    <td colSpan={columns.length}>{renderExpanded(row)}</td>
                  </tr>
                ) : null}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
