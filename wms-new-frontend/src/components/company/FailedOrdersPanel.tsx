import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
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
  bulkFailedOrders,
  listFailedOrders,
  reassignFailedOrder,
  retryFailedOrder,
  skipFailedOrder,
  type FailedOrder,
} from '../../lib/api'
import { useCompanyPortal } from './CompanyPortalContext'

const REASON_OPTIONS = [
  '',
  'HMAC_FAIL',
  'MAPPING_EXCEPTION',
  'SFTP_ERROR',
  'SHOPIFY_ERROR',
  'PRODUCT_NOT_FOUND',
  'ROUTING_NO_MATCH',
  'MODERNWMS_ERROR',
  'UNKNOWN',
]

function formatNextRetry(entry: FailedOrder) {
  if (!entry.autoRetryEnabled || !entry.nextRetryAt) return null
  const when = new Date(entry.nextRetryAt)
  if (Number.isNaN(when.getTime())) return null
  return when.toLocaleString()
}

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
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState('')
  const [selected, setSelected] = useState<string[]>([])

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
        reason: reason || undefined,
      })
      setEntries(result.items || [])
      setTotal(result.total ?? 0)
      if (!resolved) setFailedCount(result.total)
      setSelected([])
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
  }, [debouncedQ, resolved, page, limit, reason])

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

  async function handleBulk(action: 'retry' | 'skip') {
    if (!selected.length) return
    setBusy('bulk')
    try {
      await bulkFailedOrders(action, selected)
      await load()
      await refreshCounts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk action failed')
    }
    setBusy('')
  }

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function toggleAll() {
    if (selected.length === entries.length) {
      setSelected([])
      return
    }
    setSelected(entries.map((e) => e.id))
  }

  const columns: DataTableColumn<FailedOrder>[] = [
    ...(!resolved
      ? [
          {
            key: 'select',
            header: 'Sel',
            render: (entry: FailedOrder) => (
              <input
                type="checkbox"
                aria-label={`Select ${entry.id}`}
                checked={selected.includes(entry.id)}
                onChange={() => toggle(entry.id)}
                onClick={(e) => e.stopPropagation()}
              />
            ),
          } as DataTableColumn<FailedOrder>,
        ]
      : []),
    {
      key: 'reason',
      header: 'Reason',
      render: (entry) => <StatusBadge status={entry.reason || 'UNKNOWN'} />,
    },
    {
      key: 'error',
      header: 'Error',
      className: 'truncate',
      render: (entry) => entry.errorMessage || '—',
    },
    {
      key: 'attempts',
      header: 'Attempts',
      align: 'right',
      className: 'num',
      render: (entry) =>
        entry.maxAttempts ? `${entry.attempts}/${entry.maxAttempts}` : entry.attempts,
    },
    {
      key: 'retry',
      header: 'Auto-retry',
      render: (entry) => {
        if (resolved) return <span className="demo-cell-secondary">—</span>
        const next = formatNextRetry(entry)
        if (!entry.autoRetryEnabled) {
          return <span className="demo-cell-secondary">Off</span>
        }
        return (
          <div>
            <span className="status-badge status-badge-info">Scheduled</span>
            {next ? <div className="demo-cell-secondary">{next}</div> : null}
          </div>
        )
      },
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
              disabled={busy === entry.id || busy === 'bulk'}
              onClick={() => handle(entry.id, async () => { await retryFailedOrder(entry.id) })}
            >
              Retry
            </button>
            <select
              className="demo-input demo-input-fit"
              aria-label="Reassign warehouse"
              disabled={busy === entry.id || busy === 'bulk'}
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
              disabled={busy === entry.id || busy === 'bulk'}
              onClick={() => handle(entry.id, async () => { await skipFailedOrder(entry.id) })}
            >
              Skip
            </button>
          </div>
        ),
    },
  ]

  return (
    <div className="oj-page oj-skel failed-page">
      <PageHeader
        title="Failed orders"
        description="Retry, reassign, or skip items in the dead-letter queue. Auto-retry runs on a backoff schedule for retryable reasons."
        count={total}
      />

      <div className="failed-status-tabs">
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
        <button
          type="button"
          className="orders-refresh-btn"
          onClick={() => void load()}
          disabled={loading}
          aria-label="Refresh failed orders"
          title="Refresh"
        >
          <RefreshCw size={16} strokeWidth={2.1} className={loading ? 'oj-skel-spin' : undefined} aria-hidden />
        </button>
      </div>

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

      <div className="demo-action-group" style={{ marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <label className="demo-cell-secondary">
          Reason{' '}
          <select
            className="demo-input demo-input-fit"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value)
              setPage(1)
            }}
          >
            {REASON_OPTIONS.map((r) => (
              <option key={r || 'all'} value={r}>
                {r || 'All reasons'}
              </option>
            ))}
          </select>
        </label>
        {!resolved ? (
          <button type="button" className="demo-btn demo-btn-sm demo-btn-ghost" onClick={toggleAll}>
            {selected.length === entries.length && entries.length ? 'Clear selection' : 'Select all'}
          </button>
        ) : null}
        {!resolved && selected.length > 0 ? (
          <>
            <button
              type="button"
              className="demo-btn demo-btn-sm"
              disabled={busy === 'bulk'}
              onClick={() => void handleBulk('retry')}
            >
              Retry selected ({selected.length})
            </button>
            <button
              type="button"
              className="demo-btn demo-btn-sm demo-btn-ghost"
              disabled={busy === 'bulk'}
              onClick={() => void handleBulk('skip')}
            >
              Skip selected
            </button>
          </>
        ) : null}
      </div>

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
