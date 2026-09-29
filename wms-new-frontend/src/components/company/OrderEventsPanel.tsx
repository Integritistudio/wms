import { MessageWithCopyIds, StatusBadge, TruncatedCopyId } from '../ui'
import type { ActivityLogEntry, FulfillmentGroup, ShipmentRecord } from '../../lib/api'

function formatStamp(iso?: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
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
    <div className="oj-events">
      <div>
        <h4 className="oj-events-section-title">Shipment ↔ Shopify</h4>
        {groups.length === 0 ? (
          <p className="oj-live-hint">No fulfillment groups yet.</p>
        ) : (
          <ul className="oj-events-sync">
            {groups.map((g) => {
              const shipment = shipmentByGroup.get(g.id)
              const synced = Boolean(shipment?.shopifyFulfillmentId)
              return (
                <li key={g.id}>
                  <div className="oj-events-sync-row">
                    <StatusBadge status={g.status} />
                    <span className="demo-cell-primary">
                      {(g.lines || []).map((l) => `${l.sku || 'SKU'}×${l.allocatedQty || l.quantity}`).join(', ') ||
                        'Group'}
                    </span>
                    {g.status === 'shipped' ? (
                      synced ? (
                        <StatusBadge status="fulfilled" label="Shopify synced" />
                      ) : (
                        <StatusBadge status="error" label="Shopify pending" variant="warning" />
                      )
                    ) : (
                      <span className="oj-live-hint">Not shipped</span>
                    )}
                  </div>
                  {shipment?.shopifyFulfillmentId ? (
                    <div className="oj-events-sync-meta">Shopify: {shipment.shopifyFulfillmentId}</div>
                  ) : null}
                  {shipment?.trackingNumber ? (
                    <div className="oj-events-sync-meta">
                      Tracking:{' '}
                      <TruncatedCopyId
                        value={shipment.trackingNumber}
                        prefix={shipment.carrier ? `${shipment.carrier} ` : ''}
                      />
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div>
        <h4 className="oj-events-section-title">Activity events</h4>
        {sorted.length === 0 ? (
          <p className="oj-live-hint">No events recorded yet.</p>
        ) : (
          <ul className="oj-events-list">
            {sorted.map((log) => {
              const bad = /error|fail/i.test(`${log.type} ${log.message} ${log.toState}`)
              return (
                <li key={log.id}>
                  <span className={`oj-skel-dot ${bad ? 'is-mid' : 'is-ok'}`} />
                  <div className="oj-events-item-body">
                    <div className="oj-events-item-top">
                      <StatusBadge status={log.type} label={eventLabel(log.type)} />
                      <time className="oj-events-time" dateTime={log.createdAt}>
                        {formatStamp(log.createdAt)}
                      </time>
                    </div>
                    <div className="oj-events-msg">
                      {log.message ? <MessageWithCopyIds message={log.message} /> : '—'}
                    </div>
                    {log.fromState || log.toState ? (
                      <div className="oj-live-act-detail">
                        {log.fromState || '—'} → {log.toState || '—'}
                      </div>
                    ) : null}
                    {log.meta && Object.keys(log.meta).length > 0 ? (
                      <pre className="oj-events-meta">{JSON.stringify(log.meta, null, 2)}</pre>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
