import { useEffect, useMemo, useState } from 'react'
import { StatusBadge } from '../ui'
import {
  clearOrderAllocation,
  downloadSample945,
  getOrderFulfillment,
  listOrderLogs,
  shipFulfillmentGroup,
  syncFulfillmentGroupToShopify,
  type ActivityLogEntry,
  type FulfillmentGroup,
  type ShipmentRecord,
  type ShopOrder,
  type Warehouse,
} from '../../lib/api'
import ShipmentTracker from './ShipmentTracker'
import { use945Upload } from '../use945Upload'

export function OrderLogTimeline({ orderId }: { orderId: string }) {
  const [logs, setLogs] = useState<ActivityLogEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listOrderLogs(orderId).then(setLogs).catch(() => {}).finally(() => setLoading(false))
  }, [orderId])

  if (loading) return <p className="demo-muted">Loading logs…</p>
  if (logs.length === 0) return <p className="demo-muted">No activity recorded yet.</p>

  return (
    <ul className="order-events-list">
      {logs.map((log) => (
        <li key={log.id} className="order-events-item">
          <strong>{log.type.replace('_', ' ')}</strong>{' '}
          <span>{log.message}</span>{' '}
          <span className="demo-muted">{new Date(log.createdAt).toLocaleString()}</span>
        </li>
      ))}
    </ul>
  )
}

