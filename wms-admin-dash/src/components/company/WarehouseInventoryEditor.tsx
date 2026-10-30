import FormField from './WarehouseField'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  deleteInventoryItem,
  getWarehouseInventory,
  listProductLinks,
  listShopShopifyLocations,
  listWarehouseShopifyLocations,
  pushWarehouseInventoryToShopify,
  saveWarehouseInventory,
  setWarehouseShopifyLocation,
  syncShopifyCatalog,
  updateProductLink,
  type InventoryItem,
  type ProductLink,
  type ShopifyLocationOption,
  type WarehouseShopifyLocationMap,
} from '../../lib/api'
import { useCompanyPortal } from './CompanyPortalContext'
import { Alert, DataTable, ListToolbar, StatusBadge } from '../ui'

export type WarehouseStockSummary = { warehouseId: string; loading: boolean; skus: number; onHand: number; available: number; reserved: number }

export default function WarehouseInventoryEditor({
  warehouseId,
  warehouseName,
  onError,
  onSummaryChange,
}: {
  warehouseId: string
  onSummaryChange?: (summary: WarehouseStockSummary) => void
  warehouseName?: string
  onError?: (message: string) => void
}) {
  const { company } = useCompanyPortal()
  const shops = useMemo(
    () => (company?.shops || []).filter((s) => s.installed && s.enabled),
    [company?.shops],
  )

  const [items, setItems] = useState<InventoryItem[]>([])
  const [links, setLinks] = useState<ProductLink[]>([])
  const [locationMaps, setLocationMaps] = useState<WarehouseShopifyLocationMap[]>([])
  const [shopLocations, setShopLocations] = useState<ShopifyLocationOption[]>([])
  const [loading, setLoading] = useState(true)
  const [sku, setSku] = useState('')
  const [qty, setQty] = useState('10')
  const [mode, setMode] = useState<'add' | 'set'>('add')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState('')
  const [localNotice, setLocalNotice] = useState('')
  const [selectedShopId, setSelectedShopId] = useState('')
  const [selectedLocationGid, setSelectedLocationGid] = useState('')

  async function load(opts?: { silent?: boolean }) {
    if (!opts?.silent) setLoading(true)
    try {
      const [nextItems, nextLinks, nextMaps] = await Promise.all([
        getWarehouseInventory(warehouseId),
        listProductLinks(),
        listWarehouseShopifyLocations(warehouseId),
      ])
      setItems(Array.isArray(nextItems) ? nextItems : [])
      setLinks(Array.isArray(nextLinks) ? nextLinks : [])
      setLocationMaps(Array.isArray(nextMaps) ? nextMaps : [])
      setLocalError('')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load inventory'
      setLocalError(message)
      onError?.(message)
      if (!opts?.silent) {
        setItems([])
        setLinks([])
      }
    } finally {
      if (!opts?.silent) setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId])

  useEffect(() => {
    if (!selectedShopId) {
      setShopLocations([])
      setSelectedLocationGid('')
      return
    }
    let cancelled = false
    void listShopShopifyLocations(selectedShopId)
      .then((rows) => {
        if (cancelled) return
        setShopLocations(Array.isArray(rows) ? rows : [])
        const existing = locationMaps.find((m) => m.shopId === selectedShopId)
        setSelectedLocationGid(existing?.locationGid || '')
      })
      .catch((err) => {
        if (cancelled) return
        const message = err instanceof Error ? err.message : 'Unable to load Shopify locations'
        setLocalError(message)
      })
    return () => {
      cancelled = true
    }
  }, [selectedShopId, locationMaps])

  useEffect(() => {
    if (!selectedShopId && shops[0]?.id) {
      setSelectedShopId(shops[0].id)
    }
  }, [shops, selectedShopId])

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    return query ? items.filter(item => item.sku.toLowerCase().includes(query)) : items
  }, [items, q])
  const totals = useMemo(() => items.reduce((sum, item) => ({
    onHand: sum.onHand + (item.quantityOnHand || 0),
    available: sum.available + (item.quantityAvailable || 0),
    reserved: sum.reserved + (item.reserved || 0),
  }), { onHand: 0, available: 0, reserved: 0 }), [items])

  useEffect(() => {
    onSummaryChange?.({ warehouseId, loading, skus: items.length, ...totals })
  }, [onSummaryChange, warehouseId, loading, items.length, totals])

  const linksBySku = useMemo(() => {
    const map = new Map<string, ProductLink[]>()
    for (const link of links) {
      const key = link.sku.toLowerCase()
      const list = map.get(key) || []
      list.push(link)
      map.set(key, list)
    }
    return map
  }, [links])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    event.stopPropagation()
    const nextSku = sku.trim()
    const amount = Number(qty)
    if (!nextSku || !Number.isSafeInteger(amount) || amount < 0) {
      const message = 'Enter a SKU and a non-negative whole-number quantity'
      setLocalError(message)
      onError?.(message)
      return
    }
    setBusy(true)
    setLocalError('')
    setLocalNotice('')
    try {
      if (mode === 'add') {
        await saveWarehouseInventory(warehouseId, [{ sku: nextSku, adjustBy: amount }])
      } else {
        await saveWarehouseInventory(warehouseId, [{ sku: nextSku, quantityOnHand: amount }])
      }
      setSku('')
      setQty('10')
      setLocalNotice(
        mode === 'add' ? `Added ${amount} to ${nextSku}` : `Set ${nextSku} on-hand to ${amount}`,
      )
      await load()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to save product'
      setLocalError(message)
      onError?.(message)
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove(skuToRemove: string) {
    const skuKey = String(skuToRemove || '').trim()
    if (!skuKey || busy) return

    const previous = items
    setBusy(true)
    setLocalError('')
    setLocalNotice('')
    setItems((prev) => prev.filter((item) => item.sku !== skuKey))

    try {
      await deleteInventoryItem(warehouseId, skuKey)
      setLocalNotice(`Removed ${skuKey}`)
      void load({ silent: true })
    } catch (err) {
      setItems(previous)
      const message = err instanceof Error ? err.message : 'Unable to remove'
      setLocalError(message)
      onError?.(message)
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveLocation() {
    if (!selectedShopId || !selectedLocationGid) {
      setLocalError('Pick a shop and Shopify location')
      return
    }
    setBusy(true)
    setLocalError('')
    try {
      const loc = shopLocations.find((l) => l.id === selectedLocationGid)
      await setWarehouseShopifyLocation(warehouseId, {
        shopId: selectedShopId,
        locationGid: selectedLocationGid,
        locationName: loc?.name || '',
      })
      setLocalNotice('Shopify location mapped for this warehouse')
      await load({ silent: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to map location'
      setLocalError(message)
      onError?.(message)
    } finally {
      setBusy(false)
    }
  }

  async function handleSyncCatalog() {
    if (!selectedShopId) {
      setLocalError('Select a Shopify store first')
      return
    }
    setBusy(true)
    setLocalError('')
    try {
      const result = await syncShopifyCatalog(selectedShopId)
      setLocalNotice(
        `Synced ${result.upserted} variants from ${result.shopDomain} (${result.matchedInventory} match warehouse SKUs)`,
      )
      await load({ silent: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Catalog sync failed'
      setLocalError(message)
      onError?.(message)
    } finally {
      setBusy(false)
    }
  }

  async function handlePushAll() {
    setBusy(true)
    setLocalError('')
    try {
      const result = await pushWarehouseInventoryToShopify(warehouseId)
      setLocalNotice(`Pushed ${result.pushed} inventory update(s) across ${result.skus} opted-in SKU(s)`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Push to Shopify failed'
      setLocalError(message)
      onError?.(message)
    } finally {
      setBusy(false)
    }
  }


  async function toggleLink(link: ProductLink, patch: { syncEnabled?: boolean; continueSelling?: boolean }) {
    setBusy(true)
    setLocalError('')
    try {
      await updateProductLink(link.id, patch)
      await load({ silent: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to update product link'
      setLocalError(message)
      onError?.(message)
    } finally {
      setBusy(false)
    }
  }

  const shopName = (shopId: string) => shops.find((s) => s.id === shopId)?.shopDomain || shopId

  return (
    <div
      className="wh-inventory-workspace"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {!onSummaryChange ? (<div className="wh-stock-overview" aria-label="Inventory summary">
        <div><span>Tracked SKUs</span><strong>{loading ? '-' : items.length}</strong></div>
        <div><span>On hand</span><strong>{loading ? '-' : totals.onHand.toLocaleString()}</strong></div>
        <div><span>Available</span><strong>{loading ? '-' : totals.available.toLocaleString()}</strong></div>
        <div><span>Reserved</span><strong>{loading ? '-' : totals.reserved.toLocaleString()}</strong></div>
      </div>) : null}

      <p className="wh-inventory-source">{warehouseName || 'This warehouse'} is the stock source. Linked stores share its available inventory.</p>

      {localError ? (
        <Alert tone="danger" onDismiss={() => setLocalError('')}>
          {localError}
        </Alert>
      ) : null}
      {localNotice ? (
        <Alert tone="success" onDismiss={() => setLocalNotice('')}>
          {localNotice}
        </Alert>
      ) : null}

      <details className="wh-inventory-sync">
        <summary><span className="material-symbols-outlined" aria-hidden>sync_alt</span><span><strong>Store sync & location mapping</strong><small>Connect stock to the right Shopify location</small></span><span className="wh-disclosure-label">Manage +</span></summary><div className="wh-inventory-sync-body">
        {shops.length === 0 ? (
          <p className="demo-muted">Add and connect stores in Company stores on the Stores &amp; Warehouses page.</p>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              <FormField label="Shop">
                <select
                  className="demo-input"
                  disabled={busy}
                  value={selectedShopId}
                  onChange={(e) => setSelectedShopId(e.target.value)}
                >
                  {shops.map((shop) => (
                    <option key={shop.id} value={shop.id}>
                      {shop.shopDomain}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Shopify location">
                <select
                  className="demo-input"
                  disabled={busy || !shopLocations.length}
                  value={selectedLocationGid}
                  onChange={(e) => setSelectedLocationGid(e.target.value)}
                >
                  <option value="">Select location…</option>
                  {shopLocations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <div className="flex items-end gap-2">
                <button className="demo-button" type="button" disabled={busy || !selectedLocationGid || Array.isArray(shops.find((s) => s.id === selectedShopId)?.warehouseIds)} onClick={() => void handleSaveLocation()}>
                  Save map
                </button>
              </div>
            </div>
            {Array.isArray(shops.find(shop => shop.id === selectedShopId)?.warehouseIds) ? <p className="wh-inventory-source">This store uses shared inventory. Manage its location mapping from the store settings.</p> : null}
            <div className="flex flex-wrap gap-2">
              <button className="demo-btn demo-btn-sm" type="button" disabled={busy} onClick={() => void handleSyncCatalog()}>
                Sync product catalog
              </button>
              <button className="demo-btn demo-btn-sm" type="button" disabled={busy} onClick={() => void handlePushAll()}>
                Push stock to Shopify
              </button>
            </div>
            {locationMaps.length > 0 ? (
              <ul className="demo-muted text-sm m-0 pl-4">
                {locationMaps.map((m) => (
                  <li key={m.id}>
                    {shopName(m.shopId)} → {m.locationName || m.locationGid}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </div></details>

      <details className="wh-inventory-adjust"><summary><span className="material-symbols-outlined" aria-hidden>inventory_2</span><span><strong>Adjust inventory</strong><small>Add stock or set an on-hand quantity</small></span><span className="wh-disclosure-label">Adjust +</span></summary>
      <form className="grid gap-3 md:grid-cols-4" onSubmit={onSubmit}>
        <FormField label="SKU">
          <input
            className="demo-input"
            disabled={busy}
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            placeholder="e.g. TEE-BLK-M"
            required
            autoComplete="off"
          />
        </FormField>
        <FormField label="Quantity">
          <input
            className="demo-input"
            type="number"
            min={0}
            step={1}
            disabled={busy}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            required
          />
        </FormField>
        <FormField label="Mode">
          <select className="demo-input" disabled={busy} value={mode} onChange={(e) => setMode(e.target.value as 'add' | 'set')}>
            <option value="add">Add to stock</option>
            <option value="set">Set on-hand</option>
          </select>
        </FormField>
        <div className="flex items-end">
          <button className="demo-button w-full" type="submit" disabled={busy || !warehouseId}>
            {busy ? 'Saving…' : mode === 'add' ? 'Add product' : 'Save quantity'}
          </button>
        </div>
      </form>
      </details>

      <ListToolbar
        search={q}
        searchPlaceholder="Filter SKUs…"
        onSearchChange={setQ}
        resultCount={filtered.length}
        resultLabel="SKUs"
        onClear={() => setQ('')}
      />

      <DataTable
        columns={[
          {
            key: 'sku',
            header: 'SKU',
            sortable: true,
            sortValue: (row) => row.sku,
            render: (row) => <span className="demo-cell-primary">{row.sku}</span>,
          },
          {
            key: 'onHand',
            header: 'On hand',
            align: 'right',
            className: 'num',
            sortable: true,
            sortValue: (row) => row.quantityOnHand,
            render: (row) => row.quantityOnHand,
          },
          {
            key: 'available',
            header: 'Available',
            align: 'right',
            className: 'num',
            render: (row) => row.quantityAvailable,
          },
          {
            key: 'reserved',
            header: 'Reserved',
            align: 'right',
            className: 'num',
            render: (row) =>
              row.reserved ? <StatusBadge status="pending" label={String(row.reserved)} variant="warning" /> : '0',
          },
          {
            key: 'shopify',
            header: 'Shopify sync',
            render: (row) => {
              const rowLinks = linksBySku.get(row.sku.toLowerCase()) || []
              if (!rowLinks.length) {
                return <span className="demo-muted text-xs">Not in catalog</span>
              }
              return (
                <div className="grid gap-1">
                  {rowLinks.map((link) => (
                    <label key={link.id} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={link.syncEnabled}
                        disabled={busy || Array.isArray(shops.find((s) => s.id === link.shopId)?.warehouseIds)}
                        onChange={(e) => void toggleLink(link, { syncEnabled: e.target.checked })}
                      />
                      <span title={shopName(link.shopId)}>Sync</span>
                      <input
                        type="checkbox"
                        checked={link.continueSelling}
                        disabled={busy}
                        onChange={(e) => void toggleLink(link, { continueSelling: e.target.checked })}
                      />
                      <span>Sell when out of stock</span>
                    </label>
                  ))}
                </div>
              )
            },
          },
          {
            key: 'actions',
            header: 'Actions',
            align: 'right',
            render: (row) => (
              <button
                type="button"
                className="demo-btn demo-btn-sm demo-btn-danger"
                disabled={busy}
                onClick={() => void handleRemove(row.sku)}
              >
                Remove
              </button>
            ),
          },
        ]}
        rows={filtered}
        rowKey={(row) => row.sku}
        loading={loading}
        emptyTitle="No products yet"
        emptyMessage="Add a SKU and quantity above to track stock for this warehouse."
      />
    </div>
  )
}
