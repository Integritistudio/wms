import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Alert, Button, Modal } from '../ui'

export default function ShopifySyncConfirm({
  kind, target, busy, error, onCancel, onConfirm,
}: {
  kind: 'catalog' | 'inventory'
  target: string
  busy: boolean
  error?: string
  onCancel: () => void
  onConfirm: () => void
}) {
  const [acknowledged, setAcknowledged] = useState(false)
  const inventory = kind === 'inventory'
  const title = inventory ? 'Final confirmation: overwrite Shopify inventory?' : 'Confirm product catalog sync'

  return (
    <Modal open title={title} onClose={() => { if (!busy) onCancel() }} className="users-dialog stores-dialog">
      <div className="users-dialog-body shopify-sync-confirm" aria-busy={busy}>
        <header className="users-dialog-hero">
          <span className="shopify-sync-confirm-icon"><AlertTriangle size={26} aria-hidden /></span>
          <div><h2>{title}</h2><p>{target}</p></div>
        </header>
        <Alert tone={inventory ? 'danger' : 'warning'} title={inventory ? 'This will change stock in your Shopify store' : 'Product links in this platform will be refreshed'}>
          {inventory ? (
            <ul>
              <li>WMS available quantities will replace Shopify inventory at mapped locations.</li>
              <li>Products missing from WMS can receive zero stock and become unavailable for sale.</li>
              <li>Every connected store affected by this stock push may be updated.</li>
              <li>Shopify products are not deleted by this sync. Existing inventory quantities can be overwritten.</li>
            </ul>
          ) : (
            <ul>
              <li>Product and variant details will be imported from the selected Shopify store into this platform.</li>
              <li>Existing SKU links will be refreshed. Links for deleted variants or changed SKUs will have sync disabled.</li>
              <li>This catalog import does not delete Shopify products or overwrite Shopify stock. Pushing stock is a separate action.</li>
            </ul>
          )}
        </Alert>
        <p className="shopify-sync-confirm-note">{inventory ? 'Verify your WMS stock and location mappings before continuing. Do not change products, inventory, warehouse links, or Shopify settings while sync is running. Updates may already have been applied if sync later fails; cancelling this dialog cannot undo a started sync.' : 'Check that the store and SKU values are correct before continuing.'}</p>
        <label className="shopify-sync-confirm-ack">
          <input type="checkbox" checked={acknowledged} disabled={busy} onChange={(event) => setAcknowledged(event.target.checked)} />
          <span>{inventory ? 'I understand that Shopify inventory will be overwritten and products may become unavailable for sale.' : 'I understand that this refreshes product links for the selected Shopify store.'}</span>
        </label>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <footer className="users-dialog-footer">
          <Button variant="secondary" disabled={busy} onClick={onCancel}>Cancel</Button>
          <Button variant={inventory ? 'danger' : 'primary'} disabled={busy || !acknowledged} onClick={() => { if (acknowledged && !busy) onConfirm() }}>
            {busy ? 'Syncing…' : inventory ? 'Overwrite inventory & sync' : 'Confirm catalog sync'}
          </Button>
        </footer>
      </div>
    </Modal>
  )
}
