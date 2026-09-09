import { useState, type FormEvent } from 'react'
import {
  downloadSample945,
  shipOrder,
  upload945,
  type Actor,
  type ShopOrder,
} from '../lib/api'

type OrderShipActionsProps = {
  order: ShopOrder
  actor?: Actor
  fulfillmentGroupId?: string | null
  onDone: () => void
  onError: (message: string) => void
}

export default function OrderShipActions({
  order,
  actor = 'platform',
  fulfillmentGroupId,
  onDone,
  onError,
}: OrderShipActionsProps) {
  const [trackingNumber, setTrackingNumber] = useState(order.trackingNumber || '')
  const [carrier, setCarrier] = useState(order.carrier || 'UPS')
  const busy = order.status === 'cancelled' || order.status === 'fulfilled'

  async function onShip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      await shipOrder(
        order.id,
        {
          trackingNumber,
          carrier,
          ...(fulfillmentGroupId ? { fulfillmentGroupId } : {}),
        },
        actor,
      )
      onDone()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to record shipment')
    }
  }

  return (
    <div className="ship-actions">
      <form className="ship-actions-row" onSubmit={onShip}>
        <input
          className="demo-input"
          placeholder="Tracking #"
          aria-label="Tracking number"
          value={trackingNumber}
          onChange={(event) => setTrackingNumber(event.target.value)}
          required
          disabled={busy}
        />
        <input
          className="demo-input"
          placeholder="Carrier"
          aria-label="Carrier"
          value={carrier}
          onChange={(event) => setCarrier(event.target.value)}
          disabled={busy}
        />
        <button className="demo-button ui-btn-sm" type="submit" disabled={busy}>
          Ship
        </button>
      </form>
      <div className="ship-actions-row">
        <button
          className="demo-button demo-button-secondary ui-btn-sm"
          type="button"
          onClick={() =>
            void downloadSample945(order.id, actor, {
              trackingNumber: trackingNumber || undefined,
              carrier: carrier || undefined,
              fulfillmentGroupId: fulfillmentGroupId || undefined,
            }).catch((err) => {
              onError(err instanceof Error ? err.message : 'Unable to download sample 945')
            })
          }
        >
          Sample 945
        </button>
        <label className="demo-button demo-button-secondary ui-btn-sm">
          Upload 945
          <input
            className="hidden"
            type="file"
            accept=".edi,.txt,.json,*"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (!file) return
              void upload945(order.id, file, actor, {
                fulfillmentGroupId: fulfillmentGroupId || undefined,
              })
                .then(onDone)
                .catch((err) => onError(err instanceof Error ? err.message : '945 upload failed'))
            }}
          />
        </label>
      </div>
    </div>
  )
}
