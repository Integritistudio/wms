import { useEffect, useState } from 'react'
import {
  DataTable,
  ListToolbar,
  PageHeader,
  Pagination,
  StatusBadge,
  StatusTabs,
  type DataTableColumn,
} from '../ui'
import {
  listFailedOrders,
  reassignFailedOrder,
  retryFailedOrder,
  skipFailedOrder,
  type FailedOrder,
} from '../../lib/api'
import { useCompanyPortal } from './CompanyPortalContext'

export default function FailedOrdersPanel() {
  const { company, setError, setFailedCount, refreshCounts } = useCompanyPortal()
  const warehouses = company?.warehouses || []

  const [entries, setEntries] = useState<FailedOrder[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(25)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [resolved, setResolved] = useState(false)
  const [busy, setBusy] = useState('')

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q.trim()), 300)
    return () => window.clearTimeout(t)
  }, [q])

  async function load() {
    setLoading(true)
    try {
      const result = await listFailedOrders({
        resolved,
        q: debouncedQ || undefined,
        page,
        limit,
      })
      setEntries(result.items || [])
      setTotal(result.total ?? 0)
      if (!resolved) setFailedCount(result.total)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load failed orders')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ, resolved, page, limit])

  async function handle(id: string, action: () => Promise<void>) {
    setBusy(id)
    try {
      await action()
      await load()
      await refreshCounts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    }
    setBusy('')
  }

  const columns: DataTableColumn<FailedOrder>[] = [
    {
      key: 'reason',
      header: 'Reason',
      render: (entry) => <StatusBadge status={entry.reason || entry.reason} />,
    },
    {
      key: 'error',
      header: 'Error',
      className: 'truncate',
      render: (entry) => entry.errorMessage || entry.errorMessage || '—',
    },
    {
      key: 'attempts',
      header: 'Attempts',
      align: 'right',
      className: 'num',
      render: (entry) => entry.attempts,
    },
    {
      key: 'created',
      header: 'Created',
      sortable: true,
      sortValue: (entry) => entry.createdAt,
      render: (entry) => (
        <div>
          <div className="demo-cell-primary">{new Date(entry.createdAt).toLocaleDateString()}</div>
          <div className="demo-cell-secondary">{new Date(entry.createdAt).toLocaleTimeString()}</div>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (entry) =>
        resolved ? (
          <span className="demo-cell-secondary">{entry.resolvedBy || 'Resolved'}</span>
        ) : (
          <div className="demo-action-group" onClick={(e) => e.stopPropagation()}>
            <button
              className="demo-btn demo-btn-sm"
              disabled={busy === entry.id}
              onClick={() => handle(entry.id, async () => { await retryFailedOrder(entry.id) })}
            >
              Retry
            </button>
            <select
              className="demo-input demo-input-fit"
              aria-label="Reassign warehouse"
              disabled={busy === entry.id}
              onChange={(e) => {
                if (e.target.value) handle(entry.id, async () => { await reassignFailedOrder(entry.id, e.target.value) })
              }}
              defaultValue=""
            >
              <option value="" disabled>
                Reassign…
              </option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <button
              className="demo-btn demo-btn-sm demo-btn-ghost"
              disabled={busy === entry.id}
              onClick={() => handle(entry.id, async () => { await skipFailedOrder(entry.id) })}
            >
              Skip
            </button>
          </div>
        ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Failed orders"
        description="Retry, reassign, or skip items in the dead-letter queue."
        count={total}
      />

      <StatusTabs
        activeId={resolved ? 'resolved' : 'open'}
        onChange={(id) => {
          setResolved(id === 'resolved')
          setPage(1)
        }}
        tabs={[
          { id: 'open', label: 'Open' },
          { id: 'resolved', label: 'Resolved' },
        ]}
      />

      <ListToolbar
        search={q}
        searchPlaceholder="Search reason or error…"
        onSearchChange={(value) => {
          setQ(value)
          setPage(1)
        }}
        resultCount={total}
        resultLabel="entries"
        onClear={() => {
          setQ('')
          setPage(1)
        }}
      />

      <DataTable
        columns={columns}
        rows={entries}
        rowKey={(entry) => entry.id}
        loading={loading}
        emptyTitle={resolved ? 'No resolved entries' : 'All clear'}
        emptyMessage={resolved ? 'Resolved failures will appear here.' : 'No failed orders in the queue.'}
      />

      <Pagination page={page} limit={limit} total={total} onPageChange={setPage} onLimitChange={(n) => { setLimit(n); setPage(1) }} />
    </div>
  )
}
