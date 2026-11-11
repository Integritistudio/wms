import { useState, type FormEvent } from 'react'
import {
  downloadFileLink,
  resolveFileLinkUrl,
  shipOrder,
  type Actor,
  type ShopOrder,
} from '../lib/api'
import { use945Upload } from './use945Upload'

type OrderShipActionsProps = {
  order: ShopOrder
  actor?: Actor
  fulfillmentGroupId?: string | null
  fileLink?: ShopOrder['fileLink']
  onDone: () => void
  onSuccess?: (message: string) => void
  onError: (message: string) => void
  compact?: boolean
  disabled?: boolean
}

export default function OrderShipActions({
  order,
  actor = 'platform',
  fulfillmentGroupId,
  fileLink = fulfillmentGroupId ? null : order.fileLink,
  onDone,
  onError,
  onSuccess,
  compact = false,
  disabled = false,
}: OrderShipActionsProps) {
  const [trackingNumber, setTrackingNumber] = useState(order.trackingNumber || '')
  const [carrier, setCarrier] = useState('')
  const [shipping, setShipping] = useState(false)
  const [downloading940, setDownloading940] = useState(false)
  const busy = disabled || ['cancelled', 'fulfilled', 'error', 'returned', 'partially_returned'].includes(order.status) || (!order.warehouseId && !fulfillmentGroupId)
  const { startUpload, overlay, uploading } = use945Upload({
    orderId: order.id,
    actor,
    fulfillmentGroupId: fulfillmentGroupId || undefined,
    onDone,
    onError,
  })
  const locked = busy || uploading || shipping

  const download940Button = (
    <button
      className={compact ? 'oj-live-ghost-btn' : 'demo-button demo-button-secondary ui-btn-sm'}
      type="button"
      disabled={downloading940 || !resolveFileLinkUrl(fileLink)}
      title={resolveFileLinkUrl(fileLink) ? 'Download this fulfillment path’s 940 file' : '940 file is not available yet'}
      onClick={async () => {
        if (!fileLink || downloading940) return
        setDownloading940(true)
        try {
          await downloadFileLink(fileLink)
        } catch (err) {
          onError(err instanceof Error ? err.message : 'Unable to download 940')
        } finally {
          setDownloading940(false)
        }
      }}
    >
      {downloading940 ? 'Downloading…' : 'Download 940'}
    </button>
  )

  async function onShip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (locked) return
    if (!window.confirm(`Ship order ${order.orderNumber}? This records the shipment and may sync fulfillment to Shopify.`)) return
    setShipping(true)
    try {
      const result = await shipOrder(
        order.id,
        {
          trackingNumber,
          carrier,
          ...(fulfillmentGroupId ? { fulfillmentGroupId } : {}),
        },
        actor,
      )
      if (result.shopifyError) onError(`Shipment recorded; Shopify sync failed: ${result.shopifyError}`)
      else onSuccess?.('Shipment recorded')
      onDone()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to record shipment')
    } finally {
      setShipping(false)
    }
  }

  if (compact) {
    return (
      <div className="ship-actions ship-actions--compact">
        {overlay}
        <form className="ship-compact-form" onSubmit={onShip}>
          <label className="ship-compact-field">
            <span>Tracking</span>
            <input
              className="demo-input"
              placeholder="Tracking #"
              aria-label="Tracking number"
              value={trackingNumber}
              onChange={(event) => setTrackingNumber(event.target.value)}
              required
              disabled={locked}
            />
          </label>
          <div className="ship-compact-row">
            <label className="ship-compact-field">
              <span>Carrier</span>
              <input
                className="demo-input"
                placeholder="UPS"
                aria-label="Carrier"
                value={carrier}
                onChange={(event) => setCarrier(event.target.value)}
                disabled={locked}
              />
            </label>
            <button className="oj-skel-btn oj-skel-btn--accent ship-compact-submit" type="submit" disabled={locked}>
              {shipping ? '…' : 'Ship'}
            </button>
          </div>
        </form>
        <div className="ship-compact-tools">
          {download940Button}
          <label className={`oj-live-ghost-btn${locked ? ' is-disabled' : ''}`}>
            {uploading ? 'Uploading…' : 'Upload 945'}
            <input
              className="hidden"
              type="file"
              accept=".edi,.txt,.json"
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
        {download940Button}
        <label className={`demo-button demo-button-secondary ui-btn-sm${locked ? ' is-disabled' : ''}`}>
          {uploading ? 'Uploading…' : 'Upload 945'}
          <input
            className="hidden"
            type="file"
            accept=".edi,.txt,.json"
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
