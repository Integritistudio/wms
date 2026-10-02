import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link2, Pencil, RefreshCw, Store } from 'lucide-react'
import {
  connectCompanyShop,
  listCompanyStores,
  listShopShopifyLocations,
  saveStoreWarehouses,
  syncStoreInventory,
  updateCompanyStore,
  type Shop,
  type Warehouse,
  type ShopifyLocationOption,
} from '../../lib/api'
import { useCompanyPortal } from './CompanyPortalContext'
import { Alert, Button, FormField, Modal, StatusBadge } from '../ui'

function storeStatus(shop: Shop): { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' } {
  if (!shop.enabled) return { label: 'Disabled', variant: 'neutral' }
  if (!shop.installed) return { label: 'Awaiting install', variant: 'warning' }
  if (shop.inventorySyncError) return { label: 'Sync issue', variant: 'danger' }
  if (shop.inventorySyncPending) return { label: 'Sync pending', variant: 'info' }
  return { label: 'Connected', variant: 'success' }
}

function StoreCard({
  shop,
  warehouses,
  onEdit,
  reload,
}: {
  shop: Shop
  warehouses: Warehouse[]
  onEdit: (shop: Shop) => void
  reload: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const status = storeStatus(shop)
  const linked = shop.warehouseIds ?? (shop.warehouseId ? [shop.warehouseId] : [])
  const needsReconnect = (error || shop.inventorySyncError || '').match(
    /locations|read_locations|ACCESS_DENIED|Access denied/i,
  )

  return (
    <article className="stores-card">
      <header className="stores-card-head">
        <div className="stores-card-identity">
          <span className="stores-card-icon" aria-hidden>
            <Store size={18} />
          </span>
          <div>
            <strong className="stores-card-domain">{shop.shopDomain}</strong>
            <span className="stores-card-meta">
              {linked.length} warehouse{linked.length === 1 ? '' : 's'} linked
              {shop.inventorySyncedAt
                ? ` · Last sync ${new Date(shop.inventorySyncedAt).toLocaleString()}`
                : ''}
            </span>
          </div>
        </div>
        <StatusBadge status={status.label} label={status.label} variant={status.variant} />
      </header>

      {error || shop.inventorySyncError ? (
        <Alert tone="danger">{error || shop.inventorySyncError}</Alert>
      ) : null}
      {needsReconnect && shop.reconnectUrl ? (
        <Alert tone="warning">
          This store&apos;s Shopify token is missing location permission. Click{' '}
          <a className="demo-link" href={shop.reconnectUrl} target="_blank" rel="noreferrer">
            Reconnect Shopify app
          </a>{' '}
          and approve scopes, then Sync inventory again.
        </Alert>
      ) : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      <div className="stores-card-body">
        <div className="stores-wh-block">
          <div className="stores-wh-head">
            <strong>Connected warehouses</strong>
            <span>Edit the store to change links, location, or status</span>
          </div>
          <div className="stores-wh-grid">
            {warehouses
              .filter((w) => linked.includes(w.id))
              .map((warehouse) => (
                <span key={warehouse.id} className="stores-wh-row is-on is-readonly">
                  {warehouse.name}
                </span>
              ))}
            {!linked.length ? <p className="stores-empty-hint">No warehouses linked yet.</p> : null}
          </div>
        </div>
      </div>

      <footer className="stores-card-actions">
        <button type="button" className="demo-btn demo-btn-sm" onClick={() => onEdit(shop)}>
          <Pencil size={14} aria-hidden />
          Edit
        </button>
        {shop.installUrl ? (
          <a
            className="demo-btn demo-btn-sm"
            href={shop.reconnectUrl || shop.installUrl}
            target="_blank"
            rel="noreferrer"
          >
            <Link2 size={14} aria-hidden />
            {needsReconnect
              ? 'Reconnect Shopify'
              : shop.installed
                ? 'Reconnect app'
                : 'Install Shopify app'}
          </a>
        ) : null}
        {shop.installed ? (
          <button
            type="button"
            className="demo-btn demo-btn-sm"
            disabled={busy}
            onClick={() => {
              void (async () => {
                setBusy(true)
                setError('')
                try {
                  await syncStoreInventory(shop.id)
                  setNotice('Inventory sync queued')
                  await reload()
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Unable to queue sync')
                } finally {
                  setBusy(false)
                }
              })()
            }}
          >
            Sync inventory
          </button>
        ) : null}
      </footer>
    </article>
  )
}

export default function CompanyStoresPanel() {
  const { company, refresh, isRoot } = useCompanyPortal()
  const warehouses = company?.warehouses || []
  const [stores, setStores] = useState<Shop[]>([])
  const [domain, setDomain] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<Shop | null>(null)
  const [editSelected, setEditSelected] = useState<string[]>([])
  const [editLocation, setEditLocation] = useState('')
  const [editEnabled, setEditEnabled] = useState(true)
  const [locations, setLocations] = useState<ShopifyLocationOption[]>([])
  const [editBusy, setEditBusy] = useState(false)

  const reload = useCallback(async () => {
    setStores(await listCompanyStores())
  }, [])

  useEffect(() => {
    const load = () => {
      void reload()
        .then(() => setError(''))
        .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load stores'))
        .finally(() => setLoading(false))
    }
    load()
    const timer = setInterval(load, 15000)
    return () => clearInterval(timer)
  }, [reload])

  useEffect(() => {
    if (!editing?.installed || !editing.enabled) {
      setLocations([])
      return
    }
    let cancelled = false
    void listShopShopifyLocations(editing.id)
      .then((rows) => {
        if (!cancelled) setLocations(rows)
      })
      .catch(() => {
        if (!cancelled) setLocations([])
      })
    return () => {
      cancelled = true
    }
  }, [editing])

  const counts = useMemo(() => {
    let connected = 0
    let pending = 0
    for (const s of stores) {
      if (s.installed && s.enabled && !s.inventorySyncError) connected += 1
      else pending += 1
    }
    return { total: stores.length, connected, pending }
  }, [stores])

  function openEdit(shop: Shop) {
    setEditing(shop)
    setEditSelected(shop.warehouseIds ?? (shop.warehouseId ? [shop.warehouseId] : []))
    setEditLocation(shop.inventoryLocationGid || '')
    setEditEnabled(Boolean(shop.enabled))
    setError('')
  }

  async function add(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await connectCompanyShop({ shopDomain: domain.trim(), warehouseIds: [] })
      setDomain('')
      setAddOpen(false)
      await reload()
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add store')
    } finally {
      setBusy(false)
    }
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault()
    if (!editing || editBusy) return
    setEditBusy(true)
    setError('')
    try {
      if (editEnabled !== editing.enabled) {
        await updateCompanyStore(editing.id, { enabled: editEnabled })
      }
      await saveStoreWarehouses(editing.id, editSelected, editLocation || undefined)
      setEditing(null)
      await reload()
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update store')
    } finally {
      setEditBusy(false)
    }
  }

  return (
    <section className="stores-section" aria-label="Company stores">
      <div className="stores-section-head">
        <div>
          <div className="stores-kicker">
            <Store size={14} aria-hidden />
            Shopify
          </div>
          <h2>Company stores</h2>
          <p>Link Shopify stores to warehouses. WMS owns inventory after the first sync.</p>
        </div>
        <div className="stores-section-actions">
          <button
            type="button"
            className="orders-refresh-btn"
            onClick={() => {
              setLoading(true)
              void reload().finally(() => setLoading(false))
            }}
            disabled={loading}
            aria-label="Refresh stores"
            title="Refresh"
          >
            <RefreshCw size={15} className={loading ? 'oj-skel-spin' : undefined} aria-hidden />
          </button>
          {isRoot ? (
            <button type="button" className="demo-btn demo-btn-sm stores-add-cta" onClick={() => setAddOpen(true)}>
              <Store size={14} aria-hidden />
              Add store
            </button>
          ) : null}
        </div>
      </div>

      <div className="stores-stats" aria-label="Store summary">
        <div className="stores-stat">
          <span className="stores-stat-label">Stores</span>
          <strong className="stores-stat-value">{counts.total}</strong>
        </div>
        <div className="stores-stat is-ok">
          <span className="stores-stat-label">Connected</span>
          <strong className="stores-stat-value">{counts.connected}</strong>
        </div>
        <div className={`stores-stat${counts.pending > 0 ? ' is-warn' : ''}`}>
          <span className="stores-stat-label">Needs setup</span>
          <strong className="stores-stat-value">{counts.pending}</strong>
        </div>
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {!isRoot ? (
        <p className="stores-root-note">Only the company root can add Shopify stores.</p>
      ) : null}

      <div className="stores-list">
        {stores.map((shop) => (
          <StoreCard
            key={shop.id}
            shop={shop}
            warehouses={warehouses}
            onEdit={openEdit}
            reload={reload}
          />
        ))}
        {!stores.length && !loading ? (
          <div className="stores-empty">
            <Store size={28} aria-hidden />
            <strong>No stores yet</strong>
            <p>{isRoot ? 'Add a Shopify domain to connect your first store.' : 'Ask a company root to add a store.'}</p>
          </div>
        ) : null}
      </div>

      <Modal
        open={addOpen}
        onClose={() => {
          if (!busy) setAddOpen(false)
        }}
        title="Add Shopify store"
        description="Connect a store domain, then install the app and link warehouses."
        className="users-dialog stores-dialog"
      >
        <form className="users-dialog-body" onSubmit={add} aria-busy={busy}>
          <header className="users-dialog-hero">
            <div className="users-dialog-hero-icon" aria-hidden>
              <Store size={22} />
            </div>
            <div>
              <h2>Add store</h2>
              <p>Enter the myshopify.com domain. You can install the app and map warehouses next.</p>
            </div>
          </header>

          <FormField label="Shopify store domain">
            <input
              className="demo-input"
              value={domain}
              required
              placeholder="your-store.myshopify.com"
              onChange={(e) => setDomain(e.target.value)}
              autoComplete="off"
            />
          </FormField>

          <footer className="users-dialog-footer">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy} aria-busy={busy}>
              {busy ? 'Adding…' : 'Add store'}
            </Button>
          </footer>
        </form>
      </Modal>

      <Modal
        open={Boolean(editing)}
        onClose={() => {
          if (!editBusy) setEditing(null)
        }}
        title={editing ? `Edit ${editing.shopDomain}` : 'Edit store'}
        description="Update warehouses, inventory location, and enabled status."
        className="users-dialog stores-dialog"
      >
        {editing ? (
          <form className="users-dialog-body" onSubmit={saveEdit} aria-busy={editBusy}>
            <header className="users-dialog-hero">
              <div className="users-dialog-hero-icon is-edit" aria-hidden>
                <Pencil size={22} />
              </div>
              <div>
                <h2>Edit store</h2>
                <p>{editing.shopDomain}</p>
              </div>
            </header>

            <label className={`stores-enable-row${editEnabled ? ' is-on' : ''}`}>
              <input
                type="checkbox"
                checked={editEnabled}
                onChange={(e) => setEditEnabled(e.target.checked)}
              />
              <span>
                <strong>Store enabled</strong>
                <span>Disable to pause inventory sync and routing for this shop</span>
              </span>
            </label>

            <div className="stores-wh-block">
              <div className="stores-wh-head">
                <strong>Connected warehouses</strong>
                <span>Available SKU qty is summed across these locations</span>
              </div>
              <div className="stores-wh-grid">
                {warehouses.map((warehouse) => {
                  const on = editSelected.includes(warehouse.id)
                  return (
                    <label key={warehouse.id} className={`stores-wh-row${on ? ' is-on' : ''}`}>
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={!warehouse.isActive && !on}
                        onChange={(e) =>
                          setEditSelected((ids) =>
                            e.target.checked
                              ? [...ids, warehouse.id]
                              : ids.filter((id) => id !== warehouse.id),
                          )
                        }
                      />
                      <span>
                        {warehouse.name}
                        {!warehouse.isActive ? ' (inactive)' : ''}
                      </span>
                    </label>
                  )
                })}
                {!warehouses.length ? (
                  <p className="stores-empty-hint">Add a warehouse first, then link it here.</p>
                ) : null}
              </div>
            </div>

            {editing.installed ? (
              <FormField label="Shopify inventory location">
                <select
                  className="demo-input"
                  value={editLocation}
                  disabled={editBusy}
                  onChange={(e) => setEditLocation(e.target.value)}
                >
                  <option value="">Select a location…</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </FormField>
            ) : null}

            <footer className="users-dialog-footer">
              <Button type="button" variant="secondary" disabled={editBusy} onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={editBusy} aria-busy={editBusy}>
                {editBusy ? 'Saving…' : 'Save store'}
              </Button>
            </footer>
          </form>
        ) : null}
      </Modal>
    </section>
  )
}
