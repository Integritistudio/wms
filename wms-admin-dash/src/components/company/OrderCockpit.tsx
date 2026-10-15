import { ArrowLeft, ArrowRight, ArrowUpRight, Box, Check, Clock3, GitBranch, MapPin, PackageCheck, RefreshCw, RotateCcw, Truck, Warehouse } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { formatActivityEvent, formatActivityMessage } from '../../lib/activityLog'
import {
  SHIPMENT_STATUS_OPTIONS,
  downloadFileLink,
  updateShipmentStatus,
  type ActivityLogEntry,
  type FulfillmentGroup,
  type ReturnRecord,
  type ShipmentRecord,
  type ShopOrder,
} from '../../lib/api'

const SHIPMENT_NEXT: Record<string, string[]> = {
  pending: ['labeled', 'in_transit'],
  labeled: ['in_transit', 'out_for_delivery', 'delivered'],
  in_transit: ['out_for_delivery', 'delivered'],
  shipped: ['out_for_delivery', 'delivered'],
  out_for_delivery: ['delivered'],
  delivered: ['returned'],
  failed: ['in_transit', 'delivered', 'returned'],
  returned: [],
}

const SCAN_STEPS: Array<{ id: string; label: string }> = [
  { id: 'labeled', label: 'Label' },
  { id: 'in_transit', label: 'Transit' },
  { id: 'out_for_delivery', label: 'Out for delivery' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'returned', label: 'Return' },
]

function shipmentStatusLabel(status: string) {
  return SHIPMENT_STATUS_OPTIONS.find((o) => o.value === status)?.label || title(status)
}

function shipmentReachedIndex(status: string, trackingNumber?: string | null) {
  if (status === 'returned') return 4
  if (status === 'delivered') return 3
  if (status === 'out_for_delivery') return 2
  if (status === 'in_transit' || status === 'shipped') return 1
  if (status === 'labeled' || trackingNumber) return 0
  return -1
}

type WarehouseLite = { id: string; name: string }

function money(value: string | undefined, currency: string | undefined) {
  if (value == null || value === '') return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return value
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' }).format(n) }
  catch { return `${n.toFixed(2)} ${currency || ''}`.trim() }
}

function stamp(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
}

