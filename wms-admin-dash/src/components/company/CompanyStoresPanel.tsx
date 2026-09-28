import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { connectCompanyShop, listCompanyStores, listShopShopifyLocations, saveStoreWarehouses, syncStoreInventory,
  type Shop, type Warehouse, type ShopifyLocationOption } from '../../lib/api'
import { useCompanyPortal } from './CompanyPortalContext'
import { Alert, FormField } from '../ui'

function StoreCard({ shop, warehouses, reload }: { shop: Shop; warehouses: Warehouse[]; reload: () => Promise<void> }) {
  const [selected, setSelected] = useState<string[]>(shop.warehouseIds ?? (shop.warehouseId ? [shop.warehouseId] : []))
  const [location, setLocation] = useState(shop.inventoryLocationGid || '')
  const [locations, setLocations] = useState<ShopifyLocationOption[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => {
    if (!shop.installed || !shop.enabled) return
    let cancelled = false
    void listShopShopifyLocations(shop.id).then((rows) => { if (!cancelled) setLocations(rows) })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load Shopify locations') })
    return () => { cancelled = true }
  }, [shop.id, shop.installed, shop.enabled])
  async function save() {
    setBusy(true); setError(''); setNotice('')
    try {
      await saveStoreWarehouses(shop.id, selected, location || undefined)
      setNotice(shop.installed ? 'Warehouses saved. Inventory sync queued.' : 'Warehouses saved. Install the app to start syncing.')
      await reload()
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to save store') }
    finally { setBusy(false) }
  }
  return <article className="grid gap-3 rounded-lg border border-[var(--border)] p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <strong>{shop.shopDomain}</strong>
      <span>{!shop.enabled ? 'Disabled' : !shop.installed ? 'Awaiting installation' : shop.inventorySyncError ? 'Sync needs attention' : shop.inventorySyncPending ? 'Sync pending' : 'Connected'}</span>
    </div>
    {error || shop.inventorySyncError ? <Alert tone="danger">{error || shop.inventorySyncError}</Alert> : null}
    {notice ? <Alert tone="success">{notice}</Alert> : null}
    <fieldset disabled={busy} className="grid gap-2">
      <legend className="mb-2">Connected warehouses</legend>
      {warehouses.map((warehouse) => <label key={warehouse.id} className="flex items-center gap-2">
        <input type="checkbox" checked={selected.includes(warehouse.id)} disabled={!warehouse.isActive && !selected.includes(warehouse.id)}
          onChange={(e) => setSelected((ids) => e.target.checked ? [...ids, warehouse.id] : ids.filter((id) => id !== warehouse.id))} />
        {warehouse.name}{!warehouse.isActive ? ' (inactive)' : ''}
      </label>)}
      {!warehouses.length ? <p>Add a warehouse below, then connect it to this store.</p> : null}
    </fieldset>
    <p className="demo-muted text-sm">Available quantities for each SKU are added across these warehouses. Stock is shared with every other connected store. With no warehouses selected, WMS-managed stock is zero.</p>
    {shop.installed ? <FormField label="Shopify inventory location">
      <select className="demo-input" value={location || shop.inventoryLocationGid || ''} disabled={busy} onChange={(e) => setLocation(e.target.value)}>
        <option value="">Select a location…</option>
        {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
      <p className="demo-muted text-sm">The combined quantity is published once at this location. Other Shopify locations are not included unless previously managed by WMS.</p>
    </FormField> : null}
    <div className="flex flex-wrap gap-2">
      <button type="button" className="demo-button" disabled={busy} onClick={() => void save()}>Save warehouses</button>
      {shop.installUrl ? <a className="demo-btn" href={shop.installed ? shop.reconnectUrl : shop.installUrl} target="_blank" rel="noreferrer">{shop.installed ? 'Open Shopify app' : 'Install Shopify app'}</a> : null}
      {shop.installed ? <button type="button" className="demo-btn" disabled={busy} onClick={async () => {
        setBusy(true); setError('')
        try { await syncStoreInventory(shop.id); setNotice('Inventory sync queued'); await reload() }
        catch (err) { setError(err instanceof Error ? err.message : 'Unable to queue sync') }
        finally { setBusy(false) }
      }}>Sync inventory</button> : null}
    </div>
    {shop.inventorySyncedAt ? <small className="demo-muted">Last synced: {new Date(shop.inventorySyncedAt).toLocaleString()}</small> : null}
  </article>
}

export default function CompanyStoresPanel() {
  const { company, refresh } = useCompanyPortal()
  const [stores, setStores] = useState<Shop[]>([])
  const [domain, setDomain] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const reload = useCallback(async () => { setStores(await listCompanyStores()) }, [])
  useEffect(() => {
    const load = () => { void reload().catch((err) => setError(err instanceof Error ? err.message : 'Unable to load stores')) }
    load()
    const timer = setInterval(load, 15000)
    return () => clearInterval(timer)
  }, [reload])
  async function add(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try { await connectCompanyShop({ shopDomain: domain.trim(), warehouseIds: [] }); setDomain(''); await reload(); await refresh() }
    catch (err) { setError(err instanceof Error ? err.message : 'Unable to add store') }
    finally { setBusy(false) }
  }
  return <section className="grid gap-4 rounded-lg border border-[var(--border)] p-4" aria-label="Company stores">
    <div><h2>Company stores</h2><p>Add your Shopify stores, select their warehouses, then install the app. WMS controls inventory from the first sync.</p></div>
    {error ? <Alert tone="danger">{error}</Alert> : null}
    <form className="flex flex-wrap items-end gap-3" onSubmit={add}>
      <FormField label="Shopify store domain"><input className="demo-input" value={domain} required placeholder="your-store.myshopify.com" onChange={(e) => setDomain(e.target.value)} /></FormField>
      <button className="demo-button" disabled={busy} type="submit">{busy ? 'Adding…' : 'Add store'}</button>
    </form>
    {stores.map((shop) => <StoreCard key={shop.id} shop={shop} warehouses={company?.warehouses || []} reload={reload} />)}
    {!stores.length ? <p className="demo-muted">No stores added yet.</p> : null}
  </section>
}
