import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  DataTable,
  Drawer,
  FormField,
  ListToolbar,
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

export default function ReturnsPanel() {
  const { company, setError, setNotice } = useCompanyPortal()
  const warehouses = company?.warehouses || []

  const [rows, setRows] = useState<ReturnRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('all')
  const [q, setQ] = useState('')
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
      setRows(await listReturns({ status: status === 'all' ? undefined : status, q: q.trim() || undefined }))
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load returns')
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

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
        render: (row) => (
          <div>
            <div className="demo-cell-primary">{row.rmaNumber}</div>
            <div className="demo-cell-secondary">{row.source === 'shipment_rts' ? 'From shipment RTS' : 'Manual'}</div>
          </div>
        ),
      },
      {
        key: 'order',
        header: 'Order',
        render: (row) => (
          <Link to="/account/orders/$orderId" params={{ orderId: row.orderId }} className="demo-link text-sm">
            View order
          </Link>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        render: (row) => <StatusBadge status={row.status} />,
      },
      {
        key: 'warehouse',
        header: 'Warehouse',
        render: (row) => whName(row.warehouseId),
      },
      {
        key: 'created',
        header: 'Created',
        render: (row) => (row.createdAt ? new Date(row.createdAt).toLocaleString() : '—'),
      },
      {
        key: 'actions',
        header: '',
        align: 'right',
        render: (row) => (
          <button type="button" className="oj-skel-chip oj-live-chip" onClick={() => void openDetail(row.id)}>
            Manage
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
      <section className="oj-skel-hero">
        <div className="oj-skel-hero-main">
          <div className="oj-skel-crumb">
            <span className="material-symbols-outlined oj-skel-icon oj-skel-icon--sm">assignment_return</span>
            <span>Company</span>
            <span className="oj-skel-slash">/</span>
            <strong>Returns</strong>
          </div>
          <div className="oj-skel-title-row">
            <h1 className="oj-live-title">Returns</h1>
            <span className="oj-skel-badge">
              <span className="material-symbols-outlined oj-skel-icon oj-skel-icon--xs" aria-hidden>inventory_2</span>
              {stats.total} RMA{stats.total === 1 ? '' : 's'}
            </span>
          </div>
          <p className="oj-live-sub">Authorize RMAs, receive packages, restock inventory, and close refunds.</p>
        </div>
        <div className="oj-skel-hero-aside">
          <div className="oj-skel-hero-actions">
            <button
              type="button"
              className="oj-skel-chip oj-live-chip oj-live-chip--icon"
              onClick={() => void load()}
              disabled={loading}
              aria-label="Refresh returns"
              title="Refresh"
            >
              <span className={`material-symbols-outlined oj-skel-icon oj-skel-icon--sm${loading ? ' oj-skel-spin' : ''}`} aria-hidden>
                refresh
              </span>
            </button>
          </div>
        </div>
      </section>

      <section className="oj-skel-metas">
        <article className="oj-skel-meta">
          <div className="oj-skel-meta-icon">
            <span className="material-symbols-outlined">pending_actions</span>
          </div>
          <div className="oj-skel-meta-body">
            <span className="oj-skel-meta-label">Open</span>
            <div className="oj-live-meta-value">{stats.open}</div>
            <div className="oj-live-meta-sub">Requested / authorized</div>
          </div>
        </article>
        <article className="oj-skel-meta">
          <div className="oj-skel-meta-icon">
            <span className="material-symbols-outlined">local_shipping</span>
          </div>
          <div className="oj-skel-meta-body">
            <span className="oj-skel-meta-label">In transit</span>
            <div className="oj-live-meta-value">{stats.inTransit}</div>
            <div className="oj-live-meta-sub">On the way back</div>
          </div>
        </article>
        <article className="oj-skel-meta">
          <div className="oj-skel-meta-icon">
            <span className="material-symbols-outlined">warehouse</span>
          </div>
          <div className="oj-skel-meta-body">
            <span className="oj-skel-meta-label">At warehouse</span>
            <div className="oj-live-meta-value">{stats.received}</div>
            <div className="oj-live-meta-sub">Received / inspected</div>
          </div>
        </article>
        <article className="oj-skel-meta">
          <div className="oj-skel-meta-icon">
            <span className="material-symbols-outlined">task_alt</span>
          </div>
          <div className="oj-skel-meta-body">
            <span className="oj-skel-meta-label">Closed</span>
            <div className="oj-live-meta-value">{stats.closed}</div>
            <div className="oj-live-meta-sub">Restocked / dispositioned</div>
          </div>
        </article>
      </section>

      <StatusTabs tabs={STATUS_TABS} activeId={status} onChange={setStatus} />

      <ListToolbar
        search={q}
        searchPlaceholder="Search RMA, tracking, reason…"
        onSearchChange={setQ}
        resultCount={rows.length}
        resultLabel="returns"
        onClear={() => setQ('')}
      />

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={loading}
        emptyTitle="No returns yet"
        emptyMessage="Create a return from an order detail page, or mark a shipment as Returned."
        onRowClick={(row) => void openDetail(row.id)}
      />

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