export default function OrderFulfillmentPanel({
  orderId,
  warehouses,
  onDone,
  onError,
  hideLogs = false,
}: {
  orderId: string
  warehouses: Warehouse[]
  onDone: () => void
  onError: (message: string) => void
  hideLogs?: boolean
}) {
  const [order, setOrder] = useState<ShopOrder | null>(null)
  const [groups, setGroups] = useState<FulfillmentGroup[]>([])
  const [shipments, setShipments] = useState<ShipmentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [clearing, setClearing] = useState(false)
  const [tracking, setTracking] = useState<Record<string, string>>({})
  const whName = (id: string | null) => warehouses.find((w) => w.id === id)?.name || id || '—'
  const { startUpload, overlay, uploading } = use945Upload({
    orderId,
    actor: 'company',
    onDone: () => {
      void load()
      onDone()
    },
    onError,
  })

  async function load() {
    setLoading(true)
    try {
      const data = await getOrderFulfillment(orderId)
      setOrder(data.order)
      setGroups(data.groups)
      setShipments(data.shipments)
    } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => { void load() }, [orderId])

  const hasShipped = useMemo(
    () =>
      groups.some((g) => g.status === 'shipped') ||
      ['fulfilled', 'partially_fulfilled', 'cancelled'].includes(order?.status || ''),
    [groups, order?.status],
  )

  const canClearAllocation = useMemo(() => {
    if (hasShipped) return false
    if (order?.warehouseId) return true
    return groups.some((g) => g.status === 'allocated' || g.status === 'on_hold')
  }, [hasShipped, order?.warehouseId, groups])

  async function onClearAllocation() {
    if (!canClearAllocation || clearing) return
    setClearing(true)
    try {
      await clearOrderAllocation(orderId)
      await load()
      onDone()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Unable to clear allocation')
    } finally {
      setClearing(false)
    }
  }

  if (loading) return <p className="demo-muted">Loading fulfillment…</p>

  return (
    <div className="ui-stack-sm">
      {overlay}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <strong className="text-sm">Fulfillment groups</strong>
        <button
          type="button"
          className="demo-btn demo-btn-sm"
          disabled={!canClearAllocation || clearing}
          title={
            hasShipped
              ? 'Unavailable after a product has shipped'
              : canClearAllocation
                ? 'Clear warehouse allocation so you can assign a different warehouse'
                : 'Nothing to clear — order is not allocated yet'
          }
          onClick={() => void onClearAllocation()}
        >
          {clearing ? 'Clearing…' : 'Clear allocation'}
        </button>
      </div>
      {hasShipped ? (
        <p className="demo-muted text-xs">Allocation cannot be cleared after a shipment has been recorded.</p>
      ) : canClearAllocation ? (
        <p className="demo-muted text-xs">
          Clear allocation releases reserved stock and unassigns the warehouse so you can change it above, then Assign again.
        </p>
      ) : null}
      {groups.length === 0 ? (
        <p className="demo-muted text-sm">No fulfillment groups yet. Assign a warehouse or enable routing.</p>
      ) : (
        <div className="demo-table-shell">
          <table className="demo-table">
            <thead>
              <tr>
                <th>Warehouse</th>
                <th>Lines</th>
                <th>Status</th>
                <th>SFTP</th>
                <th>Ship</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id}>
                  <td>{whName(g.warehouseId)}</td>
                  <td>
                    {(g.lines || []).map((l) => (
                      <div key={l.orderLineId || l.sku} className="demo-cell-secondary">{l.sku || '—'} × {l.allocatedQty || l.quantity}</div>
                    ))}
                  </td>
                  <td><StatusBadge status={g.status} /></td>
                  <td><StatusBadge status={g.sftpStatus || 'skipped'} /></td>
                  <td className="actions">
                    {g.status === 'shipped' ? (
                      <div className="demo-action-group">
                        <span className="demo-cell-secondary">Shipped</span>
                        <button
                          type="button"
                          className="demo-btn demo-btn-sm"
                          title="Push this group's lines to Shopify as a (partial) fulfillment"
                          onClick={() =>
                            void syncFulfillmentGroupToShopify(g.id)
                              .then(() => {
                                void load()
                                onDone()
                              })
                              .catch((err) => onError(err instanceof Error ? err.message : 'Shopify sync failed'))
                          }
                        >
                          Sync Shopify
                        </button>
                        <button
                          type="button"
                          className="demo-btn demo-btn-sm"
                          onClick={() =>
                            void downloadSample945(orderId, 'company', { fulfillmentGroupId: g.id }).catch((err) =>
                              onError(err instanceof Error ? err.message : 'Sample 945 failed'),
                            )
                          }
                        >
                          Sample 945
                        </button>
                        <label className={`demo-btn demo-btn-sm${uploading ? ' is-disabled' : ''}`}>
                          {uploading ? 'Uploading…' : 'Upload 945'}
                          <input
                            className="hidden"
                            type="file"
                            accept=".edi,.txt,.json,*"
                            disabled={uploading}
                            onChange={(event) => {
                              const file = event.target.files?.[0]
                              event.target.value = ''
                              if (!file || uploading) return
                              startUpload(file, { fulfillmentGroupId: g.id })
                            }}
                          />
                        </label>
                      </div>
                    ) : g.status === 'on_hold' ? (
                      <span className="demo-cell-secondary">On hold</span>
                    ) : (
                      <div className="demo-action-group">
                        <input
                          className="demo-input demo-input-fit"
                          placeholder="Tracking"
                          value={tracking[g.id] || ''}
                          onChange={(e) => setTracking({ ...tracking, [g.id]: e.target.value })}
                          disabled={uploading}
                        />
                        <button
                          type="button"
                          className="demo-btn demo-btn-sm"
                          disabled={uploading}
                          onClick={() => {
                            const tn = tracking[g.id]
                            if (!tn) { onError('Tracking required'); return }
                            void shipFulfillmentGroup(g.id, { trackingNumber: tn, carrier: 'UPS' })
                              .then((result) => {
                                void load()
                                onDone()
                                if (result.shopifyError) {
                                  onError(`Shipped in WMS, but Shopify sync failed: ${result.shopifyError}`)
                                }
                              })
                              .catch((err) => onError(err instanceof Error ? err.message : 'Ship failed'))
                          }}
                        >
                          Ship {groups.length > 1 ? 'group' : 'order'}
                        </button>
                        <button
                          type="button"
                          className="demo-btn demo-btn-sm"
                          disabled={uploading}
                          onClick={() =>
                            void downloadSample945(orderId, 'company', {
                              trackingNumber: tracking[g.id] || undefined,
                              fulfillmentGroupId: g.id,
                            }).catch((err) => onError(err instanceof Error ? err.message : 'Sample 945 failed'))
                          }
                        >
                          Sample 945
                        </button>
                        <label className={`demo-btn demo-btn-sm${uploading ? ' is-disabled' : ''}`}>
                          {uploading ? 'Uploading…' : 'Upload 945'}
                          <input
                            className="hidden"
                            type="file"
                            accept=".edi,.txt,.json,*"
                            disabled={uploading}
                            onChange={(event) => {
                              const file = event.target.files?.[0]
                              event.target.value = ''
                              if (!file || uploading) return
                              startUpload(file, { fulfillmentGroupId: g.id })
                            }}
                          />
                        </label>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {shipments.length > 0 ? (
        <ShipmentTracker shipments={shipments} warehouses={warehouses} onDone={() => { void load(); onDone() }} onError={onError} />
      ) : null}
      {hideLogs ? null : <OrderLogTimeline orderId={orderId} />}
    </div>
  )
}
