import type { ReactNode } from 'react'
import { StatusBadge } from '../ui'
import type { ActivityLogEntry, FulfillmentGroup, ModernWmsOrderLink, ShipmentRecord, ShopOrder, Warehouse } from '../../lib/api'

function labelShipmentStatus(status?: string | null) {
  switch (status) {
    case 'labeled':
      return 'Labeled / ready'
    case 'in_transit':
      return 'In transit'
    case 'out_for_delivery':
      return 'Out for delivery'
    case 'delivered':
      return 'Delivered'
    case 'failed':
      return 'Delivery failed'
    case 'returned':
      return 'Returned'
    case 'pending':
      return 'Pending'
    default:
      return status ? status.replace(/_/g, ' ') : 'Shipment'
  }
}

function formatStamp(iso?: string | null) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return {
    date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
    time: d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
  }
}

function Stamp({ iso, fallback }: { iso?: string | null; fallback?: string }) {
  const stamp = formatStamp(iso)
  if (!stamp) {
    return fallback ? <span className="order-flow-stamp is-muted">{fallback}</span> : null
  }
  return (
    <span className="order-flow-stamp">
      <span>{stamp.date}</span>
      <span className="order-flow-stamp-time">{stamp.time}</span>
    </span>
  )
}

function FlowNode({
  title,
  subtitle,
  status,
  iso,
  tone = 'default',
  children,
}: {
  title: string
  subtitle?: string
  status?: string
  iso?: string | null
  tone?: 'default' | 'accent' | 'success' | 'warn' | 'muted'
  children?: ReactNode
}) {
  return (
    <div className={`order-flow-node tone-${tone}`}>
      <div className="order-flow-node-top">
        <div>
          <div className="order-flow-node-title">{title}</div>
          {subtitle ? <div className="order-flow-node-sub">{subtitle}</div> : null}
        </div>
        {status ? <StatusBadge status={status} /> : null}
      </div>
      {children}
      <Stamp iso={iso} />
    </div>
  )
}

function Connector({ label }: { label?: string }) {
  return (
    <div className="order-flow-connector" aria-hidden>
      <span className="order-flow-line" />
      {label ? <span className="order-flow-connector-label">{label}</span> : null}
      <span className="order-flow-arrow" />
    </div>
  )
}

