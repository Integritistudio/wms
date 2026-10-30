import PageBanner from '../ui/PageBanner'
import { useEffect, useRef, useState } from 'react'
import { Building2, CheckCircle2, ChevronDown, ChevronRight, CircleAlert, ListChecks, RefreshCw, RotateCcw, Warehouse, X } from 'lucide-react'
import {
  Alert,
  Button,
  DataTable,
  Modal,
  ListToolbar,
  Pagination,
  StatusBadge,
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
import '../../styles/failed-orders.css'

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
  const { company, setError, setNotice, setFailedCount, refreshCounts } = useCompanyPortal()
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
  const [counts, setCounts] = useState<{ open: number; closed: number } | null>(null)
  const [loadError, setLoadError] = useState('')
  const [skipIds, setSkipIds] = useState<string[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [reassigning, setReassigning] = useState<FailedOrder | null>(null)
  const [targetWarehouse, setTargetWarehouse] = useState('')
  const requestId = useRef(0)
  const actionLock = useRef(false)

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q.trim()), 300)
    return () => window.clearTimeout(t)
  }, [q])

  async function load() {
    const currentRequest = ++requestId.current
    setLoading(true)
    setSelected([])
    try {
      const [result, openResult, closedResult] = await Promise.all([listFailedOrders({
        resolved,
        q: debouncedQ || undefined,
        page,
        limit,
        reason: reason || undefined,
      }), listFailedOrders({ resolved: false, page: 1, limit: 1 }), listFailedOrders({ resolved: true, page: 1, limit: 1 })])
      if (currentRequest !== requestId.current) return
      setCounts({ open: openResult.total ?? 0, closed: closedResult.total ?? 0 })
      setFailedCount(openResult.total ?? 0)
      setLoadError('')
      const lastPage = Math.max(1, Math.ceil((result.total ?? 0) / limit))
      if (page > lastPage) { setPage(lastPage); return }
      setEntries(result.items || [])
      setTotal(result.total ?? 0)
      setSelected([])
    } catch (err) {
      if (currentRequest === requestId.current) setLoadError(err instanceof Error ? err.message : 'Unable to load failed orders')
    } finally {
      if (currentRequest === requestId.current) setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    return () => { requestId.current += 1 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ, resolved, page, limit, reason])

  async function handle(id: string, action: () => Promise<void>) {
    if (actionLock.current || loading) return
    actionLock.current = true
    setBusy(id)
    try {
      await action()
      setSkipIds([])
      setReassigning(null)
      setNotice('Action completed. The failure queue has been updated.')
      await load()
      await refreshCounts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    }
    actionLock.current = false
    setBusy('')
  }

  async function handleBulk(action: 'retry' | 'skip') {
    if (!selected.length || actionLock.current || loading) return
    actionLock.current = true
    setBusy('bulk')
    try {
      const result = await bulkFailedOrders(action, selected)
      const failures = result.results.filter((item) => !item.ok)
      if (failures.length) setError(`${failures.length} of ${result.results.length} actions failed. ${failures[0].message || 'Please retry these entries.'}`)
      else setNotice(`${result.results.length} ${result.results.length === 1 ? 'entry' : 'entries'} ${action === 'retry' ? 'queued for retry' : 'closed'}.`)
      setSkipIds([])
      await load()
      await refreshCounts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk action failed')
    }
    actionLock.current = false
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
            header: '',
            className: 'failed-select-cell',
            render: (entry: FailedOrder) => (
              <input
                type="checkbox"
                aria-label={`Select ${entry.id}`}
                checked={selected.includes(entry.id)}
                disabled={Boolean(busy) || loading}
                onChange={() => toggle(entry.id)}
                onClick={(e) => e.stopPropagation()}
              />
            ),
          } as DataTableColumn<FailedOrder>,
        ]
      : []),
    {
      key: 'order',
      header: 'Order / warehouse',
      className: 'failed-order-cell',
      render: (entry) => <div>
        <strong className="demo-cell-primary" title={entry.orderId || entry.id}>{entry.orderId ? `Ref ${entry.orderId.slice(-8).toUpperCase()}` : 'Unlinked failure'}</strong>
        <span className="demo-cell-secondary">{warehouses.find((warehouse) => warehouse.id === entry.warehouseId)?.name || 'No warehouse assigned'}</span>
      </div>,
    },
    {
      key: 'error',
      header: 'Failure details',
      className: 'failed-error-cell',
      render: (entry) => <div>
        <StatusBadge status={entry.reason || 'UNKNOWN'} variant={resolved ? 'neutral' : 'danger'} />
        <p className="failed-error-preview">{entry.errorMessage || 'No error details available'}</p>
        <button type="button" className="failed-details-toggle" aria-expanded={expandedId === entry.id} aria-controls={`failure-details-${entry.id}`} onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}>
          {expandedId === entry.id ? <ChevronDown size={13} aria-hidden /> : <ChevronRight size={13} aria-hidden />} {expandedId === entry.id ? 'Hide details' : 'View details'}
        </button>
      </div>,
    },
    {
      key: 'retry',
      header: 'Processing',
      className: 'failed-retry-cell',
      render: (entry) => {
        const next = formatNextRetry(entry)
        return <div className="failed-processing">
          <span className="failed-attempt-count">{entry.attempts}{entry.maxAttempts ? ` / ${entry.maxAttempts}` : ''} attempts</span>
          {resolved ? <span className="demo-cell-secondary">Processing ended</span> : <>
            <span className={`failed-retry-label${entry.autoRetryEnabled ? ' is-enabled' : ''}`}>{entry.autoRetryEnabled ? 'Auto-retry enabled' : 'Manual retry'}</span>
            {next ? <span className="demo-cell-secondary">Next: {next}</span> : null}
          </>}
        </div>
      },
    },
    {
      key: 'created',
      header: 'Created',
      className: 'failed-created-cell',
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
      className: 'failed-actions-cell',
      align: 'right',
      render: (entry) =>
        resolved ? (
          <div><StatusBadge status={entry.resolution || 'Resolved'} variant="success" /><span className="demo-cell-secondary failed-resolved-by">{entry.resolvedBy || 'System'}</span></div>
        ) : (
          <div className="failed-row-actions" onClick={(e) => e.stopPropagation()}>
            <button
              className="demo-btn demo-btn-sm"
              disabled={Boolean(busy) || loading}
              onClick={() => handle(entry.id, async () => { await retryFailedOrder(entry.id) })}
            >
              <RotateCcw size={13} className={busy === entry.id ? 'failed-spin' : undefined} aria-hidden /> Retry
            </button>
            <button type="button" className="failed-icon-action" aria-label={`Reassign failure ${entry.id} to a warehouse`} title="Reassign warehouse" disabled={Boolean(busy) || loading} onClick={() => { setReassigning(entry); setTargetWarehouse(entry.warehouseId || '') }}><Warehouse size={15} aria-hidden /></button>
            <button
              className="failed-icon-action"
              aria-label={`Close failure ${entry.id}`}
              title="Close failure"
              disabled={Boolean(busy) || loading}
              onClick={() => setSkipIds([entry.id])}
            >
              <X size={15} aria-hidden />
            </button>
          </div>
        ),
    },
  ]

  return (
    <div className="failed-page">
      <PageBanner variant="orders">
        <div className="failed-hero-top">
          <div className="failed-hero-copy">
            <nav className="failed-breadcrumb" aria-label="Breadcrumb"><Building2 size={13} aria-hidden /><span>Company</span><ChevronRight size={12} aria-hidden /><strong>Failed orders</strong></nav>
            <h1><span className="failed-title-icon"><ListChecks size={23} aria-hidden /></span>Failed orders<span>.</span></h1>
            <p>Resolve exceptions and get orders moving again. Review the cause, retry processing, or assign a warehouse.</p>

          </div>
          <div className="failed-hero-metrics" role="group" aria-label="Failure queue totals">
            <div className="failed-hero-metric"><span className="failed-metric-icon is-open"><CircleAlert size={18} aria-hidden /></span><div><strong>{counts ? counts.open.toLocaleString() : '\u2014'}</strong><span>Open</span><small>Orders needing attention</small></div></div>
            <div className="failed-hero-metric"><span className="failed-metric-icon is-closed"><CheckCircle2 size={18} aria-hidden /></span><div><strong>{counts ? counts.closed.toLocaleString() : '\u2014'}</strong><span>Closed</span><small>Resolved or skipped</small></div></div>
          </div>
        </div>
      </PageBanner>

      <div className="failed-view-controls">
        <div className="failed-pills" role="group" aria-label="Failure status">
              <button type="button" className={`failed-status-pill${!resolved ? ' is-active' : ''}`} aria-pressed={!resolved} disabled={Boolean(busy)} onClick={() => { setResolved(false); setSelected([]); setPage(1) }}><CircleAlert size={15} aria-hidden /><span>Open</span><strong>{counts ? counts.open.toLocaleString() : '\u2014'}</strong></button>
              <button type="button" className={`failed-status-pill${resolved ? ' is-active' : ''}`} aria-pressed={resolved} disabled={Boolean(busy)} onClick={() => { setResolved(true); setSelected([]); setPage(1) }}><CheckCircle2 size={15} aria-hidden /><span>Closed</span><strong>{counts ? counts.closed.toLocaleString() : '\u2014'}</strong></button>
            </div>
        <Button variant="secondary" className="failed-refresh" onClick={() => void load()} disabled={loading || Boolean(busy)}>
            <RefreshCw size={15} className={loading ? 'failed-spin' : undefined} aria-hidden />
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>
      </div>

      <section className="failed-workspace" aria-label={resolved ? 'Closed failures' : 'Open failures'}>
        <div className="failed-workspace-head">
          <div><h2>{resolved ? 'Closed failures' : 'Open failures'} <span>{total.toLocaleString()}</span></h2><p>{resolved ? 'Review the resolution history for processed exceptions.' : 'Inspect an error and choose the next step for each entry.'}</p></div>
          <span className="failed-view-label">{resolved ? 'Resolution history' : 'Action queue'}</span>
        </div>
      <ListToolbar
        search={q}
        searchPlaceholder="Search reason or error…"
        onSearchChange={(value) => {
          setQ(value)
          setPage(1)
        }}
        filters={[{
          key: 'reason', label: 'Failure reason', value: reason,
          options: REASON_OPTIONS.map((value) => ({ value, label: value ? value.replace(/_/g, ' ') : 'All reasons' })),
          onChange: (value) => { setReason(value); setPage(1) },
        }]}
        onClear={() => {
          setQ('')
          setReason('')
          setPage(1)
        }}
      />

      {!resolved && entries.length > 0 && !loadError ? <div className="failed-bulk-bar" aria-live="polite">
        <span className="demo-cell-secondary">{selected.length ? `${selected.length} selected on this page` : resolved ? 'Previously resolved failures' : 'Select entries to retry or close in bulk'}</span>
        {!resolved ? (
          <button type="button" className="demo-btn demo-btn-sm demo-btn-ghost" disabled={loading || Boolean(busy) || !entries.length} onClick={toggleAll}>
            {selected.length === entries.length && entries.length ? 'Clear selection' : 'Select all'}
          </button>
        ) : null}
        {!resolved && selected.length > 0 ? (
          <>
            <button
              type="button"
              className="demo-btn demo-btn-sm"
              disabled={Boolean(busy) || loading}
              onClick={() => void handleBulk('retry')}
            >
              Retry selected ({selected.length})
            </button>
            <button
              type="button"
              className="demo-btn demo-btn-sm demo-btn-ghost"
              disabled={Boolean(busy) || loading}
              onClick={() => setSkipIds([...selected])}
            >
              Close selected
            </button>
          </>
        ) : null}
      </div> : null}

      {loadError ? <div className="failed-load-error"><Alert tone="danger" title="Unable to load failures" actions={<Button variant="secondary" disabled={loading} onClick={() => void load()}>Try again</Button>}>{loadError}</Alert></div> : <DataTable
        columns={columns}
        rows={entries}
        expandedKey={expandedId}
        renderExpanded={(entry) => <div className="failed-expanded" id={`failure-details-${entry.id}`}><div><strong>Failure details</strong><span>Entry {entry.id}</span></div><pre>{entry.errorMessage || 'No error details available'}</pre></div>}
        rowKey={(entry) => entry.id}
        loading={loading}
        emptyTitle={q.trim() || reason ? 'No matching failures' : resolved ? 'No closed entries' : 'All clear'}
        emptyMessage={q.trim() || reason ? 'Try another search or clear the filters.' : resolved ? 'Resolved failures will appear here.' : 'No failed orders in the queue.'}
      />}

      <Pagination page={page} limit={limit} total={total} onPageChange={(next) => { if (!busy) setPage(next) }} onLimitChange={(n) => { if (!busy) { setLimit(n); setPage(1) } }} />
      </section>
      <Modal open={Boolean(reassigning)} title="Reassign warehouse" description="Choose the warehouse that should process this order." onClose={() => { if (!busy) setReassigning(null) }} className="failed-close-modal">
        <form className="failed-close-body" onSubmit={(event) => { event.preventDefault(); if (reassigning && targetWarehouse) void handle(reassigning.id, async () => { await reassignFailedOrder(reassigning.id, targetWarehouse) }) }}>
          <label className="failed-reassign-label">Warehouse<select className="demo-input" required value={targetWarehouse} disabled={Boolean(busy)} onChange={(event) => setTargetWarehouse(event.target.value)}><option value="">Select a warehouse</option>{warehouses.filter((warehouse) => warehouse.isActive).map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
          <div className="failed-close-actions"><Button variant="secondary" disabled={Boolean(busy)} onClick={() => setReassigning(null)}>Cancel</Button><Button type="submit" disabled={Boolean(busy) || !targetWarehouse}>{busy ? 'Assigning...' : 'Assign warehouse'}</Button></div>
        </form>
      </Modal>
      <Modal open={skipIds.length > 0} title="Close failure entries?" description="Closing skips further processing of these failure entries." onClose={() => { if (!busy) setSkipIds([]) }} className="failed-close-modal">
        <div className="failed-close-body">
          <p>{skipIds.length} {skipIds.length === 1 ? 'entry will' : 'entries will'} move to Closed and stop retrying. This does not cancel or fulfill the Shopify order.</p>
          <div className="failed-close-actions">
            <Button variant="secondary" disabled={Boolean(busy)} onClick={() => setSkipIds([])}>Keep open</Button>
            <Button variant="danger" disabled={Boolean(busy)} onClick={() => skipIds.length === 1 ? void handle(skipIds[0], async () => { await skipFailedOrder(skipIds[0]) }) : void handleBulk('skip')}>{busy ? 'Closing...' : 'Close entries'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
