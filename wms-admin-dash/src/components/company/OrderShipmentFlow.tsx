import type {
  ActivityLogEntry,
  FulfillmentGroup,
  ModernWmsOrderLink,
  ReturnRecord,
  ShipmentRecord,
  ShopOrder,
  Warehouse,
} from '../../lib/api'

function formatLatency(from?: string | null, to?: string | null) {
  if (!from || !to) return null
  const a = new Date(from).getTime()
  const b = new Date(to).getTime()
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null
  const mins = Math.round((b - a) / 60000)
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h < 48) return `${h}h ${m}m`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

type StepState = 'done' | 'active' | 'todo'
type StepTone = 'default' | 'return'

type JourneyStep = {
  id: string
  idx: string
  label: string
  detail?: string
  stamp?: string | null
  state: StepState
  tone?: StepTone
}

export default function OrderShipmentFlow({
  order,
  groups,
  shipments,
  logs,
  warehouses,
  modernwmsLinks = [],
  returns = [],
}: {
  order: ShopOrder
  groups: FulfillmentGroup[]
  shipments: ShipmentRecord[]
  logs?: ActivityLogEntry[]
  warehouses: Warehouse[]
  modernwmsLinks?: ModernWmsOrderLink[]
  returns?: ReturnRecord[]
}) {
  const whName = (id: string | null | undefined) =>
    warehouses.find((w) => w.id === id)?.name || (id ? `WH ${id.slice(-4)}` : 'Unassigned')

  const split = groups.length > 1
  const shippedCount = groups.filter((g) => g.status === 'shipped').length
  const allShipped = groups.length > 0 && shippedCount === groups.length
  const deliveredCount = shipments.filter((s) => s.status === 'delivered').length
  const allDelivered =
    (shipments.length > 0 && deliveredCount === shipments.length && allShipped) ||
    order.status === 'fulfilled'
  const allocated = groups.length > 0

  const dest = order.shippingAddress
  const destLabel =
    [dest?.city, dest?.provinceCode || dest?.province, dest?.countryCode || dest?.country]
      .filter(Boolean)
      .join(', ') ||
    dest?.name ||
    order.customerName ||
    'Customer'

  const primaryShipment =
    shipments.find((s) => s.status === 'delivered') ||
    shipments.find((s) => s.status === 'in_transit' || s.status === 'out_for_delivery') ||
    shipments[0]
  const primaryWh = groups[0]
    ? whName(groups[0].warehouseId)
    : order.warehouseId
      ? whName(order.warehouseId)
      : null
  const primaryMw = modernwmsLinks[0]

  const openReturns = returns.filter((r) => !/restocked|closed|cancelled|disposed/i.test(r.status))
  const closedReturns = returns.filter((r) => /restocked|closed|cancelled|disposed/i.test(r.status))
  const latestReturn = returns[0]
  const hasOpenReturn = openReturns.length > 0
  const allReturnsClosed = returns.length > 0 && openReturns.length === 0

  const firstAt = order.createdAt
  const lastAt =
    shipments.map((s) => s.updatedAt || s.createdAt).filter(Boolean).sort().at(-1) ||
    groups.map((g) => g.updatedAt).filter(Boolean).sort().at(-1) ||
    logs?.map((l) => l.createdAt).filter(Boolean).sort().at(-1)
  const latency = formatLatency(firstAt, lastAt)

  const fmt = (iso?: string | null) => {
    if (!iso) return null
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return null
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  const stateOf = (ready: boolean, active: boolean): StepState =>
    ready ? 'done' : active ? 'active' : 'todo'

  const steps: JourneyStep[] = [
    {
      id: 'received',
      idx: '01',
      label: 'Order received',
      detail: order.channel || 'Shopify',
      stamp: fmt(order.createdAt),
      state: 'done',
    },
    {
      id: 'routed',
      idx: '02',
      label: split ? 'Split routed' : 'Routed',
      detail: order.routingReason?.slice(0, 48) || (allocated ? primaryWh || 'Assigned' : 'Pending'),
      stamp: fmt(groups[0]?.createdAt),
      state: stateOf(allocated, Boolean(order.routingReason || order.suggestedWarehouseId)),
    },
    {
      id: 'warehouse',
      idx: '03',
      label: split ? `${groups.length} warehouses` : primaryWh || 'Warehouse',
      detail: split
        ? groups.map((g) => `${whName(g.warehouseId)} · ${g.status.replace(/_/g, ' ')}`).join(' · ')
        : primaryMw?.dispatchNo
          ? `MW ${primaryMw.dispatchNo}`
          : groups[0]?.status?.replace(/_/g, ' ') || 'Awaiting allocation',
      stamp: fmt(groups[0]?.updatedAt || groups[0]?.createdAt),
      state: stateOf(allocated && (allShipped || shippedCount > 0 || groups[0]?.status === 'allocated'), allocated),
    },
    {
      id: 'carrier',
      idx: '04',
      label: primaryShipment?.carrier || order.carrier || 'Carrier',
      detail: primaryShipment?.trackingNumber || order.trackingNumber || (allShipped ? 'Shipped' : 'Awaiting ship'),
      stamp: fmt(primaryShipment?.updatedAt || primaryShipment?.createdAt),
      state: stateOf(
        Boolean(primaryShipment?.status === 'delivered' || primaryShipment?.status === 'in_transit' || allShipped),
        shipments.length > 0 || shippedCount > 0,
      ),
    },
    {
      id: 'delivered',
      idx: '05',
      label: allDelivered ? 'Delivered' : 'Customer',
      detail: destLabel,
      stamp: allDelivered ? fmt(lastAt) : null,
      state: stateOf(allDelivered, allShipped || deliveredCount > 0),
    },
    {
      id: 'returns',
      idx: '06',
      label: 'Returns',
      detail:
        returns.length === 0
          ? 'No RMAs'
          : hasOpenReturn
            ? `${openReturns.length} open · ${latestReturn?.rmaNumber || 'RMA'}`
            : `${closedReturns.length} closed · ${latestReturn?.rmaNumber || 'RMA'}`,
      stamp: fmt(latestReturn?.updatedAt || latestReturn?.createdAt),
      state: stateOf(allReturnsClosed, hasOpenReturn || returns.length > 0),
      tone: 'return',
    },
  ]

  const forwardDone = steps.filter((s) => s.tone !== 'return' && s.state === 'done').length
  const forwardTotal = steps.filter((s) => s.tone !== 'return').length
  const progressPct = Math.round((forwardDone / forwardTotal) * 100)

  return (
    <section className="oj-pipeline">
      <header className="oj-pipeline-head">
        <div>
          <h2>Package journey</h2>
          <p>
            {split
              ? `Split · ${groups.length} warehouses`
              : allocated
                ? 'Single node · dock to door'
                : 'Waiting on allocation'}
            {latency ? ` · ${latency} elapsed` : ''}
            {returns.length ? ` · ${returns.length} RMA` : ''}
          </p>
        </div>
        <div className="oj-pipeline-head-right">
          {returns.length > 0 ? (
            <span className="oj-pipeline-return-chip">
              {hasOpenReturn ? `${openReturns.length} open RMA` : 'Returns closed'}
            </span>
          ) : null}
          <div
            className={`oj-ring ${hasOpenReturn ? 'has-return' : ''}`}
            style={{ ['--oj-pct' as string]: `${progressPct}` }}
            title={`${progressPct}%`}
          >
            <span className="oj-ring-value">{progressPct}%</span>
          </div>
        </div>
      </header>

      <div className="oj-pipeline-track is-with-return">
        {steps.map((step, i) => {
          const next = steps[i + 1]
          const lineTone =
            next?.tone === 'return'
              ? 'return'
              : next?.state === 'todo'
                ? 'todo'
                : step.state === 'done'
                  ? 'done'
                  : 'active'
          return (
            <div key={step.id} className={`oj-pipeline-cell ${step.tone === 'return' ? 'is-return' : ''}`}>
              <div className={`oj-step is-${step.state} ${step.tone === 'return' ? 'tone-return' : ''}`}>
                <div className="oj-step-rail" aria-hidden>
                  <span className="oj-step-idx">{step.idx}</span>
                  <span className="oj-step-dot" />
                </div>
                <div className="oj-step-body">
                  <div className="oj-step-label">{step.label}</div>
                  {step.detail ? <div className="oj-step-detail">{step.detail}</div> : null}
                  {step.stamp ? <div className="oj-step-stamp oj-mono">{step.stamp}</div> : null}
                </div>
              </div>
              {next ? <div className={`oj-pipeline-line is-${lineTone}`} aria-hidden /> : null}
            </div>
          )
        })}
      </div>

      {split ? (
        <div className="oj-split-bars">
          {groups.map((g) => {
            const ship = shipments.find((s) => s.fulfillmentGroupId === g.id)
            const pct =
              ship?.status === 'delivered' ? 100 : g.status === 'shipped' ? 75 : g.status === 'allocated' ? 40 : 15
            return (
              <div key={g.id} className="oj-split-bar">
                <div className="oj-split-bar-meta">
                  <span>{whName(g.warehouseId)}</span>
                  <span className="oj-mono">{g.status.replace(/_/g, ' ')}</span>
                </div>
                <div className="oj-bar">
                  <span style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}
