import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { MoreHorizontal, Pencil, RefreshCw, Search, Store } from 'lucide-react'
import {
  connectCompanyShop,
  listCompanyStores,
  listShopShopifyLocations,
  saveStoreWarehouses,
  syncStoreInventory,
  updateCompanyStore,
  type Shop,
  type ShopifyLocationOption,
} from '../../lib/api'
import { useCompanyPortal } from './CompanyPortalContext'
import { Alert, Button, FormField, Modal } from '../ui'

export type StoreStatusKey = 'connected' | 'awaiting' | 'sync_issue' | 'disabled' | 'sync_pending'

export function storeLinkedIds(shop: Shop): string[] {
  return shop.warehouseIds ?? (shop.warehouseId ? [shop.warehouseId] : [])
}

export function getStoreStatusKey(shop: Shop): StoreStatusKey {
  if (!shop.enabled) return 'disabled'
  if (!shop.installed) return 'awaiting'
  if (shop.inventorySyncError) return 'sync_issue'
  if (shop.inventorySyncPending) return 'sync_pending'
  return 'connected'
}

function storeStatusMeta(key: StoreStatusKey): { label: string; badge: string } {
  switch (key) {
    case 'disabled':
      return { label: 'Disabled', badge: 'sw-badge is-gray' }
    case 'awaiting':
      return { label: 'Awaiting install', badge: 'sw-badge is-amber' }
    case 'sync_issue':
      return { label: 'Sync issue', badge: 'sw-badge is-red' }
    case 'sync_pending':
      return { label: 'Sync pending', badge: 'sw-badge is-blue' }
    default:
      return { label: 'Connected', badge: 'sw-badge is-green' }
  }
}

function storeSortRank(key: StoreStatusKey): number {
  if (key === 'sync_issue') return 0
  if (key === 'awaiting' || key === 'sync_pending') return 1
  if (key === 'disabled') return 2
  return 3
}

