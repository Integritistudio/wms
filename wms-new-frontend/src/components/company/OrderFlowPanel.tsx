import { ArrowRight, ExternalLink, GitBranch, MapPin, Package, RotateCcw, Truck, Warehouse } from 'lucide-react'
import type { FulfillmentGroup, ReturnRecord, ShipmentRecord, ShopOrder } from '../../lib/api'

type WarehouseLite = { id: string; name: string; code?: string; address?: string }

function warehouseName(id: string | null | undefined, warehouses: WarehouseLite[]) {
  if (!id) return 'Warehouse pending'
  return warehouses.find((warehouse) => warehouse.id === id)?.name || `Warehouse ${id.slice(-4)}`
}

function shipmentState(group: FulfillmentGroup | null, shipment?: ShipmentRecord, returned = false) {
  if (returned || shipment?.status === 'returned') return { label: 'Returning', tone: 'return' }
  if (shipment?.status === 'delivered') return { label: 'Delivered', tone: 'done' }
  if (shipment?.status === 'out_for_delivery') return { label: 'Out for delivery', tone: 'moving' }
  if (shipment?.status === 'in_transit' || shipment?.status === 'shipped' || group?.status === 'shipped') return { label: 'In transit', tone: 'moving' }
  if (shipment?.trackingNumber || shipment?.status === 'labeled') return { label: 'Label ready', tone: 'ready' }
  if (group) return { label: 'At warehouse', tone: 'ready' }
  return { label: 'Awaiting route', tone: 'waiting' }
}

