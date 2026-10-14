import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Activity, ChevronRight, RefreshCw, RotateCcw } from 'lucide-react'
import {
  DataTable,
  ListToolbar,
  StatusBadge,
  StatusTabs,
  type DataTableColumn,
} from '../ui'
import { listReturns, type ReturnRecord } from '../../lib/api'
import { useCompanyPortal } from './CompanyPortalContext'
import ReturnDetailModal from './ReturnDetailModal'

const STATUS_TABS = [
  { id: 'all', label: 'All' },
  { id: 'authorized', label: 'Authorized' },
  { id: 'in_transit', label: 'In Transit' },
  { id: 'received', label: 'Received' },
  { id: 'restocked', label: 'Restocked' },
  { id: 'refurbished', label: 'Refurbished' },
  { id: 'damaged', label: 'Damaged' },
  { id: 'quarantined', label: 'Quarantined' },
  { id: 'disposed', label: 'Disposed' },
  { id: 'refunded', label: 'Refunded' },
  { id: 'cancelled', label: 'Cancelled' },
]

const OPEN_STATUSES = new Set(['requested', 'authorized', 'in_transit'])
const CLOSED_STATUSES = new Set(['restocked', 'refurbished', 'damaged', 'quarantined', 'disposed', 'refunded', 'cancelled'])

function statusBucket(status: string) {
  return status === 'inspected' ? 'received' : status
}