function formatSync(value?: string | null) {
  if (!value) return 'Never'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

type StoreFilter = 'all' | StoreStatusKey

type CompanyStoresPanelProps = {
  onStoresChange?: (stores: Shop[]) => void
}

export default function CompanyStoresPanel({ onStoresChange }: CompanyStoresPanelProps) {
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
  const [editHoldMode, setEditHoldMode] = useState<'inherit' | 'on' | 'off'>('inherit')
  const [editHoldMinutes, setEditHoldMinutes] = useState('')
  const [locations, setLocations] = useState<ShopifyLocationOption[]>([])
  const [editBusy, setEditBusy] = useState(false)
  const [filter, setFilter] = useState<StoreFilter>('all')
  const [search, setSearch] = useState('')
  const [menuId, setMenuId] = useState<string | null>(null)
  const [rowBusy, setRowBusy] = useState<string | null>(null)
  const [syncConfirm, setSyncConfirm] = useState<Shop | null>(null)
  const [resultId, setResultId] = useState<string | null>(null)
  const syncResult = stores.find((shop) => shop.id === resultId)

  const reload = useCallback(async () => {
    const rows = await listCompanyStores()
    setStores(rows)
    onStoresChange?.(rows)
  }, [onStoresChange])

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

  useEffect(() => {
    if (!menuId) return
    const close = () => setMenuId(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menuId])

  const counts = useMemo(() => {
    let connected = 0
    let awaiting = 0
    let syncIssue = 0
    let disabled = 0
    for (const s of stores) {
      const key = getStoreStatusKey(s)
      if (key === 'connected') connected += 1
      else if (key === 'awaiting' || key === 'sync_pending') awaiting += 1
      else if (key === 'sync_issue') syncIssue += 1
      else if (key === 'disabled') disabled += 1
    }
    return { total: stores.length, connected, awaiting, syncIssue, disabled }
  }, [stores])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return [...stores]
      .filter((shop) => {
        const key = getStoreStatusKey(shop)
        if (filter === 'connected' && key !== 'connected') return false
        if (filter === 'awaiting' && key !== 'awaiting' && key !== 'sync_pending') return false
        if (filter === 'sync_issue' && key !== 'sync_issue') return false
        if (filter === 'disabled' && key !== 'disabled') return false
        if (!term) return true
        return shop.shopDomain.toLowerCase().includes(term)
      })
      .sort((a, b) => {
        const ra = storeSortRank(getStoreStatusKey(a))
        const rb = storeSortRank(getStoreStatusKey(b))
        if (ra !== rb) return ra - rb
        return a.shopDomain.localeCompare(b.shopDomain)
      })
  }, [stores, filter, search])

  function openEdit(shop: Shop) {
    if (shop.inventorySyncInProgress) {
      setResultId(shop.id)
      return
    }
    setMenuId(null)
    setEditing(shop)
    setEditSelected(storeLinkedIds(shop))
    setEditLocation(shop.inventoryLocationGid || '')
    setEditEnabled(Boolean(shop.enabled))
    setEditHoldMode(
      shop.wmsPushHoldEnabled === true ? 'on' : shop.wmsPushHoldEnabled === false ? 'off' : 'inherit',
    )
    setEditHoldMinutes(
      shop.wmsPushHoldMinutes != null && shop.wmsPushHoldMinutes !== undefined
        ? String(shop.wmsPushHoldMinutes)
        : '',
    )
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
      const holdEnabled: boolean | null =
        editHoldMode === 'inherit' ? null : editHoldMode === 'on'
      const holdMinutes: number | null =
        editHoldMode !== 'on' || editHoldMinutes.trim() === ''
          ? null
          : Math.min(240, Math.max(1, Number(editHoldMinutes) || 15))
      const prevHoldMode =
        editing.wmsPushHoldEnabled === true
          ? 'on'
          : editing.wmsPushHoldEnabled === false
            ? 'off'
            : 'inherit'
      const holdChanged =
        editHoldMode !== prevHoldMode ||
        (editHoldMode === 'on' &&
          (editHoldMinutes.trim() === ''
            ? editing.wmsPushHoldMinutes != null
            : Number(editHoldMinutes) !== Number(editing.wmsPushHoldMinutes)))
      if (editEnabled !== editing.enabled || holdChanged) {
        await updateCompanyStore(editing.id, {
          enabled: editEnabled,
          wmsPushHoldEnabled: holdEnabled,
          wmsPushHoldMinutes: holdMinutes,
        })
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

  async function syncShop(shop: Shop) {
    setRowBusy(shop.id)
    setError('')
    try {
      await syncStoreInventory(shop.id)
      setSyncConfirm(null)
      setResultId(shop.id)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to queue sync')
    } finally {
      setRowBusy(null)
      setMenuId(null)
    }
  }

  function warehouseChips(shop: Shop) {
    const ids = storeLinkedIds(shop)
    const linked = warehouses.filter((w) => ids.includes(w.id))
    if (!linked.length) {
      return (
        <span className="sw-muted">
          None linked{' '}
          <button type="button" className="sw-inline-link" onClick={() => openEdit(shop)}>
            Link warehouse
          </button>
        </span>
      )
    }
    const shown = linked.slice(0, 2)
    const extra = linked.length - shown.length
    return (
      <div className="sw-chips">
        {shown.map((w) => (
          <span key={w.id} className="sw-chip">
            {w.name}
          </span>
        ))}
        {extra > 0 ? <span className="sw-chip is-more">+{extra}</span> : null}
      </div>
    )
  }

  function primaryAction(shop: Shop) {
    const key = getStoreStatusKey(shop)
    const needsReconnect = Boolean(
      (shop.inventorySyncError || '').match(/locations|read_locations|ACCESS_DENIED|Access denied/i),
    )
    if (key === 'sync_issue' && (shop.reconnectUrl || shop.installUrl)) {
      return (
        <a
          className="sw-btn is-danger is-sm"
          href={shop.reconnectUrl || shop.installUrl}
          target="_blank"
          rel="noreferrer"
        >
          Reconnect app
        </a>
      )
    }
    if (!shop.installed && shop.installUrl) {
      return (
        <a className="sw-btn is-outline is-sm" href={shop.installUrl} target="_blank" rel="noreferrer">
          Install app
        </a>
      )
    }
    if (needsReconnect && shop.reconnectUrl) {
      return (
        <a className="sw-btn is-danger is-sm" href={shop.reconnectUrl} target="_blank" rel="noreferrer">
          Reconnect app
        </a>
      )
    }
    return (
      <button type="button" className="sw-btn is-outline is-sm" onClick={() => openEdit(shop)}>
        Edit
      </button>
    )
  }

  return (
    <section className="sw-section" aria-label="Stores">
      <div className="sw-section-head">
        <div className="sw-section-title">
          <h2>Stores</h2>
          <span className="sw-count">{counts.total}</span>
          <p>Manage Shopify connections, warehouse links, and inventory sync.</p>
        </div>
        <div className="sw-section-actions">
          <button
            type="button"
            className="sw-icon-btn"
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
            <button type="button" className="sw-btn is-primary" onClick={() => setAddOpen(true)}>
              <Store size={14} aria-hidden />
              Add store
            </button>
          ) : null}
        </div>
      </div>

      <div className="sw-toolbar">
        <div className="sw-tabs" role="tablist" aria-label="Store status">
          {(
            [
              ['all', 'All', counts.total],
              ['connected', 'Connected', counts.connected],
              ['awaiting', 'Awaiting install', counts.awaiting],
              ['sync_issue', 'Sync issue', counts.syncIssue],
              ['disabled', 'Disabled', counts.disabled],
            ] as const
          ).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={filter === id}
              className={`sw-tab${filter === id ? ' is-on' : ''}`}
              onClick={() => setFilter(id)}
            >
              {label} <em>{count}</em>
            </button>
          ))}
        </div>
        <label className="sw-search">
          <Search size={15} aria-hidden />
          <input
            type="search"
            value={search}
            aria-label="Search stores"
            placeholder="Search stores"
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}
      {!isRoot ? <p className="sw-root-note">Only the company root can add Shopify stores.</p> : null}

      {filtered.length === 0 ? (
        <div className="sw-empty">
          <Store size={28} aria-hidden />
          <strong>{stores.length ? 'No stores match' : 'No stores yet'}</strong>
          <p>
            {stores.length
              ? 'Try another filter or clear search.'
              : isRoot
                ? 'Add a Shopify domain to connect your first store.'
                : 'Ask a company root to add a store.'}
          </p>
        </div>
      ) : (
        <div className="sw-table-wrap">
          <table className="sw-table sw-table-stores" aria-label="Store directory">
            <colgroup>
              <col style={{ width: '28%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '25%' }} />
              <col style={{ width: '15%' }} />
              <col style={{ width: '16%' }} />
            </colgroup>
            <thead>
              <tr>
                <th>Store</th>
                <th>Status</th>
                <th>Linked warehouses</th>
                <th>Last sync</th>
                <th className="is-right">Manage</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((shop) => {
                const key = getStoreStatusKey(shop)
                const meta = storeStatusMeta(key)
                return (
                  <tr key={shop.id} className={key === 'sync_issue' ? 'is-issue' : undefined}>
                    <td>
                      <div className="sw-who">
                        <span className="sw-avatar" aria-hidden>
                          <Store size={16} />
                        </span>
                        <div className="sw-two">
                          <button type="button" className="sw-name-btn sw-trunc sw-strong" onClick={() => openEdit(shop)} title={shop.shopDomain}>
                            {shop.shopDomain.replace(/\.myshopify\.com$/i, '')}
                          </button>
                          <span className="sw-sub sw-trunc" title={shop.shopDomain}>{shop.shopDomain}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={meta.badge}>{shop.inventorySyncInProgress ? 'Sync in progress' : meta.label}</span>
                      {shop.inventorySyncPending ? <span className="sw-sub">Do not change anything during sync.</span> : null}
                    </td>
                    <td>{warehouseChips(shop)}</td>
                    <td><div className="sw-two"><span className="sw-sync-time">{formatSync(shop.inventorySyncedAt)}</span><span className="sw-sub">Inventory sync</span></div></td>
                    <td className="is-right">
                      <div className="sw-acts">
                        {primaryAction(shop)}
                        <div className="sw-more">
                          <button
                            type="button"
                            className="sw-icon-btn"
                            aria-label={`More actions for ${shop.shopDomain}`}
                            aria-expanded={menuId === shop.id}
                            onClick={(e) => {
                              e.stopPropagation()
                              setMenuId((id) => (id === shop.id ? null : shop.id))
                            }}
                          >
                            <MoreHorizontal size={16} aria-hidden />
                          </button>
                          {menuId === shop.id ? (
                            <div className="sw-menu" role="menu">
                              <button type="button" role="menuitem" onClick={() => openEdit(shop)}>
                                <Pencil size={14} aria-hidden /> Edit
                              </button>
                              {shop.installed ? (
                                <button
                                  type="button"
                                  role="menuitem"
                                  disabled={rowBusy === shop.id || shop.inventorySyncInProgress || (shop.inventorySyncPending && !shop.inventorySyncError)}
                                  onClick={() => { setMenuId(null); setSyncConfirm(shop) }}
                                >
                                  <RefreshCw size={14} aria-hidden />{' '}
                                  {rowBusy === shop.id ? 'Syncing…' : 'Sync inventory'}
                                </button>
                              ) : null}
                              <button type="button" role="menuitem" onClick={() => { setMenuId(null); setResultId(shop.id) }}>View sync result</button>
                              {shop.installUrl || shop.reconnectUrl ? (
                                <a
                                  role="menuitem"
                                  href={shop.reconnectUrl || shop.installUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={() => setMenuId(null)}
                                >
                                  {shop.installed ? 'Reconnect app' : 'Install app'}
                                </a>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={Boolean(syncConfirm)} onClose={() => { if (!rowBusy) setSyncConfirm(null) }} title="Warning: sync Shopify inventory" className="users-dialog stores-dialog">
        <div className="users-dialog-body">
          <Alert tone="danger" title="Shopify inventory will be overwritten">
            <p>WMS quantities replace inventory at the mapped Shopify locations. Products missing from WMS receive zero stock and may become unavailable for sale. This sync does not delete Shopify products.</p>
            <p><strong>Do not change products, inventory, warehouse links, or Shopify settings during sync.</strong></p>
          </Alert>
          <footer className="users-dialog-footer">
            <Button variant="secondary" disabled={Boolean(rowBusy)} onClick={() => setSyncConfirm(null)}>Cancel</Button>
            <Button variant="danger" disabled={Boolean(rowBusy)} onClick={() => syncConfirm && void syncShop(syncConfirm)}>Start sync</Button>
          </footer>
        </div>
      </Modal>
      <Modal open={Boolean(syncResult)} onClose={() => setResultId(null)} title="Inventory sync result" className="users-dialog stores-dialog">
        {syncResult ? <div className="users-dialog-body">
          <p>{syncResult.shopDomain}</p>
          <Alert tone={syncResult.inventorySyncError ? 'danger' : syncResult.inventorySyncPending ? 'warning' : 'success'} title={syncResult.inventorySyncError ? 'Sync failed — not completed' : syncResult.inventorySyncInProgress ? 'Sync in progress' : syncResult.inventorySyncPending ? 'Sync queued — not completed' : syncResult.inventorySyncedAt ? 'Sync completed' : 'No completed sync'}>
            {syncResult.inventorySyncError || (syncResult.inventorySyncPending ? 'Do not change products, inventory, warehouse links, or Shopify settings during sync. Status updates automatically.' : 'Latest inventory sync status.')}
          </Alert>
          {syncResult.inventorySyncResult ? <p>{syncResult.inventorySyncResult.skus} SKUs processed; {syncResult.inventorySyncResult.pushed} location inventory updates.</p> : null}
          {syncResult.inventorySyncedAt ? <p>Last completed: {formatSync(syncResult.inventorySyncedAt)}</p> : null}
        </div> : null}
      </Modal>
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
            <Alert tone="danger" title="Saving queues an inventory sync">
              WMS stock overwrites Shopify quantities; missing WMS products receive zero stock. Shopify products are not deleted. Do not change products, inventory, or settings during sync.
            </Alert>
            <label><input type="checkbox" required /> I understand the inventory sync warning.</label>
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

            <FormField label="WMS push hold (override)">
              <select
                className="demo-input"
                value={editHoldMode}
                onChange={(e) => setEditHoldMode(e.target.value as 'inherit' | 'on' | 'off')}
              >
                <option value="inherit">Use company default</option>
                <option value="on">Force on for this store</option>
                <option value="off">Force off for this store</option>
              </select>
            </FormField>
            {editHoldMode === 'on' ? (
              <FormField label="Hold minutes (optional override)">
                <input
                  className="demo-input"
                  type="number"
                  min={1}
                  max={240}
                  placeholder="Company default"
                  value={editHoldMinutes}
                  onChange={(e) => setEditHoldMinutes(e.target.value)}
                />
              </FormField>
            ) : null}

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