export default function OrderFlowPanel({ order, groups, shipments, returns, warehouses, shopDomain }: {
  order: ShopOrder
  groups: FulfillmentGroup[]
  shipments: ShipmentRecord[]
  returns: ReturnRecord[]
  warehouses: WarehouseLite[]
  shopDomain?: string
}) {
  const destination = order.shippingAddress
  const destinationLabel = [destination?.city, destination?.provinceCode || destination?.province, destination?.countryCode || destination?.country]
    .filter(Boolean).join(', ') || 'Destination pending'
  const packages = groups.length
    ? groups.map((group, index) => {
        const shipment = shipments.find((item) => item.fulfillmentGroupId === group.id)
        const returned = returns.some((record) =>
          (Boolean(record.shipmentId) && record.shipmentId === shipment?.id) ||
          (Boolean(record.warehouseId) && record.warehouseId === group.warehouseId && !record.shipmentId),
        )
        return { key: group.id, group, shipment, returned, index }
      })
    : [{ key: 'pending', group: null, shipment: shipments[0], returned: returns.length > 0, index: 0 }]
  const routed = groups.length > 0 || Boolean(order.warehouseId)
  const delivered = shipments.length > 0 && shipments.every((shipment) => shipment.status === 'delivered')
  const quantity = (order.lineItems || []).reduce((total, item) => total + (item.quantity || 0), 0)
  const headline = returns.length ? 'Return in progress' : delivered ? 'Delivered' : packages.some((item) => item.shipment) ? 'Shipment in progress' : routed ? 'Routing complete' : 'Awaiting routing'

  return (
    <section className="oj-diagram" aria-label="Order routing diagram">
      <header className="oj-diagram-head">
        <div>
          <span className="oj-diagram-kicker">ORDER FLOW / #{String(order.orderNumber).replace(/^#/, '')}</span>
          <h2>Follow the order.</h2>
          <p>From checkout through every warehouse and carrier handoff.</p>
        </div>
        <span className="oj-diagram-head-status"><span />{headline}</span>
      </header>

      <div className="oj-diagram-canvas">
        <article className="oj-diagram-node oj-diagram-source">
          <span className="oj-diagram-node-kicker">01 / ORDER</span>
          <div className="oj-diagram-node-icon"><img src="/shopify-logo-svgrepo-com.svg" alt="" width={25} height={25} /></div>
          <h3>Shopify order</h3>
          <p className="oj-diagram-node-detail">{shopDomain || order.channel || 'Shopify'}</p>
          <div className="oj-diagram-node-foot">{quantity} {quantity === 1 ? 'unit' : 'units'} received</div>
        </article>

        <span className="oj-diagram-link" aria-hidden><ArrowRight size={18} /></span>

        <article className="oj-diagram-node oj-diagram-routing">
          <span className="oj-diagram-node-kicker">02 / ROUTING</span>
          <div className="oj-diagram-node-icon"><GitBranch size={25} aria-hidden /></div>
          <h3>{routed ? 'Route selected' : 'Route pending'}</h3>
          <p className="oj-diagram-node-detail">{order.routingReason || (groups.length > 1 ? 'Inventory split across warehouses' : routed ? 'Assigned to available stock' : 'Waiting for available stock')}</p>
          <div className="oj-diagram-node-foot">{packages.length} {packages.length === 1 ? 'path' : 'paths'} to fulfillment</div>
        </article>

        <span className="oj-diagram-link" aria-hidden><ArrowRight size={18} /></span>

        <div className={`oj-diagram-branches${packages.length > 1 ? ' is-split' : ''}`}>
          <span className="oj-diagram-branches-label">FULFILLMENT PATH{packages.length === 1 ? '' : 'S'}</span>
          {packages.map(({ key, group, shipment, returned }) => {
            const state = shipmentState(group, shipment, returned)
            const items = group?.lines?.length
              ? group.lines.map((line) => ({ sku: line.sku, quantity: line.allocatedQty || line.quantity, title: line.title || line.sku }))
              : (order.lineItems || []).map((line) => ({ sku: line.sku, quantity: line.quantity, title: line.title || line.name || line.sku }))
            return (
              <article key={key} className="oj-diagram-branch">
                <div className="oj-diagram-branch-route">
                  <div className="oj-diagram-node oj-diagram-branch-stop is-warehouse">
                    <span className="oj-diagram-node-kicker">03 / WAREHOUSE</span>
                    <div className="oj-diagram-node-icon"><Warehouse size={25} aria-hidden /></div>
                    <h3>{warehouseName(group?.warehouseId || order.warehouseId, warehouses)}</h3>
                    <p className="oj-diagram-node-detail">{items.slice(0, 2).map((item) => `${item.title || 'Item'} ×${item.quantity || 0}`).join(' · ') || 'Items pending'}{items.length > 2 ? ` · +${items.length - 2} more` : ''}</p>
                    <div className="oj-diagram-node-foot">{group ? 'Assigned for fulfillment' : 'Awaiting assignment'}</div>
                  </div>
                  <span className="oj-diagram-branch-link" aria-hidden><ArrowRight size={18} /></span>
                  <div className="oj-diagram-node oj-diagram-branch-stop is-carrier">
                    <span className="oj-diagram-node-kicker">04 / CARRIER</span>
                    <div className="oj-diagram-node-icon"><Truck size={25} aria-hidden /></div>
                    <h3>{shipment?.carrier || order.carrier || 'Carrier pending'}</h3>
                    <p className="oj-diagram-node-detail">{shipment?.trackingNumber || order.trackingNumber || 'Tracking pending'}</p>
                    <div className="oj-diagram-node-foot">{shipment?.trackingUrl ? <a href={shipment.trackingUrl} target="_blank" rel="noreferrer">Track shipment <ExternalLink size={13} aria-hidden /></a> : state.label}</div>
                  </div>
                </div>
              </article>
            )
          })}
        </div>

        <span className="oj-diagram-link" aria-hidden><ArrowRight size={18} /></span>

        <article className="oj-diagram-node oj-diagram-destination">
          <span className="oj-diagram-node-kicker">05 / DESTINATION</span>
          <div className="oj-diagram-node-icon">{returns.length ? <RotateCcw size={25} aria-hidden /> : <MapPin size={25} aria-hidden />}</div>
          <h3>{returns.length ? 'Return path' : delivered ? 'Delivered' : 'Customer delivery'}</h3>
          <p className="oj-diagram-node-detail">{destinationLabel}</p>
          <div className="oj-diagram-node-foot">{returns.length ? `${returns.length} return ${returns.length === 1 ? 'record' : 'records'}` : delivered ? 'All packages arrived' : 'Final stop'}</div>
        </article>
      </div>

      <footer className="oj-diagram-facts">
        <span><Package size={16} aria-hidden /> {packages.length} {packages.length === 1 ? 'package' : 'packages'}</span>
        <span><Truck size={16} aria-hidden /> {order.shippingMethod?.title || order.shippingMethod?.shopifyServiceCode || order.shippingMethod?.wmsShipCode || 'Service pending'}</span>
        <span><MapPin size={16} aria-hidden /> {destinationLabel}</span>
      </footer>
    </section>
  )
}
