import { StatusBadge, TruncatedCopyId } from '../ui'
import {
  SHIPMENT_STATUS_OPTIONS,
  updateShipmentStatus,
  type ShipmentRecord,
  type Warehouse,
} from '../../lib/api'

const NEXT_HINTS: Record<string, string[]> = {
  pending: ['labeled', 'in_transit'],
  labeled: ['in_transit', 'out_for_delivery', 'delivered', 'failed'],
  in_transit: ['out_for_delivery', 'delivered', 'failed', 'returned'],
  out_for_delivery: ['delivered', 'failed', 'returned'],
  delivered: [],
  failed: ['in_transit', 'out_for_delivery', 'delivered', 'returned'],
  returned: ['labeled', 'in_transit'],
}

function labelFor(status: string) {
  return SHIPMENT_STATUS_OPTIONS.find((o) => o.value === status)?.label || status.replace(/_/g, ' ')
}

export default function ShipmentTracker({
  shipments,
  warehouses,
  onDone,
  onError,
}: {
  shipments: ShipmentRecord[]
  warehouses: Warehouse[]
  onDone: () => void
  onError: (message: string) => void
}) {
  const whName = (id: string | null) => warehouses.find((w) => w.id === id)?.name || id || '—'

  if (!shipments.length) {
    return <p className="demo-muted text-sm">No shipments yet. Ship a fulfillment group to start tracking.</p>
  }

  return (
    <div className="shipment-tracker">
      <strong className="text-sm">Shipment tracking</strong>
      <p className="demo-muted text-sm mt-1">
        Move each package through real-world stages: labeled → in transit → out for delivery → delivered.
      </p>
      <ul className="shipment-tracker-list">
        {shipments.map((shipment) => {
          const next = NEXT_HINTS[shipment.status] || SHIPMENT_STATUS_OPTIONS.map((o) => o.value)
          return (
            <li key={shipment.id} className="shipment-tracker-card">
              <div className="shipment-tracker-head">
                <StatusBadge status={shipment.status} label={labelFor(shipment.status)} />
                <span className="demo-cell-primary shipment-tracker-tracking">
                  {shipment.trackingNumber ? (
                    <TruncatedCopyId
                      value={shipment.trackingNumber}
                      prefix={`${shipment.carrier || 'Carrier'} `}
                      maxLen={20}
                    />
                  ) : (
                    <>{shipment.carrier || 'Carrier'} —</>
                  )}
                </span>
                <span className="demo-cell-secondary">{whName(shipment.warehouseId)}</span>
              </div>

              <div className="shipment-tracker-steps" aria-label="Shipment progress">
                {['labeled', 'in_transit', 'out_for_delivery', 'delivered'].map((step) => {
                  const order = ['pending', 'labeled', 'in_transit', 'out_for_delivery', 'delivered']
                  const cur = order.indexOf(shipment.status)
                  const idx = order.indexOf(step)
                  const done = cur >= idx && shipment.status !== 'failed' && shipment.status !== 'returned'
                  const active = shipment.status === step
                  return (
                    <span
                      key={step}
                      className={`shipment-step ${done ? 'is-done' : ''} ${active ? 'is-active' : ''}`}
                    >
                      {labelFor(step)}
                    </span>
                  )
                })}
              </div>

              {(shipment.statusHistory || []).length > 0 ? (
                <ol className="shipment-history">
                  {[...(shipment.statusHistory || [])]
                    .slice()
                    .reverse()
                    .slice(0, 5)
                    .map((event, idx) => (
                      <li key={`${shipment.id}-${idx}-${event.status}`}>
                        <StatusBadge status={event.status} label={labelFor(event.status)} />
                        <span>{event.note || labelFor(event.status)}</span>
                        <time className="demo-cell-secondary">
                          {event.at ? new Date(event.at).toLocaleString() : ''}
                        </time>
                      </li>
                    ))}
                </ol>
              ) : null}

              {next.length > 0 ? (
                <div className="shipment-tracker-actions">
                  {next.map((status) => (
                    <button
                      key={status}
                      type="button"
                      className="demo-btn demo-btn-sm"
                      onClick={() =>
                        void updateShipmentStatus(shipment.id, { status })
                          .then((result) => {
                            onDone()
                            if (result.shopifyError) {
                              onError(`Updated locally; Shopify tracking event failed: ${result.shopifyError}`)
                            }
                          })
                          .catch((err) => onError(err instanceof Error ? err.message : 'Unable to update shipment'))
                      }
                    >
                      Mark {labelFor(status)}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="demo-muted text-sm mt-2">Shipment complete.</p>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