export default function ReturnsPanel({ initialReturnId }: { initialReturnId?: string }) {
  const { company, setError } = useCompanyPortal()
  const warehouses = company?.warehouses || []

  const [rows, setRows] = useState<ReturnRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('all')
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      setRows(await listReturns({ q: debouncedQ || undefined }))
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to Open Returns')
    }
    setLoading(false)
  }

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q.trim()), 300)
    return () => window.clearTimeout(t)
  }, [q])

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ])

  useEffect(() => {
    if (initialReturnId) setSelectedId(initialReturnId)
  }, [initialReturnId])

  const whName = (id?: string | null) => warehouses.find((w) => w.id === id)?.name || (id ? id.slice(-6) : '—')

  const filteredRows = useMemo(() => {
    if (status === 'all') return rows
    return rows.filter((row) => statusBucket(row.status) === status)
  }, [rows, status])

  const statusTabs = useMemo(() => {
    const counts: Record<string, number> = { all: rows.length }
    for (const row of rows) {
      const key = statusBucket(row.status)
      counts[key] = (counts[key] || 0) + 1
    }
    return STATUS_TABS.map((tab) => ({
      ...tab,
      count: counts[tab.id] || 0,
    }))
  }, [rows])

  const columns: DataTableColumn<ReturnRecord>[] = useMemo(
    () => [
      {
        key: 'rma',
        header: 'RMA',
        className: 'returns-col-rma',
        render: (row) => (
          <div className="ol-order">
            <div className="ol-order-id">
              <span className="demo-cell-primary">{row.rmaNumber}</span>
            </div>
            {row.source === 'shipment_rts' ? (
              <div className="demo-cell-secondary">From shipment RTS</div>
            ) : null}
          </div>
        ),
      },
      {
        key: 'order',
        header: 'Order',
        className: 'returns-col-order',
        render: (row) => (
          <Link
            to="/account/orders/$orderId"
            params={{ orderId: row.orderId }}
            className="demo-link text-sm"
            onClick={(e) => e.stopPropagation()}
          >
            View order
          </Link>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        className: 'returns-col-status',
        render: (row) => <StatusBadge status={row.status} />,
      },
      {
        key: 'warehouse',
        header: 'Warehouse',
        className: 'returns-col-warehouse',
        render: (row) => (
          <span className="ol-wh" title={whName(row.warehouseId)}>
            {whName(row.warehouseId)}
          </span>
        ),
      },
      {
        key: 'created',
        header: 'Created',
        className: 'returns-col-created',
        render: (row) => (row.createdAt ? new Date(row.createdAt).toLocaleString() : '—'),
      },
      {
        key: 'actions',
        header: '',
        align: 'right',
        className: 'returns-col-actions',
        render: (row) => (
          <button
            type="button"
            className="ol-open"
            aria-label={`Manage return ${row.rmaNumber}`}
            onClick={(e) => {
              e.stopPropagation()
              setSelectedId(row.id)
            }}
          >
            <span>Manage</span>
            <ChevronRight size={14} strokeWidth={2.4} aria-hidden />
          </button>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [warehouses],
  )

  const stats = useMemo(() => {
    const open = rows.filter((r) => OPEN_STATUSES.has(r.status)).length
    const inTransit = rows.filter((r) => r.status === 'in_transit').length
    const received = rows.filter((r) => r.status === 'received' || r.status === 'inspected').length
    const closed = rows.filter((r) => CLOSED_STATUSES.has(r.status)).length
    return { open, inTransit, received, closed, total: rows.length }
  }, [rows])

  return (
    <div className="oj-page oj-skel returns-page analytics-anime">
      <header className="analytics-anime-hero returns-hero">
        <div className="analytics-anime-hero-mist" aria-hidden />
        <div className="analytics-anime-hero-orb analytics-anime-hero-orb--a" aria-hidden />
        <div className="analytics-anime-hero-orb analytics-anime-hero-orb--b" aria-hidden />

        <div className="analytics-anime-hero-copy">
          <div className="analytics-anime-crumb">
            <RotateCcw size={14} strokeWidth={2} aria-hidden />
            <span>Company</span>
            <span>/</span>
            <strong>Returns</strong>
          </div>
          <div className="analytics-anime-title-row">
            <h1>
              Returns in.
              <em> Stock out.</em>
            </h1>
            <span className="analytics-anime-pill">
              <Activity size={12} strokeWidth={2.4} aria-hidden />
              {stats.total} returns
            </span>
          </div>
          <p>Authorize RMAs, receive packages, restock inventory, and close refunds.</p>
        </div>
      </header>

      <section className="returns-stats" aria-label="Returns snapshot">
        <article className="returns-stat">
          <span className="returns-stat-label">Open</span>
          <strong className="returns-stat-value">{stats.open}</strong>
          <span className="returns-stat-sub">Authorized / In Transit</span>
        </article>
        <article className="returns-stat">
          <span className="returns-stat-label">In Transit</span>
          <strong className="returns-stat-value">{stats.inTransit}</strong>
          <span className="returns-stat-sub">On the Way Back</span>
        </article>
        <article className="returns-stat">
          <span className="returns-stat-label">At Warehouse</span>
          <strong className="returns-stat-value">{stats.received}</strong>
          <span className="returns-stat-sub">Received / Inspected</span>
        </article>
        <article className="returns-stat">
          <span className="returns-stat-label">Closed</span>
          <strong className="returns-stat-value">{stats.closed}</strong>
          <span className="returns-stat-sub">Restocked / Disposed</span>
        </article>
      </section>

      <div className="returns-status-tabs">
        <StatusTabs tabs={statusTabs} activeId={status} onChange={setStatus} />
        <button
          type="button"
          className="orders-refresh-btn"
          onClick={() => void load()}
          disabled={loading}
          aria-label="Refresh Returns"
          title="Refresh"
        >
          <RefreshCw size={16} strokeWidth={2.1} className={loading ? 'oj-skel-spin' : undefined} aria-hidden />
        </button>
      </div>

      <ListToolbar
        search={q}
        searchPlaceholder="Search RMA, tracking, reason…"
        onSearchChange={setQ}
        resultCount={filteredRows.length}
        resultLabel="Returns"
        onClear={() => {
          setQ('')
          setStatus('all')
        }}
      />

      <div className="returns-table">
        <DataTable
          columns={columns}
          rows={filteredRows}
          rowKey={(row) => row.id}
          loading={loading}
          emptyTitle="No returns yet"
          emptyMessage="Create a return from an order detail page, or mark a shipment as Returned."
          onRowClick={(row) => setSelectedId(row.id)}
        />
      </div>

      <ReturnDetailModal
        returnId={selectedId}
        onClose={() => setSelectedId(null)}
        onUpdated={() => void load()}
      />
    </div>
  )
}
