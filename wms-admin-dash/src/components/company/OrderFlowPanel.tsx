import {
  Boxes,
  CheckCircle2,
  GitBranch,
  MapPin,
  Package,
  ShieldCheck,
  Split,
  Truck,
  UserRound,
  Warehouse,
} from 'lucide-react'
import type {
  FulfillmentGroup,
  OrderLineItem,
  ReturnRecord,
  ShipmentRecord,
  ShopOrder,
} from '../../lib/api'

type WarehouseLite = { id: string; name: string; code?: string; address?: string }

const SHIP_STEPS = [
  { id: 'label', label: 'Label' },
  { id: 'packed', label: 'Packed' },
  { id: 'transit', label: 'Transit' },
  { id: 'delivered', label: 'Done' },
] as const

function money(value?: string, currency?: string) {
  if (value == null || value === '') return null
  const num = Number(value)
  if (Number.isNaN(num)) return value
  try {
    return new Intl.NumberFormat(undefined, {
      style: currency ? 'currency' : 'decimal',
      currency: currency || undefined,
      minimumFractionDigits: 2,
    }).format(num)
  } catch {
    return value
  }
}

function itemLabel(line: { sku?: string; title?: string; name?: string }) {
  return line.title || line.name || line.sku || 'Item'
}

function whLabel(id: string | null | undefined, warehouses: WarehouseLite[]) {
  if (!id) return 'Unassigned'
  const match = warehouses.find((w) => w.id === id)
  return match?.name || `Warehouse ${id.slice(-4)}`
}

function packageBadge(group?: FulfillmentGroup | null, shipment?: ShipmentRecord, hasReturn?: boolean) {
  if (hasReturn || shipment?.status === 'returned') return { label: 'Return', tone: 'rose' as const }
  const status = shipment?.status || group?.status || 'pending'
  if (status === 'delivered') return { label: 'Delivered', tone: 'mint' as const }
  if (status === 'out_for_delivery') return { label: 'Out for delivery', tone: 'sky' as const }
  if (status === 'in_transit' || status === 'shipped' || group?.status === 'shipped') {
    return { label: 'In transit', tone: 'sky' as const }
  }
  if (status === 'labeled' || shipment?.trackingNumber) return { label: 'Packed', tone: 'mint' as const }
  if (group?.status === 'allocated' || group?.status === 'picking') return { label: 'Picking', tone: 'peach' as const }
  if (group) return { label: 'Awaiting pick', tone: 'amber' as const }
  return { label: 'Pending route', tone: 'ink' as const }
}

function shipStepIndex(group?: FulfillmentGroup | null, shipment?: ShipmentRecord, hasReturn?: boolean) {
  const status = shipment?.status || (group?.status === 'shipped' ? 'shipped' : group?.status || '')
  if (hasReturn || status === 'returned' || status === 'delivered') return 3
  if (status === 'out_for_delivery' || status === 'in_transit' || status === 'shipped' || group?.status === 'shipped') {
    return 2
  }
  if (status === 'labeled' || shipment?.trackingNumber) return 1
  if (group) return 0
  return -1
}

function initialFromTitle(title: string) {
  const clean = title.replace(/[^a-zA-Z0-9 ]/g, '').trim()
  if (!clean) return '?'
  return (clean.split(/\s+/).filter(Boolean)[0]?.[0] || '?').toUpperCase()
}

function LineThumb({ title, sku }: { title: string; sku?: string }) {
  return (
    <span className="oj-flow-thumb" title={sku || title} aria-hidden>
      {initialFromTitle(title)}
    </span>
  )
}

function Arrow() {
  return (
    <div className="oj-flow-arrow" aria-hidden>
      <span />
    </div>
  )
}