function title(value?: string | null) {
  if (!value) return 'Pending'
  return value
    .replace(/_/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function OrderCockpit({ order, groups, shipments, returns, logs, warehouses, shopDomain, operations, railActions, fulfillmentWorkbench, needsShopifySync, onViewReturn, onBack, onRefresh, onSync, syncing, onShipmentStatusChange, onShipmentError }: {
  order: ShopOrder
  groups: FulfillmentGroup[]
  shipments: ShipmentRecord[]
  returns: ReturnRecord[]
  logs: ActivityLogEntry[]
  warehouses: WarehouseLite[]
  shopDomain?: string
  operations: ReactNode
  railActions?: ReactNode
  fulfillmentWorkbench: ReactNode
  needsShopifySync: boolean
  onViewReturn?: (returnId: string) => void
  onBack: () => void
  onRefresh: () => void
  onSync: () => void
  syncing: boolean
  onShipmentStatusChange?: () => void
  onShipmentError?: (message: string) => void
}) {
  const [busyShipmentId, setBusyShipmentId] = useState<string | null>(null)
  const lines = order.lineItems || []
  const paths = groups.length ? groups : [null]
  const orderStatus = String(order.status || '').toLowerCase()
  const shipmentFor = (groupId: string) => shipments.find((s) => s.fulfillmentGroupId === groupId)
  // Delivered only when every fulfillment path has a delivered shipment — not when
  // the only existing shipment(s) happen to be delivered while other groups are still pending.
  const allShipped = groups.length > 0 && groups.every((g) => g.status === 'shipped')
  const delivered =
    groups.length > 0
      ? groups.every((g) => g.status === 'shipped' && shipmentFor(g.id)?.status === 'delivered')
      : shipments.length > 0 && shipments.every((s) => s.status === 'delivered')
  const hasReturn =
    returns.length > 0 ||
    shipments.some((s) => s.status === 'returned') ||
    ['returned', 'partially_returned'].includes(orderStatus)
  const moving = shipments.some((s) =>
    ['in_transit', 'shipped', 'out_for_delivery', 'delivered', 'labeled'].includes(s.status),
  )
  const allocated = groups.some((g) => g.status === 'allocated' || g.status === 'on_hold') || Boolean(order.warehouseId)
  const unassigned = !groups.length && !order.warehouseId
  const partial =
    !delivered &&
    (orderStatus === 'partially_fulfilled' ||
      (groups.length > 1 &&
        (groups.some((g) => g.status === 'shipped') || shipments.length > 0) &&
        (!allShipped || !groups.every((g) => shipmentFor(g.id)?.status === 'delivered'))) ||
      (shipments.some((s) => s.status === 'delivered') && groups.some((g) => g.status !== 'shipped')))
  const pushHeld = Boolean(order.wmsPushDeferred)
  const status = hasReturn
    ? 'Return In Progress'
    : pushHeld
      ? 'Hold · Push Pending'
      : delivered || (orderStatus === 'fulfilled' && !partial && (groups.length === 0 || allShipped))
        ? 'Delivered'
        : partial
          ? 'Partial'
          : moving
            ? shipments.some((s) => s.status === 'out_for_delivery')
              ? 'Out For Delivery'
              : shipments.some((s) => s.status === 'in_transit' || s.status === 'shipped')
                ? 'In Transit'
                : 'In Fulfillment'
            : allocated
              ? 'Allocated'
              : unassigned
                ? 'Unassigned'
                : groups.length
                  ? 'In Fulfillment'
                  : 'Routing'
  const statusTone = hasReturn
    ? 'return'
    : pushHeld
      ? 'allocated'
      : unassigned || status === 'Routing'
        ? 'unassigned'
        : status === 'Allocated' || status === 'Partial'
          ? 'allocated'
          : 'active'
  const address = order.shippingAddress
  const place = (value?: string | null) => {
    const raw = String(value || '').trim()
    if (!raw) return ''
    if (/^[A-Za-z]{2,3}$/.test(raw)) return raw.toUpperCase()
    return title(raw)
  }
  const destination =
    [place(address?.city), place(address?.provinceCode || address?.province), place(address?.countryCode || address?.country)]
      .filter(Boolean)
      .join(', ') || 'Destination Pending'
  const quantity = lines.reduce((sum, line) => sum + (line.quantity || 0), 0)
  const stages = [
    true,
    groups.length > 0,
    groups.some((g) => g.status === 'shipped') || shipments.length > 0,
    allShipped && shipments.length > 0,
    delivered,
  ]
  const stageCount = stages.filter(Boolean).length
  // Highlight the journey card that matches where the order is now.
  const currentStage: 'source' | 'route' | 'fulfill' | 'carrier' | 'arrive' = hasReturn
    ? 'arrive'
    : delivered
      ? 'arrive'
      : !groups.length
        ? unassigned || status === 'Routing'
          ? 'route'
          : 'source'
        : groups.some((g) => g.status !== 'shipped')
          ? 'fulfill'
          : shipments.some((s) => s.status === 'out_for_delivery') || partial
            ? 'arrive'
            : shipments.some((s) =>
                  ['in_transit', 'shipped', 'labeled', 'delivered'].includes(s.status),
                ) || moving
              ? 'carrier'
              : 'fulfill'
  const shopifySyncLabel = order.source === 'demo' ? 'Demo Order' : needsShopifySync ? 'Push Required' : groups.some((group) => group.status === 'shipped') ? 'Synchronized' : 'Not Shipped Yet'
  const latest = [...logs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  const warehouse = (id?: string | null) => warehouses.find((w) => w.id === id)?.name || (id ? `Warehouse ${id.slice(-4)}` : 'Warehouse Pending')
  const primaryReturn = returns.length
    ? [...returns].sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime())[0]
    : null
  const returnStatusLabel = primaryReturn
    ? title(primaryReturn.status)
    : shipments.some((s) => s.status === 'returned')
      ? 'Returned'
      : orderStatus === 'partially_returned'
        ? 'Partially Returned'
        : orderStatus === 'returned'
          ? 'Returned'
          : null

  function shipmentHasReturn(shipment: ShipmentRecord) {
    if (shipment.status === 'returned') return true
    const splitOrder = shipments.length > 1
    return returns.some((record) => {
      if (String(record.status || '').toLowerCase() === 'cancelled') return false
      if (record.shipmentId) return record.shipmentId === shipment.id
      if (record.warehouseId && record.warehouseId === shipment.warehouseId) return true
      if (!record.shipmentId && !splitOrder) return true
      if (!record.shipmentId && !record.warehouseId) return true
      return false
    })
  }

  function nextStatusesFor(shipment: ShipmentRecord) {
    const hasReturn = shipmentHasReturn(shipment)
    return (SHIPMENT_NEXT[shipment.status] || []).filter((status) => !(status === 'returned' && hasReturn))
  }

  async function advanceShipment(shipmentId: string, status: string) {
    const shipment = shipments.find((item) => item.id === shipmentId)
    if (status === 'returned' && shipment && shipmentHasReturn(shipment)) {
      onShipmentError?.('This shipment path already has a return')
      return
    }
    setBusyShipmentId(shipmentId)
    try {
      const result = await updateShipmentStatus(shipmentId, { status })
      if (onShipmentStatusChange) onShipmentStatusChange()
      else onRefresh()
      if (result.shopifyError) {
        onShipmentError?.(`Updated locally; Shopify tracking event failed: ${result.shopifyError}`)
      }
    } catch (err) {
      onShipmentError?.(err instanceof Error ? err.message : 'Unable to update shipment')
    } finally {
      setBusyShipmentId(null)
    }
  }

  return <main className="oc-screen">
    <header className="oc-topbar">
      <button className="oc-icon-button" type="button" onClick={onBack} aria-label="Back to orders"><ArrowLeft size={19} /></button>
      <div className="oc-topbar-id"><span>ORDERS</span><strong>#{String(order.orderNumber).replace(/^#/, '')}</strong></div>
      <span className="oc-live"><span /> LIVE</span>
      <div className="oc-topbar-actions">
        <button type="button" onClick={onRefresh}><RefreshCw size={16} /> Refresh</button>
        {needsShopifySync ? <button type="button" className="oc-primary-btn" onClick={onSync} disabled={syncing}><ArrowUpRight size={16} /> {syncing ? 'Syncing…' : 'Sync Shopify'}</button> : null}
      </div>
    </header>

    <section className="oc-hero">
      <div className="oc-hero-mist" aria-hidden />
      <div className="oc-hero-orb oc-hero-orb--a" aria-hidden />
      <div className="oc-hero-orb oc-hero-orb--b" aria-hidden />
      <div className="oc-hero-copy">
        <div className="oc-eyebrow"><img src="/shopify-logo-svgrepo-com.svg" alt="" /> <span>ORDER · {shopDomain || 'SHOPIFY'}</span></div>
        <div className="oc-hero-title-row">
          <h1>Order <em>#{String(order.orderNumber).replace(/^#/, '')}</em></h1>
          <span className={`oc-hero-pill is-${statusTone}`}>{status}</span>
        </div>
        <p>Placed {stamp(order.createdAt)} · {quantity} {quantity === 1 ? 'unit' : 'units'}</p>
      </div>
      <div className={`oc-intro-status is-${statusTone}`}>
        <span className="oc-intro-status-label">CURRENT STATE</span>
        <strong>{status}</strong>
        <span>{paths.length} Fulfillment {paths.length === 1 ? 'Path' : 'Paths'} <ArrowRight size={16} /> {destination}</span>
      </div>
    </section>

    <section className="oc-pulse" aria-label="Order at a glance"><div className="oc-pulse-progress"><span>FULFILLMENT PROGRESS</span><strong>{stageCount} / 5 stages</strong><div className="oc-pulse-track">{stages.map((done, index) => <i className={done ? 'is-done' : ''} key={index} />)}</div></div><div><span>SHOPIFY SYNC</span><strong>{shopifySyncLabel}</strong></div><div><span>WAREHOUSE ROUTES</span><strong>{groups.length || 'Pending'}</strong></div><div><span>SHIPMENT SCANS</span><strong>{shipments.reduce((n, s) => n + (s.statusHistory?.length || 0), 0)}</strong></div><div><span>RETURNS</span><strong>{returns.length}</strong></div></section>

    <section className="oc-map" aria-label="Order journey">
      <div className="oc-section-heading oc-journey-heading" tabIndex={0}>
        <span>THE JOURNEY</span>
        <strong>From click to doorstep</strong>
        <span>{paths.length > 1 ? 'SPLIT FULFILLMENT' : 'SINGLE PATH'}</span>
        <JourneyTip
          title="Journey overview"
          rows={[
            ['Order', `#${String(order.orderNumber).replace(/^#/, '')}`],
            ['Fulfillment', `${paths.length} ${paths.length === 1 ? 'path' : 'paths'}`],
            ['Now', status],
          ]}
        />
      </div>
      <div className="oc-map-grid">
        <div className={`oc-map-node oc-map-source${stages[0] ? ' is-done' : ''}${currentStage === 'source' ? ' is-current' : ''}`} tabIndex={0}>
          <span className="oc-map-step">SOURCE</span>
          <span className="oc-map-icon"><img src="/shopify-logo-svgrepo-com.svg" alt="" /></span>
          <strong>Shopify order</strong>
          <small>{shopDomain || order.channel || 'Shopify'}</small>
          <em>{quantity} units received</em>
          <JourneyTip
            title="Order received"
            rows={[
              ['Store', shopDomain || 'Shopify'],
              ['Created', stamp(order.createdAt)],
              ['Items', `${lines.length} products · ${quantity} units`],
            ]}
          />
        </div>
        <div className="oc-map-arrow is-next"><ArrowRight size={24} strokeWidth={2.25} /></div>
        <div className={`oc-map-node oc-map-route${stages[1] ? ' is-done' : ''}${currentStage === 'route' ? ' is-current' : ''}`} tabIndex={0}>
          <span className="oc-map-step">DECISION</span>
          <span className="oc-map-icon"><GitBranch size={22} /></span>
          <strong>{groups.length ? 'Route selected' : 'Routing pending'}</strong>
          <small>{order.routingReason || (groups.length > 1 ? 'Split by inventory availability' : groups.length ? 'Available stock matched' : 'Awaiting inventory match')}</small>
          <em>{paths.length} {paths.length === 1 ? 'route' : 'routes'} generated</em>
          <JourneyTip
            title="Routing decision"
            rows={[
              ['Reason', order.routingReason || 'Inventory availability'],
              ['Paths', String(paths.length)],
              ['Status', groups.length ? 'Assigned' : 'Awaiting assignment'],
            ]}
          />
        </div>
        <div className="oc-map-arrow is-next"><ArrowRight size={24} strokeWidth={2.25} /></div>
        <div className="oc-map-lanes">
          {paths.map((group, index) => {
            const shipment = group ? shipments.find((s) => s.fulfillmentGroupId === group.id) : shipments[0]
            const pathItems = group?.lines?.length ? group.lines : lines
            const pathPending = Boolean(group && group.status !== 'shipped')
            const pathMoving = Boolean(
              shipment && ['labeled', 'in_transit', 'shipped', 'out_for_delivery'].includes(shipment.status),
            )
            return <div className="oc-map-lane" key={group?.id || 'pending'}>
              <div className="oc-lane-label"><span>PATH {index + 1}</span><strong>{title(shipment?.status || group?.status)}</strong></div>
              <div className={`oc-map-node oc-map-warehouse${group ? ' is-done' : ''}${currentStage === 'fulfill' && (pathPending || !group) ? ' is-current' : ''}`} tabIndex={0}>
                <span className="oc-map-step">FULFILL</span>
                <span className="oc-map-icon"><Warehouse size={22} /></span>
                <strong>{warehouse(group?.warehouseId || order.warehouseId)}</strong>
                <small>{pathItems.length} {pathItems.length === 1 ? 'line' : 'lines'} · {group?.method || 'Warehouse processing'}</small>
                <em>{group?.status === 'shipped' ? 'Dispatched' : group ? 'Stock allocated' : 'Awaiting assignment'}</em>
                <JourneyTip
                  title={`Warehouse · Path ${index + 1}`}
                  rows={[
                    ['Location', warehouse(group?.warehouseId || order.warehouseId)],
                    ['Items', `${pathItems.length} lines`],
                    ['State', title(group?.status)],
                  ]}
                />
              </div>
              <div className="oc-map-arrow is-next"><ArrowRight size={24} strokeWidth={2.25} /></div>
              <div className={`oc-map-node oc-map-carrier${shipment ? ' is-done' : ''}${currentStage === 'carrier' && (pathMoving || !pathPending) ? ' is-current' : ''}`} tabIndex={0}>
                <span className="oc-map-step">MOVE</span>
                <span className="oc-map-icon"><Truck size={22} /></span>
                <strong>{shipment?.carrier || order.carrier || 'Carrier pending'}</strong>
                <small>{shipment?.trackingNumber || order.trackingNumber || 'Tracking not issued'}</small>
                <em>{title(shipment?.status)}</em>
                <JourneyTip
                  title={`Carrier · Path ${index + 1}`}
                  rows={[
                    ['Carrier', shipment?.carrier || order.carrier || 'Pending'],
                    ['Tracking', shipment?.trackingNumber || order.trackingNumber || 'Not issued'],
                    ['State', title(shipment?.status)],
                  ]}
                />
              </div>
            </div>
          })}
        </div>
        <div className="oc-map-arrow is-next"><ArrowRight size={24} strokeWidth={2.25} /></div>
        <div className={`oc-map-node oc-map-destination${delivered || hasReturn ? ' is-done' : ''}${currentStage === 'arrive' ? ' is-current' : ''}${hasReturn ? ' is-return' : ''}`} tabIndex={0}>
          <span className="oc-map-step">{hasReturn ? 'RETURN' : 'ARRIVE'}</span>
          <span className="oc-map-icon">{hasReturn ? <RotateCcw size={22} /> : <MapPin size={22} />}</span>
          <strong>
            {hasReturn
              ? returnStatusLabel || 'Return in progress'
              : delivered
                ? 'Delivered'
                : partial
                  ? 'In progress'
                  : 'Destination'}
          </strong>
          <small>
            {hasReturn
              ? primaryReturn?.rmaNumber
                ? `RMA ${primaryReturn.rmaNumber}${returns.length > 1 ? ` · +${returns.length - 1} more` : ''}`
                : destination
              : destination}
          </small>
          <em>
            {hasReturn
              ? primaryReturn
                ? `${primaryReturn.lines.length} ${primaryReturn.lines.length === 1 ? 'line' : 'lines'} · ${title(primaryReturn.disposition || primaryReturn.status)}`
                : 'Return active'
              : delivered
                ? 'All packages arrived'
                : partial
                  ? 'Waiting on remaining packages'
                  : 'Customer handoff'}
          </em>
          <JourneyTip
            title={hasReturn ? 'Return status' : 'Customer handoff'}
            rows={
              hasReturn
                ? [
                    ['Recipient', address?.name || order.customerName || 'Not supplied'],
                    ['Destination', destination],
                    ['Return', returnStatusLabel || 'In progress'],
                    ...(primaryReturn?.rmaNumber ? [['RMA', primaryReturn.rmaNumber] as [string, string]] : []),
                    ...(primaryReturn?.disposition
                      ? [['Disposition', title(primaryReturn.disposition)] as [string, string]]
                      : []),
                    ['Records', String(returns.length || 1)],
                  ]
                : [
                    ['Recipient', address?.name || order.customerName || 'Not supplied'],
                    ['Destination', destination],
                    ['State', delivered ? 'Delivered' : partial ? 'In progress' : 'Awaiting delivery'],
                  ]
            }
          />
        </div>
      </div>
    </section>

    <div className="oc-content">
      <div className="oc-primary">
        <section className="oc-panel oc-items"><div className="oc-panel-heading"><div><span>THE GOODS</span><h2>What’s Moving</h2></div><b>{lines.length} SKUS / {quantity} UNITS</b></div>
          <div className="oc-item-head"><span>PRODUCT</span><span>SKU</span><span>QTY</span><span>STATUS</span></div>
          {lines.length ? lines.map((line, i) => { const itemQty = line.quantity || 0; const moved = Math.min(itemQty, line.shippedQty || 0); const allocated = Math.min(itemQty, Math.max(moved, line.allocatedQty || 0)); return <div className="oc-item-row" key={line.id || `${line.sku}-${i}`}><div className="oc-item-name"><span className="oc-item-symbol">{line.imageUrl ? <img src={line.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <Box size={20} />}</span><strong>{line.title || line.name || 'Untitled item'}<small>{line.variantTitle && line.variantTitle !== 'Default Title' ? line.variantTitle : money(line.price, order.currency)}</small><span className="oc-item-meter" aria-label={`${moved} shipped, ${allocated} allocated of ${itemQty}`}><i style={{ width: `${itemQty ? allocated / itemQty * 100 : 0}%` }} /><i style={{ width: `${itemQty ? moved / itemQty * 100 : 0}%` }} /></span></strong></div><span className="oc-sku">{line.sku || '—'}</span><strong>×{itemQty}</strong><span className="oc-item-status">{title(line.fulfillmentStatus || line.status || order.status)}</span></div> }) : <p className="oc-empty">No line items recorded.</p>}
        </section>
        <section className="oc-panel oc-shipments">
          <div className="oc-panel-heading">
            <div>
              <span>PACKAGE CONTROL</span>
              <h2>Shipment Manifest</h2>
            </div>
            <b>{shipments.length} SHIPMENTS</b>
          </div>
          {shipments.length ? shipments.map((shipment, i) => {
            const hasReturn = shipmentHasReturn(shipment)
            const next = nextStatusesFor(shipment)
            const primary = next[0]
            const extras = next.slice(1)
            const busy = busyShipmentId === shipment.id
            const scanSteps = hasReturn || shipment.status === 'returned' || next.includes('returned')
              ? SCAN_STEPS
              : SCAN_STEPS.filter((step) => step.id !== 'returned')
            const reached = shipmentReachedIndex(shipment.status, shipment.trackingNumber)
            return (
              <div className="oc-shipment-block" key={shipment.id}>
                <div className="oc-shipment">
                  <span className="oc-shipment-index">{String(i + 1).padStart(2, '0')}</span>
                  <div>
                    <strong>{shipment.carrier || 'Unassigned carrier'}</strong>
                    <small>{warehouse(shipment.warehouseId)}</small>
                  </div>
                  <div>
                    <span>TRACKING</span>
                    <strong>{shipment.trackingNumber || 'Awaiting label'}</strong>
                  </div>
                  <span className={`oc-shipment-status${hasReturn || shipment.status === 'returned' ? ' is-return' : ''}`}>
                    {title(shipment.status)}
                  </span>
                  {shipment.trackingUrl ? (
                    <a href={shipment.trackingUrl} target="_blank" rel="noreferrer" aria-label="Track shipment">
                      <ArrowUpRight size={18} />
                    </a>
                  ) : null}
                </div>
                <div className="oc-scan-track" style={{ gridTemplateColumns: `repeat(${scanSteps.length}, minmax(0, 1fr))` }}>
                  {scanSteps.map((step, stepIndex) => {
                    const current = reached === stepIndex
                    const done = reached > stepIndex
                    const canJump = next.includes(step.id)
                    const isReturn = step.id === 'returned'
                    return (
                      <button
                        type="button"
                        key={step.id}
                        className={`${done ? 'is-reached ' : ''}${current ? 'is-current ' : ''}${isReturn ? 'is-return ' : ''}${canJump ? 'is-actionable' : ''}`}
                        disabled={!canJump || busy}
                        title={canJump ? `Mark ${step.label}` : step.label}
                        onClick={() => {
                          if (!canJump) return
                          void advanceShipment(shipment.id, step.id)
                        }}
                      >
                        <span>{done ? <Check size={15} /> : stepIndex + 1}</span>
                        <small>{step.label}</small>
                      </button>
                    )
                  })}
                </div>
                <div className="oc-shipment-actions">
                  {primary ? (
                    <button
                      type="button"
                      className={`oc-shipment-advance${primary === 'returned' ? ' is-return' : ''}`}
                      disabled={busy}
                      onClick={() => void advanceShipment(shipment.id, primary)}
                    >
                      {busy ? 'Updating…' : `Mark ${shipmentStatusLabel(primary)}`}
                    </button>
                  ) : hasReturn && shipment.status !== 'returned' ? (
                    <span className="oc-shipment-done">Return already created</span>
                  ) : (
                    <span className="oc-shipment-done">Complete</span>
                  )}
                  {extras.map((status) => (
                    <button
                      key={status}
                      type="button"
                      className={`oc-shipment-advance is-secondary${status === 'returned' ? ' is-return' : ''}`}
                      disabled={busy}
                      onClick={() => void advanceShipment(shipment.id, status)}
                    >
                      {shipmentStatusLabel(status)}
                    </button>
                  ))}
                </div>
                {shipment.statusHistory?.length ? (
                  <small className="oc-last-scan">
                    Latest scan: {title(shipment.statusHistory.at(-1)?.status)} · {stamp(shipment.statusHistory.at(-1)?.at)}
                  </small>
                ) : null}
              </div>
            )
          }) : (
            <div className="oc-shipment">
              <span className="oc-shipment-index">—</span>
              <div>
                <strong>No shipment yet</strong>
                <small>{groups.length ? 'Warehouse is preparing fulfillment' : 'Awaiting routing'}</small>
              </div>
            </div>
          )}
        </section>
        <details className="oc-fulfillment"><summary><span><Warehouse size={19} /> Fulfillment Groups</span><small>{groups.length} {groups.length === 1 ? 'group' : 'groups'} · open workbench</small></summary><div className="oc-fulfillment-body">{fulfillmentWorkbench}</div></details>
        <section className="oc-operations"><div className="oc-section-heading"><span>TAKE ACTION</span><strong>Operations Desk</strong><span>FULL ORDER CONTROL</span></div>{operations}</section>
        <section className="oc-panel oc-activity"><div className="oc-panel-heading"><div><span>LIVE LOG</span><h2>Events</h2></div><Clock3 size={21} /></div>{latest.length ? <div className="oc-events-scroll"><table className="oc-events-table"><thead><tr><th scope="col">Time</th><th scope="col">Event</th><th scope="col">Details</th></tr></thead><tbody>{latest.map((log) => <tr key={log.id}><td><time dateTime={log.createdAt}>{stamp(log.createdAt)}</time></td><td><strong>{formatActivityEvent(log)}</strong></td><td>{formatActivityMessage(log)}</td></tr>)}</tbody></table></div> : <p className="oc-empty">No activity recorded.</p>}</section>
      </div>
      <aside className="oc-rail">
        <section className="oc-panel oc-person"><div className="oc-panel-heading"><div><span>RECIPIENT</span><h2>Going To</h2></div><MapPin size={21} /></div><strong>{address?.name || order.customerName || 'Recipient not supplied'}</strong><p>{[address?.address1, address?.address2, [address?.city, address?.provinceCode || address?.province, address?.zip].filter(Boolean).join(', '), address?.country || address?.countryCode].filter(Boolean).join(' · ') || 'No shipping address was supplied with this Shopify order.'}</p><div className="oc-rail-meta"><span>METHOD</span><b>{order.shippingMethod?.title || order.shippingMethod?.shopifyServiceCode || 'Not supplied'}</b></div></section>
        {railActions}
        <section className="oc-panel oc-record"><div className="oc-panel-heading"><div><span>ORDER RECORD</span><h2>Identity &amp; Systems</h2></div><ShoppingBagIcon /></div><dl><div><dt>Customer</dt><dd>{order.customerName || '—'}</dd></div><div><dt>Email</dt><dd>{order.email ? <a href={`mailto:${order.email}`}>{order.email}</a> : '—'}</dd></div><div><dt>Phone</dt><dd>{order.phone || address?.phone || '—'}</dd></div><div><dt>Shopify ID</dt><dd>{order.shopifyOrderId || '—'}</dd></div><div><dt>PO / B2B</dt><dd>{order.poNumber || (order.isB2B ? 'B2B order' : '—')}</dd></div><div><dt>Risk</dt><dd>{order.riskLevel || '—'}</dd></div><div><dt>Tags</dt><dd>{order.tags || '—'}</dd></div><div><dt>Service code</dt><dd>{order.shippingMethod?.wmsShipCode || order.shippingMethod?.shopifyServiceCode || '—'}</dd></div><div><dt>EDI / WMS</dt><dd>{order.sftpStatus || 'Not sent'}{order.fileLink?.token || order.fileLink?.url ? <> · <button type="button" className="oc-inline-link" onClick={() => { void downloadFileLink(order.fileLink!).catch((err) => window.alert(err instanceof Error ? err.message : 'Unable to download 940')) }}>Download 940</button></> : null}</dd></div><div><dt>Bill to</dt><dd>{[order.billingAddress?.name,order.billingAddress?.address1,order.billingAddress?.city].filter(Boolean).join(' · ') || 'Same as shipping / not provided'}</dd></div>{order.giftMessage ? <div><dt>Gift note</dt><dd>{order.giftMessage}</dd></div> : null}</dl>{order.lastError || order.sftpError ? <div className="oc-record-error">{order.lastError || order.sftpError}</div> : null}</section>
        <section className="oc-panel oc-finance"><div className="oc-panel-heading"><div><span>ORDER VALUE</span><h2>Financials</h2></div><PackageCheck size={21} /></div><div><span>Subtotal</span><b>{money(order.totals?.subtotal, order.currency)}</b></div><div><span>Shipping</span><b>{money(order.totals?.totalShipping, order.currency)}</b></div><div><span>Discounts</span><b>{money(order.totals?.totalDiscounts, order.currency)}</b></div><div><span>Tax</span><b>{money(order.totals?.totalTax, order.currency)}</b></div><div className="oc-total"><span>Total</span><strong>{money(order.totals?.totalPrice, order.currency)}</strong></div></section>
        {returns.length ? (
          <section className="oc-panel oc-returns">
            <div className="oc-panel-heading">
              <div>
                <span>RETURNS / {returns.length}</span>
                <h2>Return Records</h2>
              </div>
              <RotateCcw size={21} />
            </div>
            <div className="oc-return-records">
              {returns.map((record) => (
                <div key={record.id}>
                  <strong>{record.rmaNumber}</strong>
                  <span>
                    {title(record.status)} · {record.lines.length}{' '}
                    {record.lines.length === 1 ? 'line' : 'lines'}
                  </span>
                  <button
                    type="button"
                    className="oc-return-view"
                    onClick={() => onViewReturn?.(record.id)}
                  >
                    View return
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </aside>
    </div>
  </main>
}

function ShoppingBagIcon() { return <img src="/shopify-logo-svgrepo-com.svg" alt="Shopify" className="oc-shopify-small" /> }

function JourneyTip({ title: heading, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <div className="oc-node-popover">
      <span>AT A GLANCE</span>
      <strong>{heading}</strong>
      {rows.map(([label, value]) => (
        <div key={label}>
          <small>{label}</small>
          <b>{value}</b>
        </div>
      ))}
    </div>
  )
}
