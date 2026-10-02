import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Truck } from 'lucide-react'
import OrderShipActions from '../OrderShipActions'
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
import OrderFulfillmentPanel from './OrderFulfillmentPanel'
import OrderCockpit from './OrderCockpit'
import OrderDetailSkeleton from './OrderDetailSkeleton'
import ShipmentTracker from './ShipmentTracker'

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
    return <OrderDetailSkeleton />
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
  const primaryWh =
    warehouses.find((w) => w.id === groups[0]?.warehouseId || w.id === order.warehouseId)?.name ||
    (groups[0]?.warehouseId ? `Warehouse ${groups[0].warehouseId.slice(-4)}` : null)
  const shipCan =
    groups.some((g) => g.status === 'shipped') ||
    order.status === 'fulfilled' ||
    order.status === 'partially_fulfilled'

  return (
    <OrderCockpit
      order={order}
      groups={groups}
      shipments={shipments}
      returns={returns}
      logs={logs}
      warehouses={warehouses}
      shopDomain={shop?.shopDomain}
      needsShopifySync={needsShopifySync}
      fulfillmentWorkbench={
        <OrderFulfillmentPanel
          orderId={order.id}
          warehouses={warehouses}
          onDone={onDone}
          onError={setError}
          hideLogs
          showTracker={false}
        />
      }
      operations={
        <div className="oc-operation-grid">
          <div className="oc-operation-card">
            <h3>Warehouse assignment</h3>
            <p>Route the order to an eligible warehouse.</p>
            {canAssign ? (
              <>
                <select
                  value={selectedWarehouseId}
                  onChange={(event) => setSelectedWarehouseId(event.target.value)}
                  aria-label="Primary warehouse"
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
                  disabled={assigning || selectedWarehouseId === (order.warehouseId || '')}
                  onClick={() => void assignSelectedWarehouse()}
                >
                  {assigning ? 'Assigning…' : 'Save assignment'}
                </button>
              </>
            ) : (
              <span>Warehouse role cannot reassign orders.</span>
            )}
          </div>
          <div className="oc-operation-card">
            <h3>Returns & recovery</h3>
            <p>Create a return when an order has shipped.</p>
            <textarea
              placeholder="Return reason"
              value={returnReason}
              onChange={(event) => setReturnReason(event.target.value)}
              rows={2}
            />
            <button type="button" disabled={creatingReturn || !shipCan} onClick={() => void startReturn()}>
              {creatingReturn ? 'Creating…' : 'Create return'}
            </button>
            {order.suggestedWarehouseId && !order.warehouseId && canAssign ? (
              <button type="button" disabled={assigning} onClick={() => void acceptSuggestedWarehouse()}>
                Accept suggested route
              </button>
            ) : null}
          </div>
          {shipments.length ? (
            <details className="oc-operation-expand" open>
              <summary>Carrier stage controls</summary>
              <ShipmentTracker shipments={shipments} warehouses={warehouses} onDone={onDone} onError={setError} />
            </details>
          ) : null}
        </div>
      }
      railActions={
        <section className="oc-panel oc-ship-rail">
          <div className="oc-panel-heading">
            <div>
              <span>SHIP &amp; UPLOAD</span>
              <h2>Tracking / 945</h2>
            </div>
            <Truck size={21} />
          </div>
          <p className="oc-ship-rail-copy">
            {groups.length > 1 ? 'Record each fulfillment path independently.' : 'Record carrier tracking or upload a 945.'}
          </p>
          <div className={`oc-ship-paths oc-ship-paths-rail${groups.length > 1 ? ' oc-ship-paths-rail--multi' : ''}`}>
            {(groups.length > 1 ? groups : [groups[0]]).map((group, index) => (
              <div className="oc-ship-path" key={group?.id || 'order'}>
                <div className="oc-ship-path-head">
                  <strong>Path {String(index + 1).padStart(2, '0')}</strong>
                  <span>{warehouses.find((w) => w.id === group?.warehouseId)?.name || primaryWh || 'Awaiting warehouse'}</span>
                </div>
                <OrderShipActions
                  order={order}
                  actor="company"
                  fulfillmentGroupId={group?.id || null}
                  onDone={onDone}
                  onError={setError}
                  compact
                />
              </div>
            ))}
          </div>
        </section>
      }
      onBack={() => void navigate({ to: '/account/orders' })}
      onRefresh={() => void load()}
      onSync={() => void pushShopify(false)}
      syncing={syncing}
    />
  )
}
