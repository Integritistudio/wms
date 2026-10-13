import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronRight, RefreshCw } from 'lucide-react'
import {
  DataTable,
  ListToolbar,
  PageHeader,
  StatusBadge,
  StatusTabs,
  type DataTableColumn,
} from '../ui'
import { listReturns, type ReturnRecord } from '../../lib/api'
import { useCompanyPortal } from './CompanyPortalContext'
import ReturnDetailModal from './ReturnDetailModal'

const STATUS_TABS = [
  { id: 'all', label: 'All' },
  { id: 'requested', label: 'Requested' },
  { id: 'authorized', label: 'Authorized' },
  { id: 'in_transit', label: 'In transit' },
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
      setRows(await listReturns({ status: status === 'all' ? undefined : status, q: debouncedQ || undefined }))
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load returns')
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
  }, [status, debouncedQ])

  useEffect(() => {
    if (initialReturnId) setSelectedId(initialReturnId)
  }, [initialReturnId])

  const whName = (id?: string | null) => warehouses.find((w) => w.id === id)?.name || (id ? id.slice(-6) : '—')

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
    <div className="oj-page oj-skel returns-page">
      <PageHeader
        title="Returns"
        description="Authorize RMAs, receive packages, restock inventory, and close refunds."
        count={stats.total}
      />

      <section className="returns-stats" aria-label="Returns snapshot">
        <article className="returns-stat">
          <span className="returns-stat-label">Open</span>
          <strong className="returns-stat-value">{stats.open}</strong>
          <span className="returns-stat-sub">Requested / authorized</span>
        </article>
        <article className="returns-stat">
          <span className="returns-stat-label">In transit</span>
          <strong className="returns-stat-value">{stats.inTransit}</strong>
          <span className="returns-stat-sub">On the way back</span>
        </article>
        <article className="returns-stat">
          <span className="returns-stat-label">At warehouse</span>
          <strong className="returns-stat-value">{stats.received}</strong>
          <span className="returns-stat-sub">Received / inspected</span>
        </article>
        <article className="returns-stat">
          <span className="returns-stat-label">Closed</span>
          <strong className="returns-stat-value">{stats.closed}</strong>
          <span className="returns-stat-sub">Restocked / dispositioned</span>
        </article>
      </section>

      <div className="returns-status-tabs">
        <StatusTabs tabs={STATUS_TABS} activeId={status} onChange={setStatus} />
        <button
          type="button"
          className="orders-refresh-btn"
          onClick={() => void load()}
          disabled={loading}
          aria-label="Refresh returns"
          title="Refresh"
        >
          <RefreshCw size={16} strokeWidth={2.1} className={loading ? 'oj-skel-spin' : undefined} aria-hidden />
        </button>
      </div>

      <ListToolbar
        search={q}
        searchPlaceholder="Search RMA, tracking, reason…"
        onSearchChange={setQ}
        resultCount={rows.length}
        resultLabel="returns"
        onClear={() => {
          setQ('')
          setStatus('all')
        }}
      />

      <div className="returns-table">
        <DataTable
          columns={columns}
          rows={rows}
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
