import { useState, type FormEvent } from 'react'
import {
  downloadSample945,
  shipOrder,
  type Actor,
  type ShopOrder,
} from '../lib/api'
import { use945Upload } from './use945Upload'

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
  const [shipping, setShipping] = useState(false)
  const busy = order.status === 'cancelled' || order.status === 'fulfilled'
  const { startUpload, overlay, uploading } = use945Upload({
    orderId: order.id,
    actor,
    fulfillmentGroupId: fulfillmentGroupId || undefined,
    onDone,
    onError,
  })
  const locked = busy || uploading || shipping

  async function onShip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (locked) return
    setShipping(true)
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
    } finally {
      setShipping(false)
    }
  }

  return (
    <div className="ship-actions">
      {overlay}
      <form className="ship-actions-row" onSubmit={onShip}>
        <input
          className="demo-input"
          placeholder="Tracking #"
          aria-label="Tracking number"
          value={trackingNumber}
          onChange={(event) => setTrackingNumber(event.target.value)}
          required
          disabled={locked}
        />
        <input
          className="demo-input"
          placeholder="Carrier"
          aria-label="Carrier"
          value={carrier}
          onChange={(event) => setCarrier(event.target.value)}
          disabled={locked}
        />
        <button className="demo-button ui-btn-sm" type="submit" disabled={locked}>
          {shipping ? 'Shipping…' : 'Ship'}
        </button>
      </form>
      <div className="ship-actions-row">
        <button
          className="demo-button demo-button-secondary ui-btn-sm"
          type="button"
          disabled={locked}
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
        <label className={`demo-button demo-button-secondary ui-btn-sm${locked ? ' is-disabled' : ''}`}>
          {uploading ? 'Uploading…' : 'Upload 945'}
          <input
            className="hidden"
            type="file"
            accept=".edi,.txt,.json,*"
            disabled={locked}
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (!file || locked) return
              startUpload(file)
            }}
          />
        </label>
      </div>
    </div>
  )
}
