import type { ShopOrder } from '../../lib/api'

type StepState = 'todo' | 'active' | 'done' | 'failed'

export type ShipProgress = {
  phase: 'idle' | 'dispatched' | 'in_transit' | 'delivered' | 'failed'
  label: string
  steps: Array<{ id: string; label: string; state: StepState }>
}

function isReturnOrder(order: ShopOrder) {
  const ship = (order.shipmentStatus || '').toLowerCase()
  const status = (order.status || '').toLowerCase()
  return ship === 'returned' || status === 'returned' || status === 'partially_returned'
}

export function getShipProgress(order: ShopOrder): ShipProgress {
  const ship = (order.shipmentStatus || '').toLowerCase()
  const orderStatus = (order.status || '').toLowerCase()
  const hasTrack = Boolean(order.trackingNumber)
  const returned = isReturnOrder(order)

  const base = [
    { id: 'dispatched', label: 'Dispatched' },
    { id: 'in_transit', label: 'On the way' },
    { id: 'delivered', label: 'Delivered' },
  ]

  let progress: ShipProgress

  // Build progress from live shipment stage — never force delivery green for returns.
  if (ship === 'failed') {
    progress = {
      phase: 'failed',
      label: 'Delivery failed',
      steps: [
        { ...base[0], state: 'done' },
        { ...base[1], state: 'done' },
        { ...base[2], state: 'failed', label: 'Failed' },
      ],
    }
  } else if (ship === 'delivered' || (!returned && orderStatus === 'fulfilled')) {
    progress = {
      phase: 'delivered',
      label: 'Delivered',
      steps: base.map((s) => ({ ...s, state: 'done' as const })),
    }
  } else if (ship === 'out_for_delivery' || ship === 'in_transit' || ship === 'returned') {
    // `returned` keeps prior transit stage visible; delivered stays open unless shipped delivered.
    const deliveredDone = ship === 'delivered'
    progress = {
      phase: ship === 'returned' ? 'failed' : 'in_transit',
      label: ship === 'out_for_delivery' ? 'Out for delivery' : ship === 'returned' ? 'Returned' : 'On the way',
      steps: [
        { ...base[0], state: 'done' },
        { ...base[1], state: deliveredDone ? 'done' : 'active' },
        { ...base[2], state: deliveredDone ? 'done' : 'todo' },
      ],
    }
  } else if (
    ship === 'labeled' ||
    ship === 'pending' ||
    hasTrack ||
    orderStatus === '945_received' ||
    orderStatus === 'partially_fulfilled'
  ) {
    progress = {
      phase: 'dispatched',
      label: hasTrack || ship === 'labeled' ? 'Dispatched' : 'Ready to ship',
      steps: [
        { ...base[0], state: hasTrack || ship === 'labeled' ? 'done' : 'active' },
        { ...base[1], state: hasTrack ? 'active' : 'todo' },
        { ...base[2], state: 'todo' },
      ],
    }
  } else if (returned) {
    // Order marked returned but no shipment progress yet — still show the rail + return.
    progress = {
      phase: 'failed',
      label: 'Returned',
      steps: base.map((s) => ({ ...s, state: 'todo' as const })),
    }
  } else {
    progress = {
      phase: 'idle',
      label: 'Not shipped',
      steps: base.map((s) => ({ ...s, state: 'todo' as const })),
    }
  }

  if (returned) {
    return {
      ...progress,
      phase: 'failed',
      label: orderStatus === 'partially_returned' ? 'Partially returned' : 'Returned',
      steps: [...progress.steps, { id: 'returned', label: 'Returned', state: 'failed' }],
    }
  }

  return progress
}

export function OrderCarrierChip({ carrier }: { carrier?: string | null }) {
  const value = (carrier || '').trim()
  if (!value) return <span className="ol-carrier is-empty">—</span>
  return (
    <span className="ol-carrier" title={value}>
      {value}
    </span>
  )
}

export function OrderSftpCell({ status, hasWarehouse }: { status?: string; hasWarehouse?: boolean }) {
  const raw = (status || '').toLowerCase()
  if (raw === 'skipped') {
    const tip = hasWarehouse ? 'SFTP skipped' : 'No warehouse'
    return <span className="ol-sftp is-skip" data-tip={tip} title={tip} />
  }
  if (raw === 'sent') {
    return <span className="ol-sftp is-sent" data-tip="SFTP sent" title="SFTP sent" />
  }
  if (raw === 'failed') {
    return <span className="ol-sftp is-fail" data-tip="SFTP failed" title="SFTP failed" />
  }
  if (raw === 'pending') {
    return <span className="ol-sftp is-pending" data-tip="SFTP pending" title="SFTP pending" />
  }
  if (!hasWarehouse) {
    return <span className="ol-sftp is-empty" data-tip="No warehouse" title="No warehouse" />
  }
  return (
    <span
      className="ol-sftp is-empty"
      data-tip={raw ? `SFTP ${raw}` : 'SFTP not sent'}
      title={raw ? `SFTP ${raw}` : 'SFTP not sent'}
    />
  )
}

export function OrderShipProgressCell({ order }: { order: ShopOrder }) {
  const progress = getShipProgress(order)

  return (
    <div className={`ol-ship is-${progress.phase}`} title={progress.label}>
      <div className="ol-ship-rail" role="img" aria-label={progress.label}>
        {progress.steps.map((step, i) => {
          const next = progress.steps[i + 1]
          const railToReturn = next?.id === 'returned'
          return (
            <span key={step.id} className="ol-ship-node">
              <button
                type="button"
                className={`ol-dot is-${step.id} is-${step.state}`}
                data-tip={step.label}
                aria-label={step.label}
                tabIndex={-1}
                onClick={(e) => e.stopPropagation()}
              />
              {next ? (
                <span
                  className={`ol-rail is-${step.id} ${
                    railToReturn
                      ? 'is-to-return'
                      : step.state === 'done' || step.state === 'failed'
                        ? 'is-on'
                        : step.state === 'active'
                          ? 'is-mid'
                          : 'is-off'
                  }`}
                  aria-hidden
                />
              ) : null}
            </span>
          )
        })}
      </div>
    </div>
  )
}
