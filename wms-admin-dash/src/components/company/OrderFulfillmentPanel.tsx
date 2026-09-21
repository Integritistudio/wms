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
  showTracker = true,
}: {
  orderId: string
  warehouses: Warehouse[]
  onDone: () => void
  onError: (message: string) => void
  hideLogs?: boolean
  showTracker?: boolean
}) {
  const [order, setOrder] = useState<ShopOrder | null>(null)
  const [groups, setGroups] = useState<FulfillmentGroup[]>([])
  const [shipments, setShipments] = useState<ShipmentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [clearing, setClearing] = useState(false)
  const [shippingId, setShippingId] = useState<string | null>(null)
  const [tracking, setTracking] = useState<Record<string, string>>({})
  const [carrier, setCarrier] = useState<Record<string, string>>({})
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
    } catch {
      /* ignore */
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [orderId])

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

  if (loading) return <p className="oj-ff-empty">Loading fulfillment…</p>

  return (
    <div className="oj-ff">
      {overlay}

      <header className="oj-ff-head">
        <div>
          <strong>Fulfillment groups</strong>
          <p>{groups.length ? `${groups.length} package${groups.length === 1 ? '' : 's'}` : 'None yet'}</p>
        </div>
        <button
          type="button"
          className="oj-ff-clear"
          disabled={!canClearAllocation || clearing}
          title={
            hasShipped
              ? 'Unavailable after a product has shipped'
              : canClearAllocation
                ? 'Clear warehouse allocation'
                : 'Nothing to clear'
          }
          onClick={() => void onClearAllocation()}
        >
          {clearing ? 'Clearing…' : 'Clear allocation'}
        </button>
      </header>

      {groups.length === 0 ? (
        <p className="oj-ff-empty">Assign a warehouse to create fulfillment groups.</p>
      ) : (
        <ul className="oj-ff-list">
          {groups.map((g, idx) => {
            const shipment = shipments.find((s) => s.fulfillmentGroupId === g.id)
            const lines = (g.lines || [])
              .map((l) => `${l.sku || '—'}×${l.allocatedQty || l.quantity}`)
              .join(' · ')
            return (
              <li key={g.id} className="oj-ff-card">
                <div className="oj-ff-card-top">
                  <div>
                    <div className="oj-ff-card-title">
                      Package {idx + 1}
                      <span>· {whName(g.warehouseId)}</span>
                    </div>
                    <div className="oj-ff-card-lines">{lines || 'No lines'}</div>
                  </div>
                  <div className="oj-ff-badges">
                    <StatusBadge status={g.status} />
                    <StatusBadge status={g.sftpStatus || 'skipped'} label={`SFTP ${g.sftpStatus || '—'}`} />
                  </div>
                </div>

                {g.status === 'shipped' ? (
                  <div className="oj-ff-actions">
                    {shipment?.trackingNumber ? (
                      <span className="oj-ff-track">
                        {shipment.carrier || 'Carrier'} · {shipment.trackingNumber}
                      </span>
                    ) : (
                      <span className="oj-ff-track">Shipped</span>
                    )}
                    <button
                      type="button"
                      className="oj-ff-btn"
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
                      className="oj-ff-btn is-ghost"
                      onClick={() =>
                        void downloadSample945(orderId, 'company', { fulfillmentGroupId: g.id }).catch((err) =>
                          onError(err instanceof Error ? err.message : 'Sample 945 failed'),
                        )
                      }
                    >
                      945
                    </button>
                    <label className={`oj-ff-btn is-ghost${uploading ? ' is-disabled' : ''}`}>
                      {uploading ? '…' : 'Upload'}
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
                  <p className="oj-ff-empty">On hold</p>
                ) : (
                  <div className="oj-ff-ship">
                    <input
                      className="oj-ff-input"
                      placeholder="Tracking #"
                      value={tracking[g.id] || ''}
                      onChange={(e) => setTracking({ ...tracking, [g.id]: e.target.value })}
                      disabled={uploading || shippingId === g.id}
                    />
                    <input
                      className="oj-ff-input oj-ff-input--carrier"
                      placeholder="Carrier"
                      value={carrier[g.id] || 'UPS'}
                      onChange={(e) => setCarrier({ ...carrier, [g.id]: e.target.value })}
                      disabled={uploading || shippingId === g.id}
                    />
                    <button
                      type="button"
                      className="oj-ff-btn is-accent"
                      disabled={uploading || shippingId === g.id}
                      onClick={() => {
                        const tn = tracking[g.id]
                        if (!tn) {
                          onError('Tracking required')
                          return
                        }
                        setShippingId(g.id)
                        void shipFulfillmentGroup(g.id, {
                          trackingNumber: tn,
                          carrier: carrier[g.id] || 'UPS',
                        })
                          .then((result) => {
                            void load()
                            onDone()
                            if (result.shopifyError) {
                              onError(`Shipped in WMS, but Shopify sync failed: ${result.shopifyError}`)
                            }
                          })
                          .catch((err) => onError(err instanceof Error ? err.message : 'Ship failed'))
                          .finally(() => setShippingId(null))
                      }}
                    >
                      {shippingId === g.id ? '…' : 'Ship'}
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {showTracker && shipments.length > 0 ? (
        <ShipmentTracker
          shipments={shipments}
          warehouses={warehouses}
          onDone={() => {
            void load()
            onDone()
          }}
          onError={onError}
        />
      ) : null}

      {hideLogs ? null : <OrderLogTimeline orderId={orderId} />}
    </div>
  )
}
