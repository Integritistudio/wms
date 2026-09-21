import { useState } from 'react'
import { TruncatedCopyId } from '../ui'
import {
  SHIPMENT_STATUS_OPTIONS,
  updateShipmentStatus,
  type ShipmentRecord,
  type Warehouse,
} from '../../lib/api'

const NEXT_HINTS: Record<string, string[]> = {
  pending: ['labeled', 'in_transit'],
  labeled: ['in_transit', 'out_for_delivery', 'delivered'],
  in_transit: ['out_for_delivery', 'delivered'],
  out_for_delivery: ['delivered'],
  delivered: ['returned'],
  failed: ['in_transit', 'delivered', 'returned'],
  returned: [],
}

const PIPELINE = [
  { id: 'labeled', label: 'Labeled', icon: 'label' },
  { id: 'in_transit', label: 'Transit', icon: 'flight_takeoff' },
  { id: 'out_for_delivery', label: 'Out', icon: 'local_shipping' },
  { id: 'delivered', label: 'Delivered', icon: 'home' },
  { id: 'returned', label: 'Return', icon: 'assignment_return', tone: 'return' as const },
]

function labelFor(status: string) {
  return SHIPMENT_STATUS_OPTIONS.find((o) => o.value === status)?.label || status.replace(/_/g, ' ')
}

function stepIndex(status: string) {
  if (status === 'pending') return -1
  if (status === 'failed') return -1
  const i = PIPELINE.findIndex((s) => s.id === status)
  return i
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
  const [busyId, setBusyId] = useState<string | null>(null)
  const [openHistory, setOpenHistory] = useState<Record<string, boolean>>({})
  const whName = (id: string | null) => warehouses.find((w) => w.id === id)?.name || id || '—'

  if (!shipments.length) {
    return <p className="oj-adv-empty">No shipments yet — ship a group to track progress.</p>
  }

  async function advance(shipmentId: string, status: string) {
    setBusyId(shipmentId)
    try {
      const result = await updateShipmentStatus(shipmentId, { status })
      onDone()
      if (result.shopifyError) {
        onError(`Updated locally; Shopify tracking event failed: ${result.shopifyError}`)
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to update shipment')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="oj-adv">
      <header className="oj-adv-head">
        <span className="material-symbols-outlined oj-adv-head-icon" aria-hidden>
          timeline
        </span>
        <div>
          <strong>Advance shipment</strong>
          <p>Tap the next stage to move the package forward.</p>
        </div>
      </header>

      <ul className="oj-adv-list">
        {shipments.map((shipment) => {
          const cur = stepIndex(shipment.status)
          const next = NEXT_HINTS[shipment.status] || []
          const primary = next[0]
          const extras = next.slice(1)
          const history = [...(shipment.statusHistory || [])].slice().reverse()
          const histOpen = openHistory[shipment.id]

          return (
            <li key={shipment.id} className="oj-adv-card">
              <div className="oj-adv-meta">
                <div className="oj-adv-meta-main">
                  <span className={`oj-adv-status${shipment.status === 'returned' ? ' is-return' : ''}`}>
                    {labelFor(shipment.status)}
                  </span>
                  <span className="oj-adv-track">
                    {shipment.trackingNumber ? (
                      <TruncatedCopyId
                        value={shipment.trackingNumber}
                        prefix={`${shipment.carrier || 'Carrier'} · `}
                        maxLen={18}
                      />
                    ) : (
                      shipment.carrier || 'No tracking'
                    )}
                  </span>
                </div>
                <span className="oj-adv-wh">{whName(shipment.warehouseId)}</span>
              </div>

              <div className="oj-adv-rail" aria-label="Shipment progress">
                {PIPELINE.map((step, i) => {
                  const done = cur > i || (cur === i && shipment.status !== 'failed')
                  const active = shipment.status === step.id
                  const canJump = next.includes(step.id)
                  const isReturn = step.tone === 'return'
                  const cls = [
                    'oj-adv-node',
                    done ? 'is-done' : '',
                    active ? 'is-active' : '',
                    isReturn ? 'is-return' : '',
                    canJump ? 'is-actionable' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')

                  return (
                    <div key={step.id} className="oj-adv-seg">
                      {i > 0 ? (
                        <span
                          className={`oj-adv-line${cur >= i ? ' is-on' : ''}${isReturn && cur >= i ? ' is-return' : ''}`}
                        />
                      ) : null}
                      <button
                        type="button"
                        className={cls}
                        disabled={!canJump || busyId === shipment.id}
                        title={canJump ? `Mark ${step.label}` : step.label}
                        onClick={() => {
                          if (!canJump) return
                          void advance(shipment.id, step.id)
                        }}
                      >
                        <span className="material-symbols-outlined" aria-hidden>
                          {step.icon}
                        </span>
                        <span className="oj-adv-node-label">{step.label}</span>
                      </button>
                    </div>
                  )
                })}
              </div>

              <div className="oj-adv-footer">
                {primary ? (
                  <button
                    type="button"
                    className={`oj-adv-primary${primary === 'returned' ? ' is-return' : ''}`}
                    disabled={busyId === shipment.id}
                    onClick={() => void advance(shipment.id, primary)}
                  >
                    {busyId === shipment.id ? 'Updating…' : `Mark ${labelFor(primary)}`}
                  </button>
                ) : (
                  <span className="oj-adv-done">Complete</span>
                )}

                {extras.length > 0 ? (
                  <div className="oj-adv-extras">
                    {extras.map((status) => (
                      <button
                        key={status}
                        type="button"
                        className={`oj-adv-extra${status === 'returned' ? ' is-return' : ''}`}
                        disabled={busyId === shipment.id}
                        onClick={() => void advance(shipment.id, status)}
                      >
                        {labelFor(status)}
                      </button>
                    ))}
                  </div>
                ) : null}

                {history.length > 0 ? (
                  <button
                    type="button"
                    className="oj-adv-hist-toggle"
                    onClick={() => setOpenHistory((h) => ({ ...h, [shipment.id]: !h[shipment.id] }))}
                  >
                    {histOpen ? 'Hide history' : `History (${history.length})`}
                  </button>
                ) : null}
              </div>

              {histOpen && history.length > 0 ? (
                <ol className="oj-adv-history">
                  {history.slice(0, 6).map((event, idx) => (
                    <li key={`${shipment.id}-${idx}-${event.status}`}>
                      <span className={`oj-adv-hist-dot${event.status === 'returned' ? ' is-return' : ''}`} />
                      <div>
                        <strong>{labelFor(event.status)}</strong>
                        {event.note ? <span> · {event.note}</span> : null}
                      </div>
                      <time>
                        {event.at
                          ? new Date(event.at).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })
                          : ''}
                      </time>
                    </li>
                  ))}
                </ol>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
