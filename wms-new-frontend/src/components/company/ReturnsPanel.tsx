import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronRight, RefreshCw } from 'lucide-react'
import {
  DataTable,
  Drawer,
  FormField,
  ListToolbar,
  PageHeader,
  StatusBadge,
  StatusTabs,
  type DataTableColumn,
} from '../ui'
import {
  getReturn,
  listReturns,
  receiveReturn,
  restockReturn,
  RETURN_STATUS_ACTIONS,
  updateReturnStatus,
  type ReturnRecord,
} from '../../lib/api'
import { useCompanyPortal } from './CompanyPortalContext'

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

const DISPOSITION_COMPLETE_LABEL: Record<string, string> = {
  restock: 'Restock inventory',
  refurbish: 'Mark refurbished',
  damaged: 'Mark damaged',
  quarantine: 'Mark quarantined',
  dispose: 'Mark disposed',
}

export default function ReturnsPanel({ initialReturnId }: { initialReturnId?: string }) {
  const { company, setError, setNotice } = useCompanyPortal()
  const warehouses = company?.warehouses || []

  const [rows, setRows] = useState<ReturnRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('all')
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<{
    return: ReturnRecord
    order: { id: string; orderNumber: string } | null
    allowedNext: string[]
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [disposition, setDisposition] = useState('restock')

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
    if (initialReturnId) void openDetail(initialReturnId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialReturnId])

  async function openDetail(id: string) {
    setSelectedId(id)
    try {
      const data = await getReturn(id)
      setDetail(data)
      setWarehouseId(data.return.warehouseId || '')
      setDisposition(data.return.disposition || 'restock')
      setNote('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load return')
      setDetail(null)
    }
  }

  async function runAction(action: string) {
    if (!selectedId) return
    setBusy(true)
    try {
      let result
      if (action === 'received') {
        result = await receiveReturn(selectedId, {
          note: note || 'Received at warehouse',
          warehouseId: warehouseId || null,
        })
      } else if (action === 'restocked' || action === 'apply_disposition') {
        result = await restockReturn(selectedId, {
          note: note || undefined,
          warehouseId: warehouseId || null,
          disposition,
        })
      } else {
        result = await updateReturnStatus(selectedId, {
          status: action,
          note: note || undefined,
          warehouseId: warehouseId || null,
          disposition:
            action === 'inspected' ||
            action === 'scrapped' ||
            action === 'restocked' ||
            action === 'refurbished' ||
            action === 'damaged' ||
            action === 'quarantined' ||
            action === 'disposed'
              ? disposition
              : undefined,
        })
      }
      setDetail(result)
      setNotice(`Return marked ${String(result?.return?.status || action).replace(/_/g, ' ')}`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    }
    setBusy(false)
  }

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
              void openDetail(row.id)
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

  const allowedLabels = RETURN_STATUS_ACTIONS.filter((a) => detail?.allowedNext.includes(a.value))

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
          onRowClick={(row) => void openDetail(row.id)}
        />
      </div>

      <Drawer
        open={Boolean(selectedId && detail)}
        onClose={() => {
          setSelectedId(null)
          setDetail(null)
        }}
        title={detail?.return.rmaNumber || 'Return'}
        subtitle={detail?.return.reason || 'Return workflow'}
      >
        {detail ? (
          <div className="oj-page-drawer">
            <div className="oj-skel-card">
              <div className="returns-drawer-head">
                <StatusBadge status={detail.return.status} />
                {detail.order ? (
                  <Link to="/account/orders/$orderId" params={{ orderId: detail.order.id }} className="oj-live-meta-link">
                    Order {detail.order.orderNumber}
                  </Link>
                ) : null}
                <span className="returns-drawer-source">
                  {detail.return.source === 'shipment_rts' ? 'From shipment RTS' : 'Manual RMA'}
                </span>
              </div>
            </div>

            <section className="oj-skel-card">
              <header className="oj-skel-card-head">
                <span className="material-symbols-outlined oj-skel-icon" aria-hidden>inventory_2</span>
                <span>Lines</span>
              </header>
              <table className="demo-table w-full text-sm">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Title</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Received</th>
                    <th className="text-right">Restocked</th>
                  </tr>
                </thead>
                <tbody>
                  {(detail.return.lines || []).map((line, idx) => (
                    <tr key={`${line.sku}-${idx}`}>
                      <td className="demo-cell-primary">{line.sku || '—'}</td>
                      <td>{line.title || '—'}</td>
                      <td className="text-right num">{line.quantity}</td>
                      <td className="text-right num">{line.receivedQty || 0}</td>
                      <td className="text-right num">{line.restockedQty || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="oj-skel-card">
              <header className="oj-skel-card-head">
                <span className="material-symbols-outlined oj-skel-icon" aria-hidden>tune</span>
                <span>Actions</span>
              </header>
              <div className="oj-skel-fields">
                <FormField label="Receive / restock warehouse">
                  <select className="demo-input w-full" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                    <option value="">Select warehouse</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </FormField>

                <FormField label="Disposition">
                  <select className="demo-input w-full" value={disposition} onChange={(e) => setDisposition(e.target.value)}>
                    <option value="restock">Restock</option>
                    <option value="refurbish">Refurbish</option>
                    <option value="damaged">Damaged</option>
                    <option value="quarantine">Quarantine</option>
                    <option value="dispose">Dispose</option>
                  </select>
                </FormField>

                <FormField label="Note">
                  <input className="demo-input w-full" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note" />
                </FormField>
              </div>

              <div className="returns-drawer-actions">
                {allowedLabels.map((action) => (
                  <button
                    key={action.value}
                    type="button"
                    className="oj-skel-chip oj-live-chip"
                    disabled={busy}
                    onClick={() => void runAction(action.value)}
                  >
                    {action.label}
                  </button>
                ))}
                {['authorized', 'in_transit', 'received', 'inspected'].includes(detail.return.status) ? (
                  <button
                    type="button"
                    className="oj-skel-chip oj-live-chip is-accent"
                    disabled={busy || (disposition === 'restock' && !warehouseId)}
                    onClick={() => void runAction('apply_disposition')}
                  >
                    {DISPOSITION_COMPLETE_LABEL[disposition] || 'Apply disposition'}
                  </button>
                ) : null}
              </div>
            </section>

            {(detail.return.statusHistory || []).length ? (
              <section className="oj-skel-card">
                <header className="oj-skel-card-head">
                  <span className="material-symbols-outlined oj-skel-icon" aria-hidden>history</span>
                  <span>History</span>
                </header>
                <ul className="oj-skel-activity">
                  {[...(detail.return.statusHistory || [])].reverse().map((h, i) => (
                    <li key={`${h.status}-${i}`}>
                      <span className={`oj-skel-dot ${/restock|closed|disposed/i.test(h.status) ? 'is-ok' : /damaged|fail/i.test(h.status) ? 'is-mid' : 'is-wait'}`} />
                      <div>
                        <div className="oj-live-act-title">{h.status.replace(/_/g, ' ')}</div>
                        <div className="oj-live-act-detail">
                          {h.note || h.status}
                          {h.at ? ` · ${new Date(h.at).toLocaleString()}` : ''}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : null}
      </Drawer>
    </div>
  )
}
