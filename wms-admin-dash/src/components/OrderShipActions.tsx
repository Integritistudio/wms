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
  onDone: () => void
  onError: (message: string) => void
}

export default function OrderShipActions({
  order,
  actor = 'platform',
  onDone,
  onError,
}: OrderShipActionsProps) {
  const [trackingNumber, setTrackingNumber] = useState(order.trackingNumber || '')
  const [carrier, setCarrier] = useState(order.carrier || 'UPS')
  const busy = order.status === 'cancelled' || order.status === 'fulfilled'

  async function onShip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      await shipOrder(order.id, { trackingNumber, carrier }, actor)
      onDone()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to record shipment')
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <form className="flex flex-wrap gap-2" onSubmit={onShip}>
        <input
          className="demo-input max-w-[10rem]"
          placeholder="Tracking"
          value={trackingNumber}
          onChange={(event) => setTrackingNumber(event.target.value)}
          required
          disabled={busy}
        />
        <input
          className="demo-input max-w-[7rem]"
          placeholder="Carrier"
          value={carrier}
          onChange={(event) => setCarrier(event.target.value)}
          disabled={busy}
        />
        <button className="demo-button px-3 py-2 text-xs" type="submit" disabled={busy}>
          Ship
        </button>
      </form>
      <div className="flex flex-wrap gap-2">
        <button
          className="demo-button demo-button-secondary px-3 py-2 text-xs"
          type="button"
          onClick={() => void downloadSample945(order.id, actor).catch((err) => {
            onError(err instanceof Error ? err.message : 'Unable to download sample 945')
          })}
        >
          Sample 945
        </button>
        <label className="demo-button demo-button-secondary px-3 py-2 text-xs">
          Upload 945
          <input
            className="hidden"
            type="file"
            accept=".edi,.txt,.json,*"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (!file) {
                return
              }
              void upload945(order.id, file, actor)
                .then(onDone)
                .catch((err) => onError(err instanceof Error ? err.message : '945 upload failed'))
            }}
          />
        </label>
      </div>
    </div>
  )
}