export default function OrderFlowPanel({
  order,
  groups,
  shipments,
  returns,
  warehouses,
  shopDomain,
}: {
  order: ShopOrder
  groups: FulfillmentGroup[]
  shipments: ShipmentRecord[]
  returns: ReturnRecord[]
  warehouses: WarehouseLite[]
  shopDomain?: string
}) {
  const lines = order.lineItems || []
  const qtyTotal = lines.reduce((n, li) => n + (li.quantity || 0), 0)
  const dest = order.shippingAddress
  const destLine = [dest?.city, dest?.provinceCode || dest?.province, dest?.zip].filter(Boolean).join(', ')
  const split = groups.length > 1
  const openReturns = returns.filter((r) => !/restocked|closed|cancelled|disposed|refunded/i.test(r.status))
  const anyDelivered = shipments.some((s) => s.status === 'delivered')
  const anyReturn = returns.length > 0

  const lanes =
    groups.length > 0
      ? groups.map((group, index) => {
          const shipment = shipments.find((s) => s.fulfillmentGroupId === group.id)
          const laneReturns = returns.filter(
            (r) =>
              r.shipmentId === shipment?.id ||
              r.warehouseId === group.warehouseId ||
              (r.lines || []).some((rl) => (group.lines || []).some((gl) => gl.sku && gl.sku === rl.sku)),
          )
          return { key: group.id, group, shipment, laneReturns, index }
        })
      : [
          {
            key: 'pending',
            group: null as FulfillmentGroup | null,
            shipment: shipments[0] as ShipmentRecord | undefined,
            laneReturns: returns,
            index: 0,
          },
        ]

  const routingTags = [
    { icon: Boxes, label: 'Inventory', on: Boolean(groups.length || order.warehouseId) },
    { icon: MapPin, label: 'Proximity', on: Boolean(order.suggestedWarehouseId || order.warehouseId || groups.length) },
    { icon: ShieldCheck, label: 'SLA', on: Boolean(order.shippingMethod?.isExpedited || order.routingReason) },
    { icon: Split, label: 'Split', on: split },
  ]

  return (
    <section className="oj-skel-card oj-flow">
      <header className="oj-skel-card-head">
        <span className="material-symbols-outlined oj-skel-icon" aria-hidden>
          account_tree
        </span>
        <span>Order flow</span>
        <span className="oj-skel-ml oj-live-count">
          {lanes.length} package{lanes.length === 1 ? '' : 's'}
        </span>
      </header>

      <div className="oj-flow-legend" aria-label="Routing legend">
        {routingTags.map((tag) => (
          <span key={tag.label} className={`oj-flow-legend-item${tag.on ? ' is-on' : ''}`}>
            <tag.icon size={13} strokeWidth={2.2} aria-hidden />
            {tag.label}
          </span>
        ))}
      </div>

      <div className="oj-flow-board">
        <article className="oj-flow-card oj-flow-source">
          <div className="oj-flow-card-head">
            <img
              className="oj-flow-shopify"
              src="/shopify-logo-svgrepo-com.svg"
              alt=""
              width={28}
              height={28}
              aria-hidden
            />
            <div>
              <strong>{shopDomain || order.channel || 'Shopify'}</strong>
              <em>Order source</em>
            </div>
          </div>
          <div className="oj-flow-order-meta">
            <code>#{String(order.orderNumber).replace(/^#/, '')}</code>
            <span>
              {qtyTotal || lines.length} item{(qtyTotal || lines.length) === 1 ? '' : 's'}
            </span>
            {money(order.totals?.totalPrice, order.currency) ? (
              <b>{money(order.totals?.totalPrice, order.currency)}</b>
            ) : null}
          </div>
          <ul className="oj-flow-items">
            {(lines.length ? lines : ([{ title: 'No line items', quantity: 0 }] as OrderLineItem[])).map((line, idx) => (
              <li key={line.id || `${line.sku}-${idx}`}>
                <LineThumb title={itemLabel(line)} sku={line.sku} />
                <span className="oj-flow-item-name">{itemLabel(line)}</span>
                <span className="oj-flow-item-qty">×{line.quantity || 0}</span>
              </li>
            ))}
          </ul>
        </article>

        <Arrow />

        <article className="oj-flow-card oj-flow-routing">
          <div className="oj-flow-card-head">
            <span className="oj-flow-icon-well tone-peach">
              <GitBranch size={16} strokeWidth={2.2} aria-hidden />
            </span>
            <div>
              <strong>Routing</strong>
              <em>{order.routingReason || (split ? 'Split shipment' : 'Single path')}</em>
            </div>
          </div>
          <ul className="oj-flow-route-tags">
            {routingTags.map((tag) => (
              <li key={tag.label} className={tag.on ? 'is-on' : undefined}>
                <tag.icon size={12} strokeWidth={2.2} aria-hidden />
                {tag.label}
                {tag.label === 'Split' && split ? ' required' : ''}
              </li>
            ))}
          </ul>
        </article>

        <Arrow />

        <div className="oj-flow-lanes">
          {lanes.map((lane) => {
            const badge = packageBadge(lane.group, lane.shipment, lane.laneReturns.length > 0)
            const stepIdx = shipStepIndex(lane.group, lane.shipment, lane.laneReturns.length > 0)
            const laneLines =
              lane.group?.lines?.length
                ? lane.group.lines
                : lines.map((l) => ({
                    sku: l.sku || '',
                    title: itemLabel(l),
                    quantity: l.quantity || 0,
                    allocatedQty: l.quantity || 0,
                    orderLineId: l.id || '',
                  }))
            const updated = lane.shipment?.updatedAt

            return (
              <div key={lane.key} className="oj-flow-lane">
                <article className="oj-flow-card oj-flow-wh">
                  <div className="oj-flow-card-head">
                    <span className="oj-flow-icon-well tone-sky">
                      <Warehouse size={15} strokeWidth={2.2} aria-hidden />
                    </span>
                    <div>
                      <strong>{whLabel(lane.group?.warehouseId || order.warehouseId, warehouses)}</strong>
                      <em>Package {lane.index + 1}</em>
                    </div>
                  </div>
                  <ul className="oj-flow-items is-compact">
                    {laneLines.slice(0, 4).map((line, idx) => (
                      <li key={`${line.sku}-${idx}`}>
                        <LineThumb title={line.title || line.sku} sku={line.sku} />
                        <span className="oj-flow-item-name">{line.title || line.sku}</span>
                        <span className="oj-flow-item-qty">×{line.allocatedQty || line.quantity}</span>
                      </li>
                    ))}
                    {laneLines.length > 4 ? (
                      <li className="oj-flow-more">+{laneLines.length - 4} more</li>
                    ) : null}
                  </ul>
                  <span className={`oj-flow-badge tone-${badge.tone}`}>{badge.label}</span>
                </article>

                <Arrow />

                <article className="oj-flow-card oj-flow-ship">
                  <div className="oj-flow-card-head">
                    <span className="oj-flow-icon-well tone-mint">
                      <Truck size={15} strokeWidth={2.2} aria-hidden />
                    </span>
                    <div>
                      <strong>{lane.shipment?.carrier || order.carrier || 'Carrier TBD'}</strong>
                      <em>
                        {lane.shipment?.trackingNumber ||
                          (lane.laneReturns[0]?.rmaNumber ? `RMA ${lane.laneReturns[0].rmaNumber}` : 'No tracking')}
                      </em>
                    </div>
                  </div>
                  <p className="oj-flow-eta">
                    {updated
                      ? `Updated ${new Date(updated).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
                      : 'Awaiting carrier scan'}
                  </p>
                  <div className="oj-flow-steps" aria-label="Shipment progress">
                    {SHIP_STEPS.map((step, i) => (
                      <div
                        key={step.id}
                        className={`oj-flow-step${i < stepIdx ? ' is-done' : ''}${i === stepIdx ? ' is-active' : ''}${
                          lane.laneReturns.length && i === SHIP_STEPS.length - 1 ? ' is-return' : ''
                        }`}
                      >
                        <i />
                        <span>{lane.laneReturns.length && i === SHIP_STEPS.length - 1 ? 'Return' : step.label}</span>
                      </div>
                    ))}
                  </div>
                </article>
              </div>
            )
          })}
        </div>

        <Arrow />

        <article className={`oj-flow-card oj-flow-dest${anyReturn && !anyDelivered ? ' is-return' : ''}`}>
          <div className="oj-flow-card-head">
            <span className={`oj-flow-icon-well ${anyReturn && !anyDelivered ? 'tone-rose' : 'tone-lavender'}`}>
              {anyReturn && !anyDelivered ? (
                <Package size={16} strokeWidth={2.2} aria-hidden />
              ) : (
                <CheckCircle2 size={16} strokeWidth={2.2} aria-hidden />
              )}
            </span>
            <div>
              <strong>{anyReturn && !anyDelivered ? 'Return path' : 'Customer delivery'}</strong>
              <em>{destLine || order.customerName || 'Destination pending'}</em>
            </div>
          </div>
          <div className="oj-flow-dest-foot">
            <UserRound size={14} strokeWidth={2.2} aria-hidden />
            <span>
              {anyReturn
                ? `${openReturns.length || returns.length} return${(openReturns.length || returns.length) === 1 ? '' : 's'}`
                : anyDelivered
                  ? `Delivered · ${lanes.length} pkg`
                  : `In progress · ${lanes.length} pkg`}
            </span>
          </div>
        </article>
      </div>
    </section>
  )
}
