import { useEffect, useState } from 'react'
import { TruncatedCopyId } from '../ui'
import {
  SHIPMENT_STATUS_OPTIONS,
  getShipooTrackingStatus,
  updateShipmentStatus,
  type ReturnRecord,
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

const AUTO_STATUSES = new Set(['in_transit', 'out_for_delivery', 'delivered'])

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
  returns = [],
  onDone,
  onError,
}: {
  shipments: ShipmentRecord[]
  warehouses: Warehouse[]
  returns?: ReturnRecord[]
  onDone: () => void
  onError: (message: string) => void
}) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [openHistory, setOpenHistory] = useState<Record<string, boolean>>({})
  const [autoUpdates, setAutoUpdates] = useState(false)
  const whName = (id: string | null) => warehouses.find((w) => w.id === id)?.name || id || '—'

  useEffect(() => {
    let alive = true
    void getShipooTrackingStatus()
      .then((status) => {
        if (alive) setAutoUpdates(Boolean(status.autoUpdates))
      })
      .catch(() => {
        if (alive) setAutoUpdates(false)
      })
    return () => {
      alive = false
    }
  }, [])

  if (!shipments.length) {
    return <p className="oj-adv-empty">No shipments yet — ship a group to track progress.</p>
  }

  function shipmentHasReturn(shipment: ShipmentRecord) {
    if (shipment.status === 'returned') return true
    const splitOrder = shipments.length > 1
    return returns.some((record) => {
      if (String(record.status || '').toLowerCase() === 'cancelled') return false
      // Exact shipment link
      if (record.shipmentId) return record.shipmentId === shipment.id
      // Warehouse-scoped RMA (common for Operations Desk creates)
      if (record.warehouseId && record.warehouseId === shipment.warehouseId) return true
      // Order-wide RMA with no shipment link: block every path on single-shipment
      // orders, and every path when no warehouse was recorded either.
      if (!record.shipmentId && !splitOrder) return true
      if (!record.shipmentId && !record.warehouseId) return true
      return false
    })
  }

  async function advance(shipmentId: string, status: string) {
    if (status === 'returned') {
      const shipment = shipments.find((item) => item.id === shipmentId)
      if (shipment && shipmentHasReturn(shipment)) {
        onError('This shipment path already has a return')
        return
      }
    }
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

  function isAutoManaged(status: string) {
    return autoUpdates && AUTO_STATUSES.has(status)
  }

  return (
    <div className={`oj-adv${autoUpdates ? ' is-auto' : ''}`}>
      <header className="oj-adv-head">
        <span className="material-symbols-outlined oj-adv-head-icon" aria-hidden>
          timeline
        </span>
        <div>
          <strong>Advance shipment</strong>
          <p>
            {autoUpdates
              ? 'Shipoo auto-tracking is on for your account. Carrier events update Transit, Out, and Delivered. You can still override manually.'
              : 'Tap the next stage to move the package forward.'}
          </p>
        </div>
        {autoUpdates ? <span className="oj-adv-auto-pill">Auto-tracking</span> : null}
      </header>

      <ul className="oj-adv-list">
        {shipments.map((shipment) => {
          const cur = stepIndex(shipment.status)
          const hasReturn = shipmentHasReturn(shipment)
          const next = (NEXT_HINTS[shipment.status] || []).filter(
            (status) => !(status === 'returned' && hasReturn),
          )
          const primary = next[0]
          const extras = next.slice(1)
          const history = [...(shipment.statusHistory || [])].slice().reverse()
          const histOpen = openHistory[shipment.id]
          const primaryAuto = primary ? isAutoManaged(primary) : false

          return (
            <li key={shipment.id} className="oj-adv-card">
              <div className="oj-adv-meta">
                <div className="oj-adv-meta-main">
                  <span className={`oj-adv-status${shipment.status === 'returned' || hasReturn ? ' is-return' : ''}`}>
                    {hasReturn && shipment.status !== 'returned'
                      ? `${labelFor(shipment.status)} · RMA`
                      : labelFor(shipment.status)}
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
                  const done =
                    cur > i ||
                    (cur === i && shipment.status !== 'failed') ||
                    (step.id === 'returned' && hasReturn)
                  const active =
                    shipment.status === step.id ||
                    (step.id === 'returned' && hasReturn && shipment.status !== 'returned')
                  const canJump = next.includes(step.id)
                  const autoStep = isAutoManaged(step.id)
                  const isReturn = step.tone === 'return'
                  const cls = [
                    'oj-adv-node',
                    done ? 'is-done' : '',
                    active ? 'is-active' : '',
                    isReturn ? 'is-return' : '',
                    canJump ? 'is-actionable' : '',
                    autoStep ? 'is-auto' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')

                  return (
                    <div key={step.id} className="oj-adv-seg">
                      {i > 0 ? (
                        <span
                          className={`oj-adv-line${cur >= i || (isReturn && hasReturn) ? ' is-on' : ''}${isReturn && (cur >= i || hasReturn) ? ' is-return' : ''}`}
                        />
                      ) : null}
                      <button
                        type="button"
                        className={cls}
                        disabled={!canJump || busyId === shipment.id}
                        title={
                          step.id === 'returned' && hasReturn
                            ? 'This path already has a return'
                            : autoStep && canJump
                              ? `${step.label} usually updates from Shipoo — click to override`
                              : canJump
                                ? `Mark ${step.label}`
                                : step.label
                        }
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
                    className={`oj-adv-primary${primary === 'returned' ? ' is-return' : ''}${primaryAuto ? ' is-auto' : ''}`}
                    disabled={busyId === shipment.id}
                    onClick={() => void advance(shipment.id, primary)}
                  >
                    {busyId === shipment.id
                      ? 'Updating…'
                      : primaryAuto
                        ? `Awaiting Shipoo · ${labelFor(primary)}`
                        : `Mark ${labelFor(primary)}`}
                  </button>
                ) : hasReturn && shipment.status !== 'returned' ? (
                  <span className="oj-adv-done">Return already created</span>
                ) : (
                  <span className="oj-adv-done">Complete</span>
                )}

                {extras.length > 0 ? (
                  <div className="oj-adv-extras">
                    {extras.map((status) => (
                      <button
                        key={status}
                        type="button"
                        className={`oj-adv-extra${status === 'returned' ? ' is-return' : ''}${isAutoManaged(status) ? ' is-auto' : ''}`}
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
                        {event.source ? <span className="oj-adv-hist-source"> · {event.source}</span> : null}
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
