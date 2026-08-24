import { StatusBadge } from '../ui'
import type { ActivityLogEntry, FulfillmentGroup, ShipmentRecord } from '../../lib/api'

function formatStamp(iso?: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString()
}

function eventLabel(type: string) {
  return type.replace(/_/g, ' ')
}

export default function OrderEventsPanel({
  logs,
  groups,
  shipments,
}: {
  logs: ActivityLogEntry[]
  groups: FulfillmentGroup[]
  shipments: ShipmentRecord[]
}) {
  const sorted = [...(logs || [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )

  const shipmentByGroup = new Map(shipments.map((s) => [s.fulfillmentGroupId, s]))

  return (
    <div className="order-events">
      <div className="order-events-section">
        <h4 className="order-flow-timeline-title">Shipment ↔ Shopify</h4>
        {groups.length === 0 ? (
          <p className="demo-muted text-sm">No fulfillment groups yet.</p>
        ) : (
          <ul className="order-events-sync-list">
            {groups.map((g) => {
              const shipment = shipmentByGroup.get(g.id)
              const synced = Boolean(shipment?.shopifyFulfillmentId)
              return (
                <li key={g.id}>
                  <div className="order-events-sync-row">
                    <StatusBadge status={g.status} />
                    <span className="demo-cell-primary">
                      {(g.lines || []).map((l) => `${l.sku || 'SKU'}×${l.allocatedQty || l.quantity}`).join(', ') || 'Group'}
                    </span>
                    {g.status === 'shipped' ? (
                      synced ? (
                        <StatusBadge status="fulfilled" label="Shopify synced" />
                      ) : (
                        <StatusBadge status="error" label="Shopify pending" variant="warning" />
                      )
                    ) : (
                      <span className="demo-muted text-sm">Not shipped</span>
                    )}
                  </div>
                  {shipment?.shopifyFulfillmentId ? (
                    <div className="demo-cell-secondary">Shopify: {shipment.shopifyFulfillmentId}</div>
                  ) : null}
                  {shipment?.trackingNumber ? (
                    <div className="demo-cell-secondary">
                      Tracking: {shipment.carrier} {shipment.trackingNumber}
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="order-events-section">
        <h4 className="order-flow-timeline-title">Activity events</h4>
        {sorted.length === 0 ? (
          <p className="demo-muted text-sm">No events recorded yet.</p>
        ) : (
          <ol className="order-events-list">
            {sorted.map((log) => (
              <li key={log.id} className="order-events-item">
                <div className="order-events-item-top">
                  <StatusBadge status={log.type} label={eventLabel(log.type)} />
                  <time className="order-events-time" dateTime={log.createdAt}>
                    {formatStamp(log.createdAt)}
                  </time>
                </div>
                <div className="order-events-msg">{log.message || '—'}</div>
                {log.fromState || log.toState ? (
                  <div className="demo-cell-secondary">
                    {log.fromState || '—'} → {log.toState || '—'}
                  </div>
                ) : null}
                {log.meta && Object.keys(log.meta).length > 0 ? (
                  <pre className="order-events-meta">{JSON.stringify(log.meta, null, 2)}</pre>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
