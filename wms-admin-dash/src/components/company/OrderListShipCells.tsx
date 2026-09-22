import type { ShopOrder } from '../../lib/api'

type StepState = 'todo' | 'active' | 'done' | 'failed'

export type ShipProgress = {
  phase: 'idle' | 'dispatched' | 'in_transit' | 'delivered' | 'failed'
  label: string
  steps: Array<{ id: string; label: string; state: StepState }>
}

export function getShipProgress(order: ShopOrder): ShipProgress {
  const ship = (order.shipmentStatus || '').toLowerCase()
  const orderStatus = (order.status || '').toLowerCase()
  const hasTrack = Boolean(order.trackingNumber)

  const steps = [
    { id: 'dispatched', label: 'Dispatched' },
    { id: 'in_transit', label: 'On the way' },
    { id: 'delivered', label: 'Delivered' },
  ]

  if (ship === 'failed' || ship === 'returned') {
    return {
      phase: 'failed',
      label: ship === 'returned' ? 'Returned' : 'Delivery failed',
      steps: [
        { ...steps[0], state: 'done' },
        { ...steps[1], state: 'done' },
        { ...steps[2], state: 'failed', label: ship === 'returned' ? 'Returned' : 'Failed' },
      ],
    }
  }

  if (ship === 'delivered' || orderStatus === 'fulfilled') {
    return {
      phase: 'delivered',
      label: 'Delivered',
      steps: steps.map((s) => ({ ...s, state: 'done' as const })),
    }
  }

  if (ship === 'out_for_delivery' || ship === 'in_transit') {
    return {
      phase: 'in_transit',
      label: ship === 'out_for_delivery' ? 'Out for delivery' : 'On the way',
      steps: [
        { ...steps[0], state: 'done' },
        { ...steps[1], state: 'active' },
        { ...steps[2], state: 'todo' },
      ],
    }
  }

  if (
    ship === 'labeled' ||
    ship === 'pending' ||
    hasTrack ||
    orderStatus === '945_received' ||
    orderStatus === 'partially_fulfilled'
  ) {
    return {
      phase: 'dispatched',
      label: hasTrack || ship === 'labeled' ? 'Dispatched' : 'Ready to ship',
      steps: [
        { ...steps[0], state: hasTrack || ship === 'labeled' ? 'done' : 'active' },
        { ...steps[1], state: hasTrack ? 'active' : 'todo' },
        { ...steps[2], state: 'todo' },
      ],
    }
  }

  return {
    phase: 'idle',
    label: 'Not shipped',
    steps: steps.map((s) => ({ ...s, state: 'todo' as const })),
  }
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
  if (raw === 'sent') {
    return <span className="ol-sftp is-sent" data-tip="SFTP sent" title="SFTP sent" />
  }
  const tip =
    raw === 'failed'
      ? 'SFTP failed'
      : raw === 'pending'
        ? 'SFTP pending'
        : raw === 'skipped'
          ? hasWarehouse
            ? 'SFTP skipped'
            : 'No warehouse'
          : !raw
            ? hasWarehouse
              ? 'SFTP not sent'
              : 'SFTP not set'
            : `SFTP ${raw}`
  return <span className="ol-sftp is-miss" data-tip={tip} title={tip} />
}

export function OrderShipProgressCell({ order }: { order: ShopOrder }) {
  const progress = getShipProgress(order)

  return (
    <div className={`ol-ship is-${progress.phase}`} title={progress.label}>
      <div className="ol-ship-rail" role="img" aria-label={progress.label}>
        {progress.steps.map((step, i) => (
          <span key={step.id} className="ol-ship-node">
            <button
              type="button"
              className={`ol-dot is-${step.id} is-${step.state}`}
              data-tip={step.label}
              aria-label={step.label}
              tabIndex={-1}
              onClick={(e) => e.stopPropagation()}
            />
            {i < progress.steps.length - 1 ? (
              <span
                className={`ol-rail is-${step.id} is-${
                  step.state === 'done' || step.state === 'failed'
                    ? 'on'
                    : step.state === 'active'
                      ? 'mid'
                      : 'off'
                }`}
                aria-hidden
              />
            ) : null}
          </span>
        ))}
      </div>
    </div>
  )
}
