import { ArrowLeft, ArrowRight, ArrowUpRight, Box, Check, Clock3, GitBranch, MapPin, PackageCheck, RefreshCw, RotateCcw, Truck, Warehouse } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ActivityLogEntry, FulfillmentGroup, ReturnRecord, ShipmentRecord, ShopOrder } from '../../lib/api'

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
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function title(value?: string | null) { return value ? value.replace(/_/g, ' ') : 'Pending' }

export default function OrderCockpit({ order, groups, shipments, returns, logs, warehouses, shopDomain, operations, fulfillmentWorkbench, syncLabel, needsShopifySync, onBack, onClassic, onRefresh, onSync, syncing }: {
  order: ShopOrder
  groups: FulfillmentGroup[]
  shipments: ShipmentRecord[]
  returns: ReturnRecord[]
  logs: ActivityLogEntry[]
  warehouses: WarehouseLite[]
  shopDomain?: string
  operations: ReactNode
  fulfillmentWorkbench: ReactNode
  syncLabel: string
  needsShopifySync: boolean
  onBack: () => void
  onClassic: () => void
  onRefresh: () => void
  onSync: () => void
  syncing: boolean
}) {
  const lines = order.lineItems || []
  const paths = groups.length ? groups : [null]
  const delivered = shipments.length > 0 && shipments.every((s) => s.status === 'delivered')
  const status = returns.length ? 'Return in progress' : delivered ? 'Delivered' : shipments.some((s) => s.status === 'in_transit' || s.status === 'shipped') ? 'In transit' : groups.length ? 'In fulfillment' : 'Routing'
  const address = order.shippingAddress
  const destination = [address?.city, address?.provinceCode || address?.province, address?.countryCode || address?.country].filter(Boolean).join(', ') || 'Destination pending'
  const quantity = lines.reduce((sum, line) => sum + (line.quantity || 0), 0)
  const stages = [true, groups.length > 0, groups.some((g) => g.status === 'shipped'), shipments.length > 0, delivered]
  const stageCount = stages.filter(Boolean).length
  const latest = [...logs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  const warehouse = (id?: string | null) => warehouses.find((w) => w.id === id)?.name || (id ? `Warehouse ${id.slice(-4)}` : 'Warehouse pending')

  return <main className="oc-screen">
    <header className="oc-topbar">
      <button className="oc-icon-button" type="button" onClick={onBack} aria-label="Back to orders"><ArrowLeft size={19} /></button>
      <div className="oc-topbar-id"><span>ORDER INTELLIGENCE</span><strong>#{String(order.orderNumber).replace(/^#/, '')}</strong></div>
      <span className="oc-live"><span /> LIVE ORDER</span>
      <div className="oc-topbar-actions">
        <button type="button" onClick={onRefresh}><RefreshCw size={16} /> Refresh</button>
        {needsShopifySync ? <button type="button" onClick={onSync} disabled={syncing}><ArrowUpRight size={16} /> {syncing ? 'Syncing…' : 'Sync Shopify'}</button> : null}
        <button className="oc-switch" type="button" onClick={onClassic}>Classic view <ArrowUpRight size={15} /></button>
      </div>
    </header>

    <section className="oc-intro">
      <div><div className="oc-eyebrow"><img src="/shopify-logo-svgrepo-com.svg" alt="Shopify" /> <span>ORDER CONTROL / {shopDomain || 'SHOPIFY'}</span></div><h1>Order <em>#{String(order.orderNumber).replace(/^#/, '')}</em></h1><p>Placed {stamp(order.createdAt)} <span>·</span> {quantity} {quantity === 1 ? 'unit' : 'units'} <span>·</span> {order.isB2B ? 'B2B' : 'DTC'}</p></div>
      <div className="oc-intro-status"><span className="oc-intro-status-label">CURRENT STATE</span><strong>{status}</strong><span>{paths.length} fulfillment {paths.length === 1 ? 'path' : 'paths'} <ArrowRight size={16} /> {destination}</span></div>
    </section>

    <section className="oc-pulse" aria-label="Order at a glance"><div className="oc-pulse-progress"><span>FULFILLMENT PROGRESS</span><strong>{stageCount} / 5 stages</strong><div className="oc-pulse-track">{stages.map((done, index) => <i className={done ? 'is-done' : ''} key={index} />)}</div></div><div><span>SHOPIFY SYNC</span><strong>{syncLabel}</strong></div><div><span>WAREHOUSE ROUTES</span><strong>{groups.length || 'Pending'}</strong></div><div><span>SHIPMENT SCANS</span><strong>{shipments.reduce((n, s) => n + (s.statusHistory?.length || 0), 0)}</strong></div><div><span>RETURNS</span><strong>{returns.length}</strong></div></section>

    <section className="oc-map" aria-label="Order journey">
      <div className="oc-section-heading oc-journey-heading" tabIndex={0}><span>01 / THE JOURNEY</span><strong>From click to doorstep</strong><span>{paths.length > 1 ? 'SPLIT FULFILLMENT' : 'SINGLE PATH'}</span><JourneyTip title="Journey overview" rows={[["Order", `#${String(order.orderNumber).replace(/^#/, '')}`], ["Fulfillment", `${paths.length} ${paths.length === 1 ? 'path' : 'paths'}`], ["Now", status]]} /></div>
      <div className="oc-map-grid">
        <div className="oc-map-node oc-map-source" tabIndex={0}><span className="oc-map-step">01 · SOURCE</span><span className="oc-map-icon"><img src="/shopify-logo-svgrepo-com.svg" alt="" /></span><strong>Shopify order</strong><small>{shopDomain || order.channel || 'Shopify'}</small><em>{quantity} units received</em><JourneyTip title="Order received" rows={[["Store", shopDomain || 'Shopify'], ["Created", stamp(order.createdAt)], ["Items", `${lines.length} products · ${quantity} units`]]} /></div>
        <div className="oc-map-arrow"><ArrowRight size={20} /></div>
        <div className="oc-map-node oc-map-route" tabIndex={0}><span className="oc-map-step">02 · DECISION</span><span className="oc-map-icon"><GitBranch size={24} /></span><strong>{groups.length ? 'Route selected' : 'Routing pending'}</strong><small>{order.routingReason || (groups.length > 1 ? 'Split by inventory availability' : groups.length ? 'Available stock matched' : 'Awaiting inventory match')}</small><em>{paths.length} {paths.length === 1 ? 'route' : 'routes'} generated</em><JourneyTip title="Routing decision" rows={[["Reason", order.routingReason || 'Inventory availability'], ["Paths", String(paths.length)], ["Status", groups.length ? 'Assigned' : 'Awaiting assignment']]} /></div>
        <div className="oc-map-arrow"><ArrowRight size={20} /></div>
        <div className="oc-map-lanes">
          {paths.map((group, index) => {
            const shipment = group ? shipments.find((s) => s.fulfillmentGroupId === group.id) : shipments[0]
            const pathItems = group?.lines?.length ? group.lines : lines
            return <div className="oc-map-lane" key={group?.id || 'pending'}>
              <div className="oc-lane-label"><span>PATH {String(index + 1).padStart(2, '0')}</span><strong>{title(shipment?.status || group?.status)}</strong></div>
              <div className="oc-map-node oc-map-warehouse" tabIndex={0}><span className="oc-map-step">03 · FULFILL</span><span className="oc-map-icon"><Warehouse size={24} /></span><strong>{warehouse(group?.warehouseId || order.warehouseId)}</strong><small>{pathItems.length} {pathItems.length === 1 ? 'line' : 'lines'} · {group?.method || 'Warehouse processing'}</small><em>{group?.status === 'shipped' ? 'Dispatched' : group ? 'Stock allocated' : 'Awaiting assignment'}</em><JourneyTip title={`Warehouse · Path ${index + 1}`} rows={[["Location", warehouse(group?.warehouseId || order.warehouseId)], ["Items", `${pathItems.length} lines`], ["State", title(group?.status)]]} /></div>
              <div className="oc-map-arrow"><ArrowRight size={20} /></div>
              <div className="oc-map-node oc-map-carrier" tabIndex={0}><span className="oc-map-step">04 · MOVE</span><span className="oc-map-icon"><Truck size={24} /></span><strong>{shipment?.carrier || order.carrier || 'Carrier pending'}</strong><small>{shipment?.trackingNumber || order.trackingNumber || 'Tracking not issued'}</small><em>{title(shipment?.status)}</em><JourneyTip title={`Carrier · Path ${index + 1}`} rows={[["Carrier", shipment?.carrier || order.carrier || 'Pending'], ["Tracking", shipment?.trackingNumber || order.trackingNumber || 'Not issued'], ["State", title(shipment?.status)]]} /></div>
            </div>
          })}
        </div>
        <div className="oc-map-arrow"><ArrowRight size={20} /></div>
        <div className="oc-map-node oc-map-destination" tabIndex={0}><span className="oc-map-step">05 · ARRIVE</span><span className="oc-map-icon"><MapPin size={24} /></span><strong>{delivered ? 'Delivered' : 'Destination'}</strong><small>{destination}</small><em>{delivered ? 'All packages arrived' : 'Customer handoff'}</em><JourneyTip title="Customer handoff" rows={[["Recipient", address?.name || order.customerName || 'Not supplied'], ["Destination", destination], ["State", delivered ? 'Delivered' : 'Awaiting delivery']]} /></div>
      </div>
    </section>

    <div className="oc-content">
      <div className="oc-primary">
        <section className="oc-panel oc-items"><div className="oc-panel-heading"><div><span>02 / THE GOODS</span><h2>What’s moving</h2></div><b>{lines.length} SKUS / {quantity} UNITS</b></div>
          <div className="oc-item-head"><span>PRODUCT</span><span>SKU</span><span>QTY</span><span>STATUS</span></div>
          {lines.length ? lines.map((line, i) => { const itemQty = line.quantity || 0; const moved = Math.min(itemQty, line.shippedQty || 0); const allocated = Math.min(itemQty, Math.max(moved, line.allocatedQty || 0)); return <div className="oc-item-row" key={line.id || `${line.sku}-${i}`}><div className="oc-item-name"><span className="oc-item-symbol">{line.imageUrl ? <img src={line.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <Box size={20} />}</span><strong>{line.title || line.name || 'Untitled item'}<small>{line.variantTitle && line.variantTitle !== 'Default Title' ? line.variantTitle : money(line.price, order.currency)}</small><span className="oc-item-meter" aria-label={`${moved} shipped, ${allocated} allocated of ${itemQty}`}><i style={{ width: `${itemQty ? allocated / itemQty * 100 : 0}%` }} /><i style={{ width: `${itemQty ? moved / itemQty * 100 : 0}%` }} /></span></strong></div><span className="oc-sku">{line.sku || '—'}</span><strong>×{itemQty}</strong><span className="oc-item-status">{title(line.fulfillmentStatus || line.status || order.status)}</span></div> }) : <p className="oc-empty">No line items recorded.</p>}
        </section>
        <section className="oc-panel oc-shipments"><div className="oc-panel-heading"><div><span>03 / PACKAGE CONTROL</span><h2>Shipment manifest</h2></div><b>{shipments.length} SHIPMENTS</b></div>
          {shipments.length ? shipments.map((shipment, i) => { const hasReturn = returns.some((record) => record.shipmentId === shipment.id || (!record.shipmentId && Boolean(record.warehouseId) && record.warehouseId === shipment.warehouseId)) || (shipments.length === 1 && returns.length > 0); const scanStages = ['Label', 'Transit', 'Out for delivery', 'Delivered', ...(hasReturn ? ['Return'] : [])]; const reached = shipment.status === 'returned' ? (hasReturn ? 5 : 4) : shipment.status === 'delivered' ? 4 : shipment.status === 'out_for_delivery' ? 3 : shipment.status === 'in_transit' || shipment.status === 'shipped' ? 2 : shipment.trackingNumber ? 1 : 0; return <div className="oc-shipment-block" key={shipment.id}><div className="oc-shipment"><span className="oc-shipment-index">{String(i + 1).padStart(2, '0')}</span><div><strong>{shipment.carrier || 'Unassigned carrier'}</strong><small>{warehouse(shipment.warehouseId)}</small></div><div><span>TRACKING</span><strong>{shipment.trackingNumber || 'Awaiting label'}</strong></div><span className="oc-shipment-status">{title(shipment.status)}</span>{shipment.trackingUrl ? <a href={shipment.trackingUrl} target="_blank" rel="noreferrer" aria-label="Track shipment"><ArrowUpRight size={18} /></a> : null}</div><div className="oc-scan-track" style={{ gridTemplateColumns: `repeat(${scanStages.length}, minmax(0, 1fr))` }}>{scanStages.map((label, step) => { const current = reached === step + 1; return <div className={`${step < reached ? 'is-reached ' : ''}${current ? 'is-current ' : ''}${label === 'Return' ? 'is-return' : ''}`} key={label}><span>{step < reached ? <Check size={15} /> : step + 1}</span><small>{label}</small></div> })}</div>{shipment.statusHistory?.length ? <small className="oc-last-scan">Latest scan: {title(shipment.statusHistory.at(-1)?.status)} · {stamp(shipment.statusHistory.at(-1)?.at)}</small> : null}</div> }) : <div className="oc-shipment"><span className="oc-shipment-index">—</span><div><strong>No shipment yet</strong><small>{groups.length ? 'Warehouse is preparing fulfillment' : 'Awaiting routing'}</small></div></div>}
        </section>
        <details className="oc-fulfillment"><summary><span><Warehouse size={19} /> Fulfillment groups</span><small>{groups.length} {groups.length === 1 ? 'group' : 'groups'} · open workbench</small></summary><div>{fulfillmentWorkbench}</div></details>
        <section className="oc-operations"><div className="oc-section-heading"><span>07 / TAKE ACTION</span><strong>Operations desk</strong><span>FULL ORDER CONTROL</span></div>{operations}</section>
      </div>
      <aside className="oc-rail">
        <section className="oc-panel oc-person"><div className="oc-panel-heading"><div><span>04 / RECIPIENT</span><h2>Going to</h2></div><MapPin size={21} /></div><strong>{address?.name || order.customerName || 'Recipient not supplied'}</strong><p>{[address?.address1, address?.address2, [address?.city, address?.provinceCode || address?.province, address?.zip].filter(Boolean).join(', '), address?.country || address?.countryCode].filter(Boolean).join(' · ') || 'No shipping address was supplied with this Shopify order.'}</p><div className="oc-rail-meta"><span>METHOD</span><b>{order.shippingMethod?.title || order.shippingMethod?.shopifyServiceCode || 'Not supplied'}</b></div></section>
        <section className="oc-panel oc-record"><div className="oc-panel-heading"><div><span>ORDER RECORD</span><h2>Identity &amp; systems</h2></div><ShoppingBagIcon /></div><dl><div><dt>Customer</dt><dd>{order.customerName || '—'}</dd></div><div><dt>Email</dt><dd>{order.email ? <a href={`mailto:${order.email}`}>{order.email}</a> : '—'}</dd></div><div><dt>Phone</dt><dd>{order.phone || address?.phone || '—'}</dd></div><div><dt>Shopify ID</dt><dd>{order.shopifyOrderId || '—'}</dd></div><div><dt>PO / B2B</dt><dd>{order.poNumber || (order.isB2B ? 'B2B order' : '—')}</dd></div><div><dt>Risk</dt><dd>{order.riskLevel || '—'}</dd></div><div><dt>Tags</dt><dd>{order.tags || '—'}</dd></div><div><dt>Service code</dt><dd>{order.shippingMethod?.wmsShipCode || order.shippingMethod?.shopifyServiceCode || '—'}</dd></div><div><dt>EDI / WMS</dt><dd>{order.sftpStatus || 'Not sent'}{order.fileLink?.url ? <> · <a href={order.fileLink.url} target="_blank" rel="noreferrer">Download 940 ↗</a></> : null}</dd></div><div><dt>Bill to</dt><dd>{[order.billingAddress?.name,order.billingAddress?.address1,order.billingAddress?.city].filter(Boolean).join(' · ') || 'Same as shipping / not provided'}</dd></div>{order.giftMessage ? <div><dt>Gift note</dt><dd>{order.giftMessage}</dd></div> : null}</dl>{order.lastError || order.sftpError ? <div className="oc-record-error">{order.lastError || order.sftpError}</div> : null}</section>
        <section className="oc-panel oc-finance"><div className="oc-panel-heading"><div><span>05 / ORDER VALUE</span><h2>Financials</h2></div><PackageCheck size={21} /></div><div><span>Subtotal</span><b>{money(order.totals?.subtotal, order.currency)}</b></div><div><span>Shipping</span><b>{money(order.totals?.totalShipping, order.currency)}</b></div><div><span>Discounts</span><b>{money(order.totals?.totalDiscounts, order.currency)}</b></div><div><span>Tax</span><b>{money(order.totals?.totalTax, order.currency)}</b></div><div className="oc-total"><span>Total</span><strong>{money(order.totals?.totalPrice, order.currency)}</strong></div></section>
        {returns.length ? <section className="oc-panel oc-returns"><div className="oc-panel-heading"><div><span>RETURNS / {returns.length}</span><h2>Return records</h2></div><RotateCcw size={21} /></div><div className="oc-return-records">{returns.map((record) => <div key={record.id}><strong>{record.rmaNumber}</strong><span>{title(record.status)} · {record.lines.length} {record.lines.length === 1 ? 'line' : 'lines'}</span><a href={`/account/returns?returnId=${encodeURIComponent(record.id)}`}>View return ↗</a></div>)}</div></section> : null}
        <section className="oc-panel oc-activity"><div className="oc-panel-heading"><div><span>06 / LIVE LOG</span><h2>Events</h2></div><Clock3 size={21} /></div>{latest.length ? <div className="oc-events-scroll"><table className="oc-events-table"><thead><tr><th scope="col">Time</th><th scope="col">Event</th><th scope="col">Details</th></tr></thead><tbody>{latest.map((log) => <tr key={log.id}><td><time dateTime={log.createdAt}>{stamp(log.createdAt)}</time></td><td><strong>{title(log.toState || log.type)}</strong></td><td>{log.message || '—'}</td></tr>)}</tbody></table></div> : <p className="oc-empty">No activity recorded.</p>}</section>
      </aside>
    </div>
  </main>
}

function ShoppingBagIcon() { return <img src="/shopify-logo-svgrepo-com.svg" alt="Shopify" className="oc-shopify-small" /> }

function JourneyTip({ title: heading, rows }: { title: string; rows: Array<[string, string]> }) {
  return <div className="oc-node-popover"><span>AT A GLANCE</span><strong>{heading}</strong>{rows.map(([label, value]) => <div key={label}><small>{label}</small><b>{value}</b></div>)}</div>
}
