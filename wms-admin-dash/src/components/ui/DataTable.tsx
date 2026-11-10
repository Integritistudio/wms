import { Fragment, useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import Pagination from './Pagination'
import EmptyState from './EmptyState'
import BrandLoader from '../BrandLoader'

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
  onRowClick?: (row: T) => void
  selectedKey?: string | null
  expandedKey?: string | null
  renderExpanded?: (row: T) => ReactNode
  rowClassName?: (row: T) => string | undefined
  pagination?: { page: number; limit: number }
  serverSortKeys?: string[]
  onSortChange?: (key: string, direction: 'asc' | 'desc') => void
  clientPageSize?: number
}

export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyTitle = 'No records',
  emptyMessage,
  loading = false,
  stickyHeader = true,
  onRowClick,
  selectedKey,
  expandedKey,
  renderExpanded,
  rowClassName,
  pagination,
  clientPageSize,
  serverSortKeys,
  onSortChange,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(clientPageSize ?? 10)
  useEffect(() => { setPage(1) }, [rows, sortKey, sortDir])
  const clientPage = Math.min(page, Math.max(1, Math.ceil(rows.length / limit)))
  const paging = pagination ?? (clientPageSize ? { page: clientPage, limit } : undefined)

  const shellClass = stickyHeader ? 'demo-table-shell is-sticky' : 'demo-table-shell'
  const tableClass = stickyHeader ? 'demo-table is-sticky' : 'demo-table'

  const sortedRows = useMemo(() => {
    if (!sortKey || serverSortKeys?.includes(sortKey)) return rows
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
  }, [rows, columns, sortKey, sortDir, serverSortKeys])

  function toggleSort(col: DataTableColumn<T>) {
    if (!col.sortable) return
    const direction = sortKey === col.key && sortDir === 'asc' ? 'desc' : 'asc'
    setSortKey(col.key)
    setSortDir(direction)
    onSortChange?.(col.key, direction)
  }

  function onRowKeyDown(e: KeyboardEvent, row: T) {
    if (!onRowClick) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onRowClick(row)
    }
  }

  if (loading) {
    return <div className={shellClass} aria-busy="true"><BrandLoader label="Loading records..." /></div>
  }

  if (rows.length === 0) {
    return (
      <div className={shellClass}>
        <EmptyState title={emptyTitle} message={emptyMessage} />
      </div>
    )
  }

  return (
    <>
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
          {(paging ? sortedRows.slice((paging.page - 1) * paging.limit, paging.page * paging.limit) : sortedRows).map((row) => {
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
    {clientPageSize && !pagination ? <Pagination page={clientPage} limit={limit} total={rows.length} onPageChange={setPage} onLimitChange={(next) => { setLimit(next); setPage(1) }} limitOptions={[10, 25, 50, 100]} /> : null}
    </>
  )
}
