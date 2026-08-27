import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import OrderShipActions from '../OrderShipActions'
import { FormField, PageHeader, StatusBadge } from '../ui'
import {
  assignCompanyOrderWarehouse,
  createOrderReturn,
  getOrderFulfillment,
  getWarehouseInventory,
  syncOrderToShopify,
  type ActivityLogEntry,
  type FulfillmentGroup,
  type ReturnRecord,
  type ShipmentRecord,
  type ShopOrder,
} from '../../lib/api'
import { useCompanyPortal } from './CompanyPortalContext'
import OrderEventsPanel from './OrderEventsPanel'
import OrderFulfillmentPanel from './OrderFulfillmentPanel'
import OrderShipmentFlow from './OrderShipmentFlow'

export default function OrderDetailPanel({ orderId }: { orderId: string }) {
  const navigate = useNavigate()
  const { company, currentUser, shopsById, setError, setNotice, refreshCounts } = useCompanyPortal()
  const warehouses = company?.warehouses || []
  const canAssign = (currentUser?.role || 'member') !== 'warehouse'

  const [order, setOrder] = useState<ShopOrder | null>(null)
  const [groups, setGroups] = useState<FulfillmentGroup[]>([])
  const [shipments, setShipments] = useState<ShipmentRecord[]>([])
  const [returns, setReturns] = useState<ReturnRecord[]>([])
  const [logs, setLogs] = useState<ActivityLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showEvents, setShowEvents] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [creatingReturn, setCreatingReturn] = useState(false)
  const [returnReason, setReturnReason] = useState('')
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('')
  const [stockWarehouseIds, setStockWarehouseIds] = useState<string[]>([])
  const [assigning, setAssigning] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const data = await getOrderFulfillment(orderId)
      setOrder(data.order)
      setGroups(data.groups || [])
      setShipments(data.shipments || [])
      setReturns(data.returns || [])
      setLogs(data.logs || [])
      setSelectedWarehouseId(data.order?.warehouseId || data.order?.suggestedWarehouseId || '')
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load order')
      setOrder(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId])

  const orderSkus = useMemo(() => {
    const fromLines = (order?.lineItems || []).map((li) => String(li.sku || '').trim().toUpperCase()).filter(Boolean)
    const fromGroups = groups.flatMap((g) => (g.lines || []).map((l) => String(l.sku || '').trim().toUpperCase()).filter(Boolean))
    return [...new Set([...fromLines, ...fromGroups])]
  }, [order, groups])

  useEffect(() => {
    if (!orderSkus.length || !warehouses.length) {
      setStockWarehouseIds(groups.map((g) => g.warehouseId).filter(Boolean) as string[])
      return
    }
    let cancelled = false
    void Promise.all(
      warehouses.map(async (w) => {
        try {
          const items = await getWarehouseInventory(w.id)
          const hasSku = items.some((item) => orderSkus.includes(String(item.sku || '').toUpperCase()))
          return hasSku ? w.id : null
        } catch {
          return null
        }
      }),
    ).then((ids) => {
      if (cancelled) return
      const fromStock = ids.filter(Boolean) as string[]
      const fromGroups = groups.map((g) => g.warehouseId).filter(Boolean) as string[]
      const assigned = order?.warehouseId ? [order.warehouseId] : []
      setStockWarehouseIds([...new Set([...fromStock, ...fromGroups, ...assigned])])
    })
    return () => {
      cancelled = true
    }
  }, [orderSkus.join('|'), warehouses.map((w) => w.id).join('|'), groups.map((g) => g.warehouseId).join('|'), order?.warehouseId])

  function onDone() {
    void load()
    void refreshCounts()
  }

  const eligibleWarehouses = useMemo(() => {
    const suggested = order?.suggestedWarehouseId
    if (!orderSkus.length) return warehouses
    const stock = warehouses.filter((w) => stockWarehouseIds.includes(w.id))
    if (suggested && !stock.some((w) => w.id === suggested)) {
      const sug = warehouses.find((w) => w.id === suggested)
      if (sug) return [sug, ...stock]
    }
    return stock
  }, [warehouses, stockWarehouseIds, orderSkus.length, order?.suggestedWarehouseId])

  async function assignSelectedWarehouse() {
    if (!order) return
    setAssigning(true)
    try {
      await assignCompanyOrderWarehouse(order.id, selectedWarehouseId || null)
      setError('')
      setNotice(selectedWarehouseId ? 'Warehouse assigned' : 'Warehouse cleared')
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to assign warehouse')
    } finally {
      setAssigning(false)
    }
  }

  async function acceptSuggestedWarehouse() {
    if (!order?.suggestedWarehouseId) return
    setSelectedWarehouseId(order.suggestedWarehouseId)
    setAssigning(true)
    try {
      await assignCompanyOrderWarehouse(order.id, order.suggestedWarehouseId)
      setError('')
      setNotice('Suggested warehouse accepted')
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to accept warehouse')
    } finally {
      setAssigning(false)
    }
  }

  const needsShopifySync = useMemo(() => {
    if (!order || order.source === 'demo') return false
    const shipped = groups.filter((g) => g.status === 'shipped')
    if (!shipped.length) return false
    return shipped.some((g) => {
      const shipment = shipments.find((s) => s.fulfillmentGroupId === g.id)
      return !shipment?.shopifyFulfillmentId
    })
  }, [order, groups, shipments])

  async function pushShopify(force = false) {
    setSyncing(true)
    try {
      const result = await syncOrderToShopify(orderId, force)
      if (result.errors?.length) {
        setError(result.errors.map((e) => e.error).join('; '))
      } else {
        setError('')
        setNotice(
          force
            ? `Re-synced ${result.syncedCount} shipment(s) to Shopify`
            : `Synced ${result.syncedCount} shipment(s) to Shopify`,
        )
      }
      await load()
      void refreshCounts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Shopify sync failed')
    } finally {
      setSyncing(false)
    }
  }

  async function startReturn() {
    setCreatingReturn(true)
    try {
      const rma = await createOrderReturn(orderId, {
        reason: returnReason || 'Customer return',
        authorize: true,
        warehouseId: order?.warehouseId || null,
      })
      setNotice(`Return ${rma.rmaNumber} created`)
      setReturnReason('')
      await load()
      void refreshCounts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create return')
    } finally {
      setCreatingReturn(false)
    }
  }

  if (loading) {
    return <p className="demo-muted">Loading order…</p>
  }

  if (!order) {
    return (
      <div>
        <button type="button" className="demo-btn demo-btn-sm" onClick={() => void navigate({ to: '/account/orders' })}>
          ← Back to orders
        </button>
        <p className="demo-muted mt-3">Order not found.</p>
      </div>
    )
  }

  const shop = shopsById.get(order.shopId)

  return (
    <div className="order-detail">
      <PageHeader
        title={`Order ${order.orderNumber}`}
        description={`${order.customerName || 'Customer'}${shop ? ` · ${shop.shopDomain}` : ''}`}
        actions={
          <div className="page-header-actions">
            <button type="button" className="demo-btn demo-btn-sm" onClick={() => void navigate({ to: '/account/orders' })}>
              ← Orders
            </button>
            <button
              type="button"
              className={`demo-btn demo-btn-sm ${showEvents ? 'is-active' : ''}`}
              onClick={() => setShowEvents((v) => !v)}
            >
              {showEvents ? 'Hide events' : 'Events'}
              {logs.length ? ` (${logs.length})` : ''}
            </button>
            {order.source !== 'demo' ? (
              <button
                type="button"
                className="demo-btn demo-btn-sm"
                disabled={syncing || groups.every((g) => g.status !== 'shipped')}
                onClick={() => void pushShopify(needsShopifySync ? false : true)}
              >
                {syncing ? 'Syncing…' : needsShopifySync ? 'Push to Shopify' : 'Re-sync Shopify'}
              </button>
            ) : null}
            <button type="button" className="demo-btn demo-btn-sm" onClick={() => void load()}>
              Refresh
            </button>
          </div>
        }
      />

      <div className="order-detail-meta">
        <div>
          <div className="demo-label">Status</div>
          <StatusBadge status={order.status} />
        </div>
        <div>
          <div className="demo-label">Created</div>
          <div className="demo-cell-primary">{new Date(order.createdAt).toLocaleString()}</div>
        </div>
        <div>
          <div className="demo-label">940 file</div>
          {order.fileLink?.url ? (
            <a href={order.fileLink.url} target="_blank" rel="noreferrer">
              Download 940
            </a>
          ) : (
            <span className="demo-muted">Not generated</span>
          )}
        </div>
        {order.trackingNumber ? (
          <div>
            <div className="demo-label">Tracking</div>
            <div className="demo-cell-primary">
              {order.carrier} {order.trackingNumber}
            </div>
          </div>
        ) : null}
        <div>
          <div className="demo-label">Shopify sync</div>
          {order.source === 'demo' ? (
            <span className="demo-muted">Demo (no Shopify)</span>
          ) : needsShopifySync ? (
            <StatusBadge status="error" label="Pending" variant="warning" />
          ) : groups.some((g) => g.status === 'shipped') ? (
            <StatusBadge status="fulfilled" label="Synced" />
          ) : (
            <span className="demo-muted">Not shipped yet</span>
          )}
        </div>
      </div>

      {order.lastError ? <p className="demo-alert-danger demo-alert text-sm">{order.lastError}</p> : null}
      {needsShopifySync ? (
        <p className="demo-alert demo-alert-danger text-sm">
          This order is fulfilled in WMS but Shopify still needs an update. Use <strong>Push to Shopify</strong>.
        </p>
      ) : null}
      {order.suggestedWarehouseId && !order.warehouseId ? (
        <div className="demo-alert demo-alert-danger text-sm flex flex-wrap items-center gap-3">
          <span>
            Suggested warehouse:{' '}
            <strong>{warehouses.find((w) => w.id === order.suggestedWarehouseId)?.name || 'Unknown'}</strong>
            {order.routingReason ? ` — ${order.routingReason}` : ''}
          </span>
          {canAssign ? (
            <button type="button" className="demo-button" disabled={assigning} onClick={() => void acceptSuggestedWarehouse()}>
              {assigning ? 'Assigning…' : 'Accept suggestion'}
            </button>
          ) : null}
        </div>
      ) : null}
      {order.routingReason && !(order.suggestedWarehouseId && !order.warehouseId) ? (
        <p className="demo-muted text-sm">Routing: {order.routingReason}</p>
      ) : null}
      {order.sftpError ? <p className="demo-alert-danger demo-alert text-sm">{order.sftpError}</p> : null}

      <OrderShipmentFlow order={order} groups={groups} shipments={shipments} logs={showEvents ? [] : logs} warehouses={warehouses} />

      {showEvents ? (
        <div className="order-detail-actions card-section">
          <h3 className="order-flow-heading">Events</h3>
          <OrderEventsPanel logs={logs} groups={groups} shipments={shipments} />
        </div>
      ) : null}

      <div className="order-detail-actions card-section">
        <h3 className="order-flow-heading">Actions</h3>
        {canAssign ? (
          <FormField label="Primary warehouse">
            <div className="demo-action-group">
              <select
                className="demo-input"
                value={selectedWarehouseId}
                onChange={(event) => setSelectedWarehouseId(event.target.value)}
              >
                <option value="">Unassigned</option>
                {eligibleWarehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                    {order.suggestedWarehouseId === warehouse.id && !order.warehouseId ? ' (suggested)' : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="demo-btn demo-btn-sm"
                disabled={assigning || selectedWarehouseId === (order.warehouseId || '')}
                onClick={() => void assignSelectedWarehouse()}
              >
                {assigning ? 'Saving…' : 'Assign'}
              </button>
            </div>
            {eligibleWarehouses.length === 0 ? (
              <p className="demo-muted text-xs mt-1">No warehouse has inventory for these SKUs yet. Add products under Warehouses first.</p>
            ) : (
              <p className="demo-muted text-xs mt-1">
                {order.suggestedWarehouseId && !order.warehouseId
                  ? 'Accept the suggestion above, or pick another warehouse and click Assign.'
                  : 'Only warehouses that stock this order’s SKUs. Pick one, then click Assign.'}
              </p>
            )}
          </FormField>
        ) : null}

        {groups.length <= 1 ? (
          <div className="order-detail-ship-row">
            <OrderShipActions
              order={order}
              actor="company"
              fulfillmentGroupId={groups[0]?.id || null}
              onDone={onDone}
              onError={setError}
            />
          </div>
        ) : (
          <p className="demo-muted text-sm">
            This order is split across warehouses. Ship or upload a 945 on each fulfillment group below.
          </p>
        )}

        <OrderFulfillmentPanel orderId={order.id} warehouses={warehouses} onDone={onDone} onError={setError} hideLogs />
      </div>

      <div className="order-detail-actions card-section">
        <h3 className="order-flow-heading">Returns</h3>
        <div className="demo-action-group mb-3">
          <input
            className="demo-input flex-1"
            placeholder="Return reason"
            value={returnReason}
            onChange={(e) => setReturnReason(e.target.value)}
          />
          <button
            type="button"
            className="demo-button"
            disabled={creatingReturn || (!groups.some((g) => g.status === 'shipped') && order.status !== 'fulfilled' && order.status !== 'partially_fulfilled')}
            onClick={() => void startReturn()}
          >
            {creatingReturn ? 'Creating…' : 'Create return'}
          </button>
          <button type="button" className="demo-btn demo-btn-sm" onClick={() => void navigate({ to: '/account/returns' })}>
            All returns
          </button>
        </div>
        {returns.length === 0 ? (
          <p className="demo-muted text-sm">No returns for this order yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {returns.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2">
                <StatusBadge status={r.status} />
                <span className="demo-cell-primary">{r.rmaNumber}</span>
                <span className="demo-cell-secondary">{r.lines?.length || 0} line(s)</span>
                {r.reason ? <span className="demo-muted">· {r.reason}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