export default function OrderShipmentFlow({
  order,
  groups,
  shipments,
  logs,
  warehouses,
  modernwmsLinks = [],
}: {
  order: ShopOrder
  groups: FulfillmentGroup[]
  shipments: ShipmentRecord[]
  logs?: ActivityLogEntry[]
  warehouses: Warehouse[]
  modernwmsLinks?: ModernWmsOrderLink[]
}) {
  const whName = (id: string | null | undefined) =>
    warehouses.find((w) => w.id === id)?.name || (id ? `Warehouse ${id.slice(-4)}` : 'Unassigned')

  const split = groups.length > 1
  const shippedCount = groups.filter((g) => g.status === 'shipped').length
  const allShipped = groups.length > 0 && shippedCount === groups.length
  const someShipped = shippedCount > 0 && !allShipped

  const allocateAt =
    groups[0]?.createdAt ||
    logs?.find((l) => /allocat|940_ready|split/i.test(`${l.toState} ${l.message}`))?.createdAt

  const completeAt =
    allShipped
      ? shipments.map((s) => s.createdAt).filter(Boolean).sort().at(-1) ||
        groups.map((g) => g.updatedAt).filter(Boolean).sort().at(-1)
      : null

  const outcomeTone = allShipped ? 'success' : someShipped ? 'warn' : order.status === 'error' ? 'warn' : 'muted'
  const outcomeTitle = allShipped
    ? 'Order fulfilled'
    : someShipped
      ? 'Partially fulfilled'
      : groups.length
        ? 'Awaiting shipment'
        : 'Not allocated yet'
  const outcomeSub = allShipped
    ? `${shipments.length} shipment${shipments.length === 1 ? '' : 's'} completed`
    : someShipped
      ? `${shippedCount} of ${groups.length} warehouses shipped`
      : groups.length
        ? 'Waiting on warehouse ship actions'
        : 'Assign a warehouse or run allocation'

  return (
    <div className="order-flow">
      <div className="order-flow-intro">
        <h3 className="order-flow-heading">Shipment flow</h3>
        <p className="order-flow-desc">
          {split
            ? `This order was split across ${groups.length} warehouses.`
            : groups.length === 1
              ? 'Single-warehouse fulfillment path.'
              : 'Flow updates as the order is allocated and shipped.'}
        </p>
      </div>

      <div className="order-flow-canvas">
        <FlowNode
          title="Order received"
          subtitle={`${order.orderNumber} · ${order.customerName || 'Customer'}`}
          status={order.status === 'received' ? 'received' : undefined}
          iso={order.createdAt}
          tone="accent"
        />

        <Connector label={groups.length ? 'Allocate' : undefined} />

        <FlowNode
          title={split ? 'Split allocation' : 'Allocated'}
          subtitle={
            groups.length
              ? split
                ? `${groups.length} warehouse branches`
                : whName(groups[0]?.warehouseId)
              : 'Pending allocation'
          }
          status={groups.length ? 'allocated' : undefined}
          iso={allocateAt}
          tone={groups.length ? 'accent' : 'muted'}
        >
          {groups.length > 0 ? (
            <ul className="order-flow-sku-list">
              {groups.flatMap((g) =>
                (g.lines || []).map((l) => (
                  <li key={`${g.id}-${l.orderLineId || l.sku}`}>
                    <span>{l.sku || 'SKU'}</span>
                    <span>×{l.allocatedQty || l.quantity}</span>
                    {split ? <span className="order-flow-sku-wh">{whName(g.warehouseId)}</span> : null}
                  </li>
                )),
              )}
            </ul>
          ) : null}
        </FlowNode>

        {groups.length > 0 ? (
          <>
            <Connector label={split ? 'Split' : 'Fulfill'} />

            <div className={`order-flow-branches ${split ? 'is-split' : 'is-single'}`}>
              {groups.map((group) => {
                const shipment = shipments.find((s) => s.fulfillmentGroupId === group.id)
                const shipped = group.status === 'shipped' || Boolean(shipment)
                const mwms = modernwmsLinks.find((l) => l.groupId === group.id)
                const wh = warehouses.find((w) => w.id === group.warehouseId)
                const isModernwms = wh?.fulfillmentMode === 'modernwms' || Boolean(mwms)
                return (
                  <div key={group.id} className="order-flow-branch">
                    <FlowNode
                      title={whName(group.warehouseId)}
                      subtitle={(group.lines || []).map((l) => `${l.sku}×${l.allocatedQty || l.quantity}`).join(' · ') || 'No lines'}
                      status={group.status}
                      iso={group.createdAt}
                      tone={shipped ? 'success' : group.status === 'on_hold' ? 'warn' : 'default'}
                    >
                      {group.sftpStatus && group.sftpStatus !== 'skipped' ? (
                        <div className="order-flow-meta">
                          SFTP <StatusBadge status={group.sftpStatus} />
                        </div>
                      ) : null}
                      {isModernwms ? (
                        <div className="order-flow-meta">
                          ModernWMS{' '}
                          {mwms?.dispatchNo ? (
                            <span>
                              {mwms.dispatchNo} · {mwms.statusLabel}
                            </span>
                          ) : (
                            <span className="demo-muted">dispatch pending</span>
                          )}
                        </div>
                      ) : null}
                    </FlowNode>

                    <Connector label={shipped ? 'Shipped' : 'Ship'} />

                    <FlowNode
                      title={
                        shipment
                          ? labelShipmentStatus(shipment.status)
                          : shipped
                            ? 'Shipped'
                            : 'Awaiting ship'
                      }
                      subtitle={
                        shipment
                          ? `${shipment.carrier || 'Carrier'} ${shipment.trackingNumber || ''}`.trim()
                          : 'Enter tracking to complete'
                      }
                      status={shipment?.status || (shipped ? 'labeled' : 'pending')}
                      iso={shipment?.updatedAt || shipment?.createdAt || (shipped ? group.updatedAt : null)}
                      tone={
                        shipment?.status === 'delivered'
                          ? 'success'
                          : shipment?.status === 'failed' || shipment?.status === 'returned'
                            ? 'warn'
                            : shipped
                              ? 'accent'
                              : 'muted'
                      }
                    />
                  </div>
                )
              })}
            </div>

            <Connector />

            <FlowNode title={outcomeTitle} subtitle={outcomeSub} status={order.status} iso={completeAt} tone={outcomeTone} />
          </>
        ) : null}
      </div>

      {logs && logs.length > 0 ? (
        <div className="order-flow-timeline">
          <h4 className="order-flow-timeline-title">Activity timeline</h4>
          <ol className="order-flow-timeline-list">
            {[...logs]
              .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
              .map((log) => (
                <li key={log.id}>
                  <span className="order-flow-timeline-dot" />
                  <div className="order-flow-timeline-body">
                    <div className="order-flow-timeline-msg">{log.message || log.type}</div>
                    <Stamp iso={log.createdAt} />
                  </div>
                </li>
              ))}
          </ol>
        </div>
      ) : null}
    </div>
  )
}
