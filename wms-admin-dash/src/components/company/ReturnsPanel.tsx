import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  DataTable,
  Drawer,
  FormField,
  ListToolbar,
  PageHeader,
  PageSection,
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
          <button type="button" className="demo-btn demo-btn-sm" onClick={() => void openDetail(row.id)}>
            Manage
          </button>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [warehouses],
  )

  const allowedLabels = RETURN_STATUS_ACTIONS.filter((a) => detail?.allowedNext.includes(a.value))

  return (
    <div className="space-y-4">
      <PageHeader
        title="Returns"
        description="Authorize RMAs, receive packages, restock inventory, and close refunds."
        count={rows.length}
      />

      <StatusTabs tabs={STATUS_TABS} activeId={status} onChange={setStatus} />

      <ListToolbar
        search={q}
        searchPlaceholder="Search RMA, tracking, reason…"
        onSearchChange={setQ}
        resultCount={rows.length}
        resultLabel="returns"
        onClear={() => setQ('')}
      >
        <button type="button" className="demo-btn demo-btn-sm" onClick={() => void load()}>
          Search / refresh
        </button>
      </ListToolbar>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={loading}
        emptyTitle="No returns yet"
        emptyMessage="Create a return from an order detail page, or mark a shipment as Returned."
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
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3 text-sm">
              <StatusBadge status={detail.return.status} />
              {detail.order ? (
                <Link to="/account/orders/$orderId" params={{ orderId: detail.order.id }} className="demo-link">
                  Order {detail.order.orderNumber}
                </Link>
              ) : null}
            </div>

            <PageSection title="Lines" description="Quantities to receive and restock.">
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
            </PageSection>

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

            <div className="flex flex-wrap gap-2">
              {allowedLabels.map((action) => (
                <button
                  key={action.value}
                  type="button"
                  className="demo-btn demo-btn-sm"
                  disabled={busy}
                  onClick={() => void runAction(action.value)}
                >
                  {action.label}
                </button>
              ))}
              {['authorized', 'in_transit', 'received', 'inspected'].includes(detail.return.status) ? (
                <button
                  type="button"
                  className="demo-button"
                  disabled={busy || (disposition === 'restock' && !warehouseId)}
                  onClick={() => void runAction('apply_disposition')}
                >
                  {DISPOSITION_COMPLETE_LABEL[disposition] || 'Apply disposition'}
                </button>
              ) : null}
            </div>

            {(detail.return.statusHistory || []).length ? (
              <PageSection title="History">
                <ul className="space-y-2 text-sm">
                  {[...(detail.return.statusHistory || [])].reverse().map((h, i) => (
                    <li key={`${h.status}-${i}`} className="demo-cell-secondary">
                      <StatusBadge status={h.status} />{' '}
                      {h.note || h.status}
                      {h.at ? ` · ${new Date(h.at).toLocaleString()}` : ''}
                    </li>
                  ))}
                </ul>
              </PageSection>
            ) : null}
          </div>
        ) : null}
      </Drawer>
    </div>
  )
}
