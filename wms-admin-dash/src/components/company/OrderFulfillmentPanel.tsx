import { useEffect, useState } from 'react'
import { StatusBadge } from '../ui'
import {
  allocateOrder,
  getOrderFulfillment,
  listOrderLogs,
  shipFulfillmentGroup,
  syncFulfillmentGroupToShopify,
  type ActivityLogEntry,
  type FulfillmentGroup,
  type ShipmentRecord,
  type Warehouse,
} from '../../lib/api'
import ShipmentTracker from './ShipmentTracker'

export function OrderLogTimeline({ orderId }: { orderId: string }) {
  const [logs, setLogs] = useState<ActivityLogEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listOrderLogs(orderId).then(setLogs).catch(() => {}).finally(() => setLoading(false))
  }, [orderId])

  if (loading) return <p className="demo-muted">Loading logs…</p>
  if (logs.length === 0) return <p className="demo-muted">No activity recorded yet.</p>

  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0', fontSize: '0.8rem' }}>
      {logs.map((log) => (
        <li key={log.id} style={{ padding: '0.25rem 0', borderBottom: '1px solid var(--border, #eee)' }}>
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
  const [groups, setGroups] = useState<FulfillmentGroup[]>([])
  const [shipments, setShipments] = useState<ShipmentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [tracking, setTracking] = useState<Record<string, string>>({})
  const whName = (id: string | null) => warehouses.find((w) => w.id === id)?.name || id || '—'

  async function load() {
    setLoading(true)
    try {
      const data = await getOrderFulfillment(orderId)
      setGroups(data.groups)
      setShipments(data.shipments)
    } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => { void load() }, [orderId])

  if (loading) return <p className="demo-muted">Loading fulfillment…</p>

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <strong className="text-sm">Fulfillment groups</strong>
        <button
          type="button"
          className="demo-btn demo-btn-sm"
          onClick={() => void allocateOrder(orderId).then(() => { void load(); onDone() }).catch((e) => onError(e instanceof Error ? e.message : 'Allocate failed'))}
        >
          Re-allocate
        </button>
      </div>
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
                        />
                        <button
                          type="button"
                          className="demo-btn demo-btn-sm"
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
                          Ship group
                        </button>
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
