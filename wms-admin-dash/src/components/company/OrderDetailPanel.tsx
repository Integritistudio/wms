import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import OrderShipActions from '../OrderShipActions'
import { Alert, StatusBadge, TruncatedCopyId } from '../ui'
import {
  assignCompanyOrderWarehouse,
  createOrderReturn,
  getOrderFulfillment,
  getOrderModernwmsStatus,
  getWarehouseInventory,
  syncOrderToShopify,
  testCompanyShopConnection,
  type ActivityLogEntry,
  type FulfillmentGroup,
  type ModernWmsOrderLink,
  type OrderAddress,
  type OrderLineItem,
  type ReturnRecord,
  type ShipmentRecord,
  type ShopOrder,
} from '../../lib/api'
import { useCompanyPortal } from './CompanyPortalContext'
import OrderEventsPanel from './OrderEventsPanel'
import OrderFulfillmentPanel from './OrderFulfillmentPanel'
import OrderShipmentFlow from './OrderShipmentFlow'

function formatMoney(value?: string, currency?: string) {
  if (value == null || value === '') return '—'
  const num = Number(value)
  if (Number.isNaN(num)) return value
  try {
    return new Intl.NumberFormat(undefined, {
      style: currency ? 'currency' : 'decimal',
      currency: currency || undefined,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num)
  } catch {
    return currency ? `${currency} ${num.toFixed(2)}` : num.toFixed(2)
  }
}

function formatAddress(address?: OrderAddress | null) {
  if (!address) return []
  return [
    address.name,
    address.company,
    address.address1,
    address.address2,
    [address.city, address.provinceCode || address.province, address.zip].filter(Boolean).join(', '),
    address.country || address.countryCode,
  ]
    .map((line) => String(line || '').trim())
    .filter(Boolean)
}

function pctComplete(groups: FulfillmentGroup[], shipments: ShipmentRecord[]) {
  if (!groups.length) return 0
  const delivered = shipments.filter((s) => s.status === 'delivered').length
  if (delivered >= groups.length) return 100
  const shipped = groups.filter((g) => g.status === 'shipped').length
  if (shipped >= groups.length) return 85
  if (shipped > 0) return Math.round((shipped / groups.length) * 70) + 20
  return 35
}

function statusHeadline(order: ShopOrder, groups: FulfillmentGroup[], shipments: ShipmentRecord[]) {
  if (shipments.some((s) => s.status === 'delivered') && groups.every((g) => g.status === 'shipped')) {
    return 'Delivered'
  }
  if (groups.length && groups.every((g) => g.status === 'shipped')) return 'Shipped'
  if (shipments.some((s) => s.status === 'in_transit' || s.status === 'out_for_delivery')) return 'In transit'
  if (groups.length) return 'Allocated'
  if (order.status === 'error') return 'Needs attention'
  return order.status?.replace(/_/g, ' ') || 'Received'
}

function pipelineReasons(order: ShopOrder, groups: FulfillmentGroup[], warehouses: { id: string; name: string }[]) {
  const reasons: Array<{ title: string; detail: string }> = []
  const split = groups.length > 1
  const whName = (id: string | null | undefined) =>
    warehouses.find((w) => w.id === id)?.name || (id ? `Warehouse ${id.slice(-4)}` : 'Unassigned')

  if (order.routingReason) {
    reasons.push({
      title: 'Routing decision',
      detail: order.routingReason,
    })
  }

  if (groups.length === 1) {
    reasons.push({
      title: 'Inventory available in single hub',
      detail: `${whName(groups[0].warehouseId)} held allocated SKUs. No split shipment required.`,
    })
  } else if (split) {
    reasons.push({
      title: 'Split shipment required',
      detail: `Order branched across ${groups.length} warehouses: ${groups.map((g) => whName(g.warehouseId)).join(', ')}.`,
    })
  } else if (order.suggestedWarehouseId) {
    reasons.push({
      title: 'Suggested facility',
      detail: `${whName(order.suggestedWarehouseId)} recommended by routing rules.`,
    })
  }

  if (order.shippingMethod?.isExpedited) {
    reasons.push({
      title: 'Expedited service protected',
      detail: order.shippingMethod.title || order.shippingMethod.shopifyServiceCode || 'Expedited shipping selected.',
    })
  } else if (!reasons.length) {
    reasons.push({
      title: 'Awaiting routing',
      detail: 'Assign a warehouse or wait for automatic allocation.',
    })
  }

  return reasons.slice(0, 4)
}

function auditRows(
  logs: ActivityLogEntry[],
  groups: FulfillmentGroup[],
  shipments: ShipmentRecord[],
  warehouses: { id: string; name: string }[],
) {
  const whName = (id: string | null | undefined) =>
    warehouses.find((w) => w.id === id)?.name || (id ? `Warehouse ${id.slice(-4)}` : 'System')

  const fromLogs = logs.map((log) => ({
    id: log.id,
    at: log.createdAt,
    origin: log.warehouseId ? whName(log.warehouseId) : log.type?.includes('shopify') ? 'Shopify' : 'Relay Routing',
    event: log.toState || log.type || 'Event',
    details: log.message || `${log.fromState || ''} → ${log.toState || ''}`.trim(),
    ok: !/error|fail/i.test(`${log.toState} ${log.message} ${log.type}`),
  }))

  const fromShipments = shipments.map((s) => ({
    id: `ship-${s.id}`,
    at: s.updatedAt || s.createdAt || '',
    origin: s.carrier || 'Carrier',
    event: (s.status || 'shipment').replace(/_/g, ' '),
    details: [s.trackingNumber, s.carrier].filter(Boolean).join(' · ') || 'Shipment update',
    ok: s.status !== 'failed' && s.status !== 'returned',
  }))

  const fromGroups = groups
    .filter((g) => g.status === 'shipped' || g.status === 'allocated')
    .map((g) => ({
      id: `grp-${g.id}-${g.status}`,
      at: g.updatedAt || g.createdAt || '',
      origin: whName(g.warehouseId),
      event: g.status === 'shipped' ? 'Packed & dispatched' : 'Order routed',
      details: (g.lines || []).map((l) => `${l.sku}×${l.allocatedQty || l.quantity}`).join(', ') || g.status,
      ok: true,
    }))

  return [...fromLogs, ...fromShipments, ...fromGroups]
    .filter((r) => r.at)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 40)
}

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
  const [modernwmsLinks, setModernwmsLinks] = useState<ModernWmsOrderLink[]>([])
  const [testingShopify, setTestingShopify] = useState(false)

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
      try {
        const links = await getOrderModernwmsStatus(orderId)
        setModernwmsLinks(links)
      } catch {
        setModernwmsLinks([])
      }
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
  const waitingModernwms = modernwmsLinks.some((l) => l.waitingOnOps && !l.closed)
  const lineItems = order.lineItems || []
  const currency = order.currency || ''
  const complete = pctComplete(groups, shipments)
  const headline = statusHeadline(order, groups, shipments)
  const primaryShipment =
    shipments.find((s) => s.status === 'delivered') ||
    shipments.find((s) => s.status === 'in_transit' || s.status === 'out_for_delivery') ||
    shipments[0]
  const primaryWh =
    warehouses.find((w) => w.id === groups[0]?.warehouseId || w.id === order.warehouseId)?.name ||
    (groups[0]?.warehouseId ? `Warehouse ${groups[0].warehouseId.slice(-4)}` : null)
  const syncLabel = modernwmsLinks.length
    ? modernwmsLinks.every((l) => l.closed)
      ? 'Synchronized'
      : waitingModernwms
        ? 'Waiting on MW'
        : 'Polling'
    : order.sftpStatus === 'sent' || order.fileLink
      ? 'Synchronized'
      : groups.length
        ? 'Queued'
        : 'Idle'
  const reasons = pipelineReasons(order, groups, warehouses)
  const audit = auditRows(logs, groups, shipments, warehouses)
  const qtyTotal = lineItems.reduce((n, li) => n + (li.quantity || 0), 0)
  const dest = order.shippingAddress
  const batchHint =
    modernwmsLinks[0]?.dispatchNo ||
    order.fileLink?.fileName ||
    (groups[0]?.createdAt ? new Date(groups[0].createdAt).toISOString().slice(0, 10).replace(/-/g, '') : null)

  const shipProg =
    primaryShipment?.status === 'delivered'
      ? 100
      : primaryShipment?.status === 'out_for_delivery'
        ? 85
        : primaryShipment?.status === 'in_transit'
          ? 65
          : groups.some((g) => g.status === 'shipped')
            ? 45
            : groups.length
              ? 25
              : 8

  return (
    <div className="order-detail order-journey">
      <section className="order-journey-hero">
        <div className="order-journey-hero-main">
          <div className="order-journey-crumb">
            <button type="button" className="order-journey-crumb-link" onClick={() => void navigate({ to: '/account/orders' })}>
              Orders
            </button>
            <span className="oj-slash">/</span>
            <span className="oj-mono order-journey-crumb-id">{order.orderNumber}</span>
            {shop ? <span className="oj-mono order-journey-store">{shop.shopDomain}</span> : null}
          </div>
          <div className="order-journey-hero-stamp-row">
            <span className="order-journey-stamp">Dispatch ticket</span>
            <span className={`order-journey-title-status ${complete >= 100 ? 'is-done' : complete >= 50 ? 'is-mid' : ''}`}>
              {headline}
            </span>
          </div>
          <h1 className="order-journey-title">
            <span className="order-journey-title-hash">#</span>
            {String(order.orderNumber).replace(/^#/, '')}
          </h1>
          <p className="order-journey-sub oj-mono">
            {[order.channel || 'shopify', primaryWh, primaryShipment?.carrier || order.carrier || 'carrier?', dest?.city || dest?.countryCode || 'ship-to']
              .filter(Boolean)
              .join('  ›  ')}
            {batchHint ? `  ·  ${batchHint}` : ''}
          </p>
        </div>
        <div className="order-journey-hero-aside">
          <div className="order-journey-barcode" aria-hidden>
            <span className="order-journey-barcode-lines" />
            <span className="oj-mono">{order.orderNumber}</span>
          </div>
          <div className="order-journey-hero-actions">
            {order.source !== 'demo' ? (
              <button
                type="button"
                className="demo-btn demo-btn-sm"
                disabled={syncing || groups.every((g) => g.status !== 'shipped')}
                onClick={() => void pushShopify(needsShopifySync ? false : true)}
              >
                {syncing ? 'Syncing…' : needsShopifySync ? 'Push to Shopify' : 'Re-sync'}
              </button>
            ) : null}
            {order.fileLink?.url ? (
              <a className="demo-btn demo-btn-sm no-underline oj-btn-edi" href={order.fileLink.url} target="_blank" rel="noreferrer">
                EDI 940
              </a>
            ) : null}
            <button type="button" className="demo-btn demo-btn-sm demo-btn-primary" onClick={() => void load()}>
              Refresh
            </button>
          </div>
        </div>
      </section>

      {/* Alerts */}
      <div className="order-journey-alerts">
        {order.lastError ? <Alert tone="danger">{order.lastError}</Alert> : null}
        {needsShopifySync ? (
          <Alert tone="danger">
            This order is fulfilled in WMS but Shopify still needs an update. Use <strong>Push to Shopify</strong>.
          </Alert>
        ) : null}
        {/401|access token|unauthorized|reconnect|reinstall/i.test(order.lastError || '') && shop ? (
          <Alert
            tone="danger"
            actions={
              <>
                <a
                  className="demo-btn demo-btn-sm no-underline"
                  href={shop.reconnectUrl || `https://${shop.shopDomain}/admin/apps`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open WMS Linker in Shopify Admin
                </a>
                <button
                  type="button"
                  className="demo-btn demo-btn-sm"
                  disabled={testingShopify}
                  onClick={() => {
                    setTestingShopify(true)
                    void testCompanyShopConnection(shop.id)
                      .then((result) => setNotice(`Shopify connected: ${result.shopName}`))
                      .catch((err) => setError(err instanceof Error ? err.message : 'Shopify connection failed'))
                      .finally(() => setTestingShopify(false))
                  }}
                >
                  {testingShopify ? 'Testing…' : 'Test Shopify connection'}
                </button>
              </>
            }
          >
            Incoming Shopify orders can still arrive because webhooks do not use this token. Push to Shopify does.
            Open <strong>WMS Linker inside Shopify Admin → Apps</strong> so a new Admin API token can be stored, then try
            Push again.
          </Alert>
        ) : null}
        {order.suggestedWarehouseId && !order.warehouseId ? (
          <Alert
            tone="danger"
            actions={
              canAssign ? (
                <button type="button" className="demo-button" disabled={assigning} onClick={() => void acceptSuggestedWarehouse()}>
                  {assigning ? 'Assigning…' : 'Accept suggestion'}
                </button>
              ) : null
            }
          >
            Suggested warehouse:{' '}
            <strong>{warehouses.find((w) => w.id === order.suggestedWarehouseId)?.name || 'Unknown'}</strong>
            {order.routingReason ? ` — ${order.routingReason}` : ''}
          </Alert>
        ) : null}
        {order.sftpError ? <Alert tone="danger">{order.sftpError}</Alert> : null}
        {waitingModernwms ? (
          <Alert tone="info">
            Waiting on ModernWMS warehouse ops to complete pick/ship. Linker will auto-sync when delivery status is
            reported.
          </Alert>
        ) : null}
      </div>

      <section className="order-journey-kpis">
        <article className="oj-kpi oj-kpi--progress">
          <span className="oj-kpi-label">Progress</span>
          <div className="oj-kpi-value">{complete}<span className="oj-kpi-unit">%</span></div>
          <div className="oj-bar">
            <span style={{ width: `${complete}%` }} />
          </div>
          <div className="oj-kpi-foot">{headline}</div>
        </article>
        <article className="oj-kpi oj-kpi--route">
          <span className="oj-kpi-label">Route</span>
          <div className="oj-kpi-value oj-kpi-value--sm">
            {groups.length > 1 ? `Split · ${groups.length}` : primaryWh || 'Pending'}
          </div>
          <div className="oj-bar is-accent">
            <span style={{ width: `${groups.length ? 100 : 20}%` }} />
          </div>
          <div className="oj-kpi-foot">{order.routingReason || 'No rule yet'}</div>
        </article>
        <article className="oj-kpi oj-kpi--sync">
          <span className="oj-kpi-label">Sync</span>
          <div className="oj-kpi-value oj-kpi-value--sm">{syncLabel}</div>
          <div className="oj-bar is-ok">
            <span
              style={{
                width: `${syncLabel === 'Synchronized' ? 100 : syncLabel === 'Idle' ? 10 : 55}%`,
              }}
            />
          </div>
          <div className="oj-kpi-foot oj-mono">
            {modernwmsLinks[0]?.dispatchNo || order.fileLink?.fileName || '—'}
          </div>
        </article>
        <article className="oj-kpi oj-kpi--ship">
          <span className="oj-kpi-label">Shipment</span>
          <div className="oj-kpi-value oj-kpi-value--sm">
            {primaryShipment?.carrier || order.carrier || '—'}
          </div>
          <div className="oj-bar">
            <span style={{ width: `${shipProg}%` }} />
          </div>
          <div className="oj-kpi-foot oj-mono">
            {primaryShipment?.trackingNumber || order.trackingNumber || formatMoney(order.totals?.totalPrice, currency)}
          </div>
        </article>
      </section>

      <OrderShipmentFlow
        order={order}
        groups={groups}
        shipments={shipments}
        logs={logs}
        warehouses={warehouses}
        modernwmsLinks={modernwmsLinks}
        returns={returns}
      />

      {/* Connected systems — forward flow + returns in red */}
      <section className="oj-systems">
        <header className="oj-systems-head">
          <div>
            <h2>Connected systems</h2>
            <p>Shopify → Linker → warehouse → carrier, with returns on the reverse path.</p>
          </div>
          {returns.length > 0 ? (
            <span className="oj-systems-return-chip">
              {returns.length} return{returns.length === 1 ? '' : 's'}
            </span>
          ) : null}
        </header>

        <div className="oj-systems-flow">
          <article className={`oj-sys ${order.source === 'demo' ? 'is-muted' : needsShopifySync ? 'is-warn' : 'is-ok'}`}>
            <div className="oj-sys-top">
              <span className="oj-sys-idx">01</span>
              <span className={`oj-sys-dot ${needsShopifySync ? 'is-warn' : 'is-ok'}`} />
            </div>
            <div className="oj-sys-label">Shopify</div>
            <div className="oj-sys-value">
              {order.source === 'demo'
                ? 'Demo order'
                : needsShopifySync
                  ? 'Sync pending'
                  : groups.some((g) => g.status === 'shipped')
                    ? 'Synced'
                    : 'Connected'}
            </div>
            <div className="oj-sys-meta oj-mono">{shop?.shopDomain || order.shopId}</div>
            <div className="oj-sys-meta oj-mono">#{order.shopifyOrderId || '—'}</div>
          </article>

          <div className="oj-systems-join" aria-hidden>
            <span />
          </div>

          <article className={`oj-sys ${order.lastError ? 'is-warn' : 'is-ok'}`}>
            <div className="oj-sys-top">
              <span className="oj-sys-idx">02</span>
              <span className={`oj-sys-dot ${order.lastError ? 'is-warn' : 'is-ok'}`} />
            </div>
            <div className="oj-sys-label">Relay Linker</div>
            <div className="oj-sys-value">{headline}</div>
            <div className="oj-sys-meta">{order.routingReason || 'Routing engine'}</div>
            <div className="oj-bar">
              <span style={{ width: `${complete}%` }} />
            </div>
          </article>

          <div className="oj-systems-join" aria-hidden>
            <span />
          </div>

          <article className={`oj-sys ${waitingModernwms ? 'is-warn' : groups.length ? 'is-ok' : 'is-muted'}`}>
            <div className="oj-sys-top">
              <span className="oj-sys-idx">03</span>
              <span className={`oj-sys-dot ${waitingModernwms ? 'is-warn' : groups.length ? 'is-ok' : ''}`} />
            </div>
            <div className="oj-sys-label">Warehouse</div>
            <div className="oj-sys-value">{primaryWh || 'Unassigned'}</div>
            <div className="oj-sys-meta">
              {modernwmsLinks[0]
                ? `MW ${modernwmsLinks[0].dispatchNo || 'pending'} · ${modernwmsLinks[0].statusLabel}`
                : order.sftpStatus || (order.fileLink ? 'EDI 940 ready' : 'No dispatch yet')}
            </div>
            {order.fileLink?.url ? (
              <a className="oj-sys-link" href={order.fileLink.url} target="_blank" rel="noreferrer">
                Download 940
              </a>
            ) : null}
          </article>

          <div className="oj-systems-join" aria-hidden>
            <span />
          </div>

          <article className={`oj-sys ${primaryShipment ? 'is-ok' : 'is-muted'}`}>
            <div className="oj-sys-top">
              <span className="oj-sys-idx">04</span>
              <span className={`oj-sys-dot ${primaryShipment ? 'is-ok' : ''}`} />
            </div>
            <div className="oj-sys-label">Carrier</div>
            <div className="oj-sys-value">{primaryShipment?.carrier || order.carrier || '—'}</div>
            <div className="oj-sys-meta oj-mono">
              {primaryShipment?.trackingNumber || order.trackingNumber || 'No tracking'}
            </div>
            <div className="oj-bar">
              <span style={{ width: `${shipProg}%` }} />
            </div>
          </article>

          <div className="oj-systems-join is-return" aria-hidden>
            <span />
          </div>

          <article
            className={`oj-sys oj-sys--return ${
              returns.length
                ? returns.some((r) => !/restocked|closed|cancelled|disposed/i.test(r.status))
                  ? 'is-live'
                  : 'is-done'
                : 'is-idle'
            }`}
          >
            <div className="oj-sys-top">
              <span className="oj-sys-idx">05</span>
              <span className="oj-sys-dot is-return" />
            </div>
            <div className="oj-sys-label">Returns</div>
            <div className="oj-sys-value">
              {returns.length === 0
                ? 'No RMAs'
                : returns.some((r) => !/restocked|closed|cancelled|disposed/i.test(r.status))
                  ? 'Open return'
                  : 'Closed'}
            </div>
            <div className="oj-sys-meta oj-mono">
              {returns[0]?.rmaNumber || 'Create below'}
              {returns.length > 1 ? ` · +${returns.length - 1}` : ''}
            </div>
            <div className="oj-bar is-return">
              <span
                style={{
                  width: `${
                    returns.length === 0
                      ? 0
                      : returns.every((r) => /restocked|closed|cancelled|disposed/i.test(r.status))
                        ? 100
                        : returns.some((r) => /received|restock/i.test(r.status))
                          ? 65
                          : 35
                  }%`,
                }}
              />
            </div>
            <div className="oj-sys-return-stats">
              <span>
                <b>{returns.filter((r) => !/restocked|closed|cancelled|disposed/i.test(r.status)).length}</b> open
              </span>
              <span>
                <b>{returns.filter((r) => /restock/i.test(r.status)).length}</b> restocked
              </span>
            </div>
          </article>
        </div>
      </section>

      {/* Order facts — Shopify-level detail without leaving */}
      <section className="order-journey-grid">
        <article className="oj-card">
          <header className="oj-card-head">
            <h3>Order snapshot</h3>
            <span className="oj-mono">{formatMoney(order.totals?.totalPrice, currency)}</span>
          </header>
          <dl className="oj-telemetry">
            <div>
              <dt>Customer</dt>
              <dd>{order.customerName || '—'}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{order.email ? <a href={`mailto:${order.email}`}>{order.email}</a> : '—'}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{order.phone || dest?.phone || order.billingAddress?.phone || '—'}</dd>
            </div>
            <div>
              <dt>Channel</dt>
              <dd>{order.channel || 'shopify'}{order.isB2B ? ' · B2B' : ''}</dd>
            </div>
            <div>
              <dt>Shopify order</dt>
              <dd className="oj-mono">{order.shopifyOrderId || '—'}</dd>
            </div>
            {order.poNumber ? (
              <div>
                <dt>PO</dt>
                <dd className="oj-mono">{order.poNumber}</dd>
              </div>
            ) : null}
            {order.tags ? (
              <div>
                <dt>Tags</dt>
                <dd>{order.tags}</dd>
              </div>
            ) : null}
            {order.riskLevel && order.riskLevel !== 'NONE' ? (
              <div>
                <dt>Risk</dt>
                <dd>{order.riskLevel}</dd>
              </div>
            ) : null}
            <div>
              <dt>Ship method</dt>
              <dd>
                {order.shippingMethod?.title ||
                  order.shippingMethod?.shopifyServiceCode ||
                  order.shippingMethod?.wmsShipCode ||
                  '—'}
              </dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd className="oj-mono">{new Date(order.createdAt).toLocaleString()}</dd>
            </div>
          </dl>
          {(order.totals?.subtotal || order.totals?.totalPrice) && (
            <dl className="oj-money-grid">
              <div>
                <dt>Subtotal</dt>
                <dd>{formatMoney(order.totals?.subtotal, currency)}</dd>
              </div>
              <div>
                <dt>Shipping</dt>
                <dd>{formatMoney(order.totals?.totalShipping || order.shippingMethod?.price, currency)}</dd>
              </div>
              <div>
                <dt>Tax</dt>
                <dd>{formatMoney(order.totals?.totalTax, currency)}</dd>
              </div>
              <div>
                <dt>Discounts</dt>
                <dd>
                  {order.totals?.totalDiscounts ? formatMoney(order.totals.totalDiscounts, currency) : '—'}
                </dd>
              </div>
            </dl>
          )}
          {order.giftMessage ? (
            <div className="oj-note">
              <strong>Note</strong>
              <p>{order.giftMessage}</p>
            </div>
          ) : null}
        </article>

        <article className="oj-card">
          <header className="oj-card-head">
            <h3>Ship &amp; bill to</h3>
          </header>
          <div className="oj-addr-grid">
            <div>
              <div className="oj-addr-label">Shipping</div>
              {formatAddress(order.shippingAddress).length ? (
                <address className="oj-addr">
                  {formatAddress(order.shippingAddress).map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </address>
              ) : (
                <p className="oj-field-hint">No shipping address</p>
              )}
            </div>
            <div>
              <div className="oj-addr-label">Billing</div>
              {formatAddress(order.billingAddress).length ? (
                <address className="oj-addr">
                  {formatAddress(order.billingAddress).map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </address>
              ) : (
                <p className="oj-field-hint">Same as shipping / none</p>
              )}
            </div>
          </div>
        </article>

        <article className="oj-card">
          <header className="oj-card-head">
            <h3>Items</h3>
            <span className="oj-mono">{qtyTotal || lineItems.length}</span>
          </header>
          {lineItems.length ? (
            <ul className="oj-item-list">
              {lineItems.map((row: OrderLineItem, idx) => (
                <li key={row.id || `${row.sku}-${idx}`} className="oj-item">
                  <div className="oj-item-body">
                    <div className="oj-item-title">{row.title || row.name || 'Item'}</div>
                    <div className="oj-item-meta">
                      <span className="oj-mono">{row.sku || '—'}</span>
                      <span>
                        ×{row.quantity ?? 0}
                        {row.allocatedQty != null ? ` · alloc ${row.allocatedQty}` : ''}
                        {row.shippedQty != null ? ` · ship ${row.shippedQty}` : ''}
                      </span>
                      <span>{formatMoney(row.price, currency)}</span>
                    </div>
                    {row.fulfillmentStatus || row.status ? (
                      <div className="oj-item-status">{row.fulfillmentStatus || row.status}</div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="oj-field-hint">No line items.</p>
          )}
        </article>
      </section>

      <section className="order-journey-cards order-journey-cards--2">
        <article className="oj-card">
          <header className="oj-card-head">
            <h3>Why this route</h3>
          </header>
          <ul className="oj-reason-list">
            {reasons.map((r) => (
              <li key={r.title}>
                <span className="oj-reason-mark" aria-hidden />
                <div>
                  <div className="oj-reason-title">{r.title}</div>
                  <div className="oj-reason-detail">{r.detail}</div>
                </div>
              </li>
            ))}
          </ul>
        </article>

        <article className="oj-card">
          <header className="oj-card-head">
            <h3>Live package</h3>
            <span className="oj-mono oj-telemetry-status">
              {(primaryShipment?.status || (groups.some((g) => g.status === 'shipped') ? 'shipped' : 'pending')).replace(
                /_/g,
                ' ',
              )}
            </span>
          </header>
          <div className="oj-bar oj-bar--lg">
            <span style={{ width: `${shipProg}%` }} />
          </div>
          <dl className="oj-telemetry">
            <div>
              <dt>Carrier</dt>
              <dd>{primaryShipment?.carrier || order.carrier || '—'}</dd>
            </div>
            <div>
              <dt>Tracking</dt>
              <dd>
                {primaryShipment?.trackingNumber || order.trackingNumber ? (
                  <TruncatedCopyId value={primaryShipment?.trackingNumber || order.trackingNumber} maxLen={22} />
                ) : (
                  '—'
                )}
              </dd>
            </div>
            {primaryShipment?.trackingUrl ? (
              <div>
                <dt>Track link</dt>
                <dd>
                  <a href={primaryShipment.trackingUrl} target="_blank" rel="noreferrer">
                    Open carrier
                  </a>
                </dd>
              </div>
            ) : null}
            <div>
              <dt>Warehouse</dt>
              <dd>{primaryWh || '—'}</dd>
            </div>
            <div>
              <dt>Shopify fulfillment</dt>
              <dd className="oj-mono">
                {primaryShipment?.shopifyFulfillmentId || (needsShopifySync ? 'Pending push' : '—')}
              </dd>
            </div>
          </dl>
        </article>
      </section>

      {/* Returns — always visible with basics */}
      <section className="oj-panel oj-returns-panel">
        <header className="oj-panel-head">
          <div>
            <h3>Returns</h3>
            <p className="oj-panel-sub">
              {returns.length
                ? `${returns.length} RMA${returns.length === 1 ? '' : 's'} on this order`
                : 'Create and track returns here without leaving this screen'}
            </p>
          </div>
          <button type="button" className="demo-btn demo-btn-sm" onClick={() => void navigate({ to: '/account/returns' })}>
            All returns
          </button>
        </header>

        <div className="oj-returns-stats">
          <div className="oj-returns-stat">
            <span className="oj-kpi-label">Open</span>
            <strong>
              {returns.filter((r) => !/restocked|closed|cancelled|disposed/i.test(r.status)).length}
            </strong>
          </div>
          <div className="oj-returns-stat">
            <span className="oj-kpi-label">Received</span>
            <strong>{returns.filter((r) => /received|inspect/i.test(r.status)).length}</strong>
          </div>
          <div className="oj-returns-stat">
            <span className="oj-kpi-label">Restocked</span>
            <strong>{returns.filter((r) => /restock/i.test(r.status)).length}</strong>
          </div>
          <div className="oj-returns-stat">
            <span className="oj-kpi-label">Total</span>
            <strong>{returns.length}</strong>
          </div>
        </div>

        <div className="oj-field-row" style={{ marginTop: '0.85rem' }}>
          <input
            className="demo-input flex-1"
            placeholder="Return reason"
            value={returnReason}
            onChange={(e) => setReturnReason(e.target.value)}
          />
          <button
            type="button"
            className="demo-btn demo-btn-sm demo-btn-primary"
            disabled={
              creatingReturn ||
              (!groups.some((g) => g.status === 'shipped') &&
                order.status !== 'fulfilled' &&
                order.status !== 'partially_fulfilled')
            }
            onClick={() => void startReturn()}
          >
            {creatingReturn ? 'Creating…' : 'Create return'}
          </button>
        </div>

        {returns.length === 0 ? (
          <p className="oj-field-hint" style={{ marginTop: '0.75rem' }}>
            No returns yet. After ship, create an RMA here to track receive / restock.
          </p>
        ) : (
          <ul className="oj-return-list oj-return-list--rich">
            {returns.map((r) => (
              <li key={r.id}>
                <div className="oj-return-main">
                  <StatusBadge status={r.status} />
                  <span className="oj-mono">{r.rmaNumber}</span>
                  {r.disposition ? <span className="oj-pill oj-pill--muted">{r.disposition}</span> : null}
                </div>
                <div className="oj-return-meta">
                  {(r.lines || []).map((l) => `${l.sku}×${l.quantity}`).join(', ') || `${r.lines?.length || 0} line(s)`}
                  {r.reason ? ` · ${r.reason}` : ''}
                  {r.trackingNumber ? ` · ${r.carrier || 'Carrier'} ${r.trackingNumber}` : ''}
                </div>
                <div className="oj-return-dates oj-mono">
                  {r.createdAt ? `Opened ${new Date(r.createdAt).toLocaleDateString()}` : null}
                  {r.receivedAt ? ` · Received ${new Date(r.receivedAt).toLocaleDateString()}` : null}
                  {r.restockedAt ? ` · Restocked ${new Date(r.restockedAt).toLocaleDateString()}` : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="order-journey-ops order-journey-ops--single">
        <section className="oj-panel">
          <header className="oj-panel-head">
            <h3>Actions</h3>
            <span className="oj-mono">{groups.length ? `${groups.length} group${groups.length === 1 ? '' : 's'}` : '—'}</span>
          </header>

          {canAssign ? (
            <div className="oj-field">
              <label className="oj-field-label" htmlFor="oj-warehouse">
                Primary warehouse
              </label>
              <div className="oj-field-row">
                <select
                  id="oj-warehouse"
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
                  className="demo-btn demo-btn-sm demo-btn-primary"
                  disabled={assigning || selectedWarehouseId === (order.warehouseId || '')}
                  onClick={() => void assignSelectedWarehouse()}
                >
                  {assigning ? 'Saving…' : 'Assign'}
                </button>
              </div>
              <p className="oj-field-hint">
                {eligibleWarehouses.length === 0
                  ? 'No warehouse has inventory for these SKUs yet.'
                  : order.suggestedWarehouseId && !order.warehouseId
                    ? 'Accept the suggestion above, or pick another warehouse.'
                    : 'Only warehouses that stock this order’s SKUs.'}
              </p>
            </div>
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
            <p className="oj-field-hint">Split order — ship each fulfillment group below.</p>
          )}

          <div className="oj-fulfillment">
            <OrderFulfillmentPanel orderId={order.id} warehouses={warehouses} onDone={onDone} onError={setError} hideLogs />
          </div>
        </section>
      </div>

      {/* Activity always last */}
      <section className="order-journey-audit">
        <header className="order-journey-audit-head">
          <div>
            <h3>Activity</h3>
            <p className="oj-panel-sub">Shopify sync, warehouse, and carrier events for this order</p>
          </div>
          <div className="order-journey-audit-tools">
            <span className="oj-mono">{audit.length}</span>
            <button
              type="button"
              className={`demo-btn demo-btn-sm ${showEvents ? 'is-active' : ''}`}
              onClick={() => setShowEvents((v) => !v)}
            >
              {showEvents ? 'Hide detail' : 'Full events'}
            </button>
          </div>
        </header>

        {/* Shopify ↔ shipment sync strip */}
        {groups.length > 0 ? (
          <ul className="oj-sync-strip">
            {groups.map((g) => {
              const shipment = shipments.find((s) => s.fulfillmentGroupId === g.id)
              const synced = Boolean(shipment?.shopifyFulfillmentId)
              return (
                <li key={g.id}>
                  <StatusBadge status={g.status} />
                  <span className="oj-mono">
                    {(g.lines || []).map((l) => `${l.sku}×${l.allocatedQty || l.quantity}`).join(', ') || 'Group'}
                  </span>
                  {g.status === 'shipped' ? (
                    synced ? (
                      <StatusBadge status="fulfilled" label="Shopify synced" />
                    ) : (
                      <StatusBadge status="error" label="Shopify pending" variant="warning" />
                    )
                  ) : (
                    <span className="oj-field-hint">Not shipped</span>
                  )}
                  {shipment?.shopifyFulfillmentId ? (
                    <span className="oj-mono oj-sync-id">{shipment.shopifyFulfillmentId}</span>
                  ) : null}
                </li>
              )
            })}
          </ul>
        ) : null}

        <ul className="oj-activity">
          {audit.length === 0 ? (
            <li className="is-empty">No events yet.</li>
          ) : (
            audit.map((row) => (
              <li key={row.id}>
                <span className={`oj-activity-dot ${row.ok ? 'is-ok' : 'is-warn'}`} />
                <div className="oj-activity-body">
                  <div className="oj-activity-top">
                    <strong>{row.event}</strong>
                    <span className="oj-mono">
                      {new Date(row.at).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <div className="oj-activity-detail">
                    {row.origin}
                    {row.details ? ` · ${row.details}` : ''}
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>

        {showEvents ? (
          <div className="oj-events-embed">
            <OrderEventsPanel logs={logs} groups={groups} shipments={shipments} />
          </div>
        ) : null}
      </section>
    </div>
  )
}
