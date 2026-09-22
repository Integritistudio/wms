import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import OrderShipActions from '../OrderShipActions'
import { Alert, TruncatedCopyId } from '../ui'
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
import OrderFlowPanel from './OrderFlowPanel'
import OrderDetailSkeleton from './OrderDetailSkeleton'
import ShipmentTracker from './ShipmentTracker'

type TabId = 'overview' | 'fulfillment' | 'flow' | 'activity' | 'returns'

function formatAge(iso?: string) {
  if (!iso) return null
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms) || ms < 0) return null
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${Math.max(1, mins)}m old`
  const hours = Math.floor(mins / 60)
  if (hours < 48) return `${hours}h old`
  const days = Math.floor(hours / 24)
  return `${days}d ${hours % 24}h old`
}

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

function Icon({ name, className = '' }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined oj-skel-icon ${className}`.trim()} aria-hidden>
      {name}
    </span>
  )
}

function PackageDecor() {
  return (
    <svg className="oj-skel-decor" viewBox="0 0 280 160" fill="none" aria-hidden>
      <g opacity="0.55">
        <rect x="28" y="52" width="72" height="58" rx="4" stroke="currentColor" strokeWidth="1.5" />
        <path d="M28 72h72M64 52v58" stroke="currentColor" strokeWidth="1.5" />
        <path d="M48 42l16-10 16 10" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M48 42v10M80 42v10" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M148 98c0-18 14-32 32-32s32 14 32 32v18H148V98Z"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <circle cx="164" cy="98" r="4" fill="currentColor" />
        <circle cx="196" cy="98" r="4" fill="currentColor" />
        <path d="M156 78h40" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path
          d="M210 38l22-8 22 8v28l-22 10-22-10V38Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path d="M210 38l22 8 22-8M232 46v30" stroke="currentColor" strokeWidth="1.5" />
      </g>
      <path
        className="oj-skel-decor-path"
        d="M40 132c36-18 72-18 108 0s72 18 108 0"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeDasharray="5 7"
        strokeLinecap="round"
      />
    </svg>
  )
}

function ShopifyGlyph({ className = '' }: { className?: string }) {
  return (
    <img
      className={`oj-shopify-glyph ${className}`.trim()}
      src="/shopify-logo-svgrepo-com.svg"
      alt=""
      width={20}
      height={20}
      aria-hidden
    />
  )
}

function MetaCard({
  icon,
  label,
  value,
  sub,
  action,
  iconNode,
}: {
  icon?: string
  label: string
  value: ReactNode
  sub?: ReactNode
  action?: ReactNode
  iconNode?: ReactNode
}) {
  return (
    <article className="oj-skel-meta">
      <div className="oj-skel-meta-icon">
        {iconNode || (icon ? <Icon name={icon} /> : null)}
      </div>
      <div className="oj-skel-meta-body">
        <span className="oj-skel-meta-label">{label}</span>
        <div className="oj-live-meta-value">{value}</div>
        {sub ? <div className="oj-live-meta-sub">{sub}</div> : null}
        {action}
      </div>
    </article>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="oj-skel-field oj-live-field">
      <span className="oj-live-field-label">{label}</span>
      <div className="oj-live-field-value">{children}</div>
    </div>
  )
}

function JourneyStep({
  icon,
  label,
  sub,
  active,
  done,
  tone,
}: {
  icon: string
  label: string
  sub?: string
  active?: boolean
  done?: boolean
  tone?: 'return'
}) {
  return (
    <div
      className={`oj-skel-step${active ? ' is-active' : ''}${done ? ' is-done' : ''}${tone === 'return' ? ' is-return' : ''}`}
    >
      <div className="oj-skel-step-node">
        <Icon name={icon} className="oj-skel-icon--sm" />
      </div>
      <span className="oj-live-step-label">{label}</span>
      {sub ? <span className="oj-live-step-sub">{sub}</span> : null}
    </div>
  )
}

function packageJourneyState(
  shipment?: ShipmentRecord,
  group?: FulfillmentGroup,
  hasReturn?: boolean,
) {
  const status = shipment?.status || (group?.status === 'shipped' ? 'shipped' : group?.status || 'pending')
  const steps = [
    { id: 'label', icon: 'label', label: 'Labeled' },
    { id: 'transit', icon: 'flight_takeoff', label: 'In transit' },
    { id: 'ofd', icon: 'local_shipping', label: 'Out for delivery' },
    { id: 'delivered', icon: 'home', label: 'Delivered' },
    { id: 'return', icon: 'assignment_return', label: 'Return', tone: 'return' as const },
  ] as const
  let activeIdx = 0
  if (hasReturn || status === 'returned') activeIdx = 4
  else if (status === 'delivered') activeIdx = 3
  else if (status === 'out_for_delivery') activeIdx = 2
  else if (status === 'in_transit' || status === 'shipped' || group?.status === 'shipped') activeIdx = 1
  else if (shipment?.trackingNumber || status === 'labeled' || group?.status === 'allocated') activeIdx = 0
  return { steps, activeIdx, status }
}

function fulfillmentTimeline(
  order: ShopOrder,
  groups: FulfillmentGroup[],
  shipments: ShipmentRecord[],
  warehouses: { id: string; name: string }[],
  returns: ReturnRecord[],
) {
  const whName = (id: string | null | undefined) =>
    warehouses.find((w) => w.id === id)?.name || (id ? `WH ${id.slice(-4)}` : 'Unassigned')
  const primaryWh = whName(groups[0]?.warehouseId || order.warehouseId)
  const allShipped = groups.length > 0 && groups.every((g) => g.status === 'shipped')
  const anyDelivered = shipments.some((s) => s.status === 'delivered')
  const inTransit = shipments.some((s) => s.status === 'in_transit' || s.status === 'out_for_delivery')
  const openReturns = returns.filter((r) => !/restocked|closed|cancelled|disposed/i.test(r.status))

  return [
    {
      icon: 'check_circle',
      tone: 'ok' as const,
      title: 'Order received',
      detail: new Date(order.createdAt).toLocaleString(),
    },
    {
      icon: 'warehouse',
      tone: groups.length || order.warehouseId ? ('ok' as const) : ('wait' as const),
      title: groups.length ? 'Allocated' : order.warehouseId ? 'Warehouse assigned' : 'Awaiting allocation',
      detail: primaryWh,
    },
    {
      icon: 'local_shipping',
      tone: allShipped || inTransit ? ('ok' as const) : groups.length ? ('mid' as const) : ('wait' as const),
      title: allShipped ? 'Shipped' : inTransit ? 'In transit' : groups.length ? 'Ready to ship' : 'Not shipped',
      detail: shipments[0]?.carrier || order.carrier || 'Carrier pending',
    },
    {
      icon: 'package_2',
      tone: anyDelivered ? ('ok' as const) : allShipped || inTransit ? ('mid' as const) : ('wait' as const),
      title: anyDelivered ? 'Delivered' : 'Delivery pending',
      detail: shipments[0]?.trackingNumber || order.trackingNumber || 'No tracking yet',
    },
    {
      icon: 'assignment_return',
      tone: openReturns.length ? ('return' as const) : returns.length ? ('return' as const) : ('wait' as const),
      title: openReturns.length
        ? 'Return open'
        : returns.length
          ? 'Return closed'
          : 'No returns',
      detail: returns[0]?.rmaNumber || 'Create from Actions',
    },
  ]
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
  const [tab, setTab] = useState<TabId>('overview')
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
  const waitingModernwms = modernwmsLinks.some((l) => l.waitingOnOps && !l.closed)
  const lineItems = order.lineItems || []
  const currency = order.currency || ''
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
  const audit = auditRows(logs, groups, shipments, warehouses)
  const qtyTotal = lineItems.reduce((n, li) => n + (li.quantity || 0), 0)
  const dest = order.shippingAddress
  const timeline = fulfillmentTimeline(order, groups, shipments, warehouses, returns)
  const shipCan =
    groups.some((g) => g.status === 'shipped') ||
    order.status === 'fulfilled' ||
    order.status === 'partially_fulfilled'

  const tabs: Array<{ id: TabId; label: string; icon: string }> = [
    { id: 'overview', label: 'Overview', icon: 'dashboard' },
    { id: 'fulfillment', label: 'Fulfillment', icon: 'inventory_2' },
    { id: 'flow', label: 'Flow', icon: 'account_tree' },
    { id: 'activity', label: 'Activity', icon: 'timeline' },
    { id: 'returns', label: 'Returns', icon: 'assignment_return' },
  ]

  return (
    <div className="order-detail order-journey oj-skel oj-live">
      <section className="oj-skel-hero">
        <div className="oj-skel-hero-main">
          <div className="oj-skel-crumb">
            <button
              type="button"
              className="oj-live-crumb-btn"
              onClick={() => void navigate({ to: '/account/orders' })}
              aria-label="Back to orders"
            >
              <Icon name="arrow_back" className="oj-skel-icon--sm" />
            </button>
            <button type="button" className="oj-live-crumb-link" onClick={() => void navigate({ to: '/account/orders' })}>
              Orders
            </button>
            <span className="oj-skel-slash">/</span>
            <span className="oj-live-crumb-id">{order.orderNumber}</span>
          </div>
          <div className="oj-skel-title-row">
            <h1 className="oj-live-title">#{String(order.orderNumber).replace(/^#/, '')}</h1>
            <span className="oj-skel-badge">
              <Icon name="replay" className="oj-skel-icon--xs" />
              {headline}
            </span>
            {formatAge(order.createdAt) ? <span className="oj-live-age">{formatAge(order.createdAt)}</span> : null}
            {order.isB2B ? <span className="oj-live-chip-tag">B2B</span> : null}
            {order.shippingMethod?.isExpedited ? <span className="oj-live-chip-tag is-fast">Expedited</span> : null}
            {order.riskLevel && order.riskLevel !== 'NONE' ? (
              <span className="oj-live-chip-tag is-risk">{order.riskLevel}</span>
            ) : null}
          </div>
          <p className="oj-live-sub">
            {[
              shop?.shopDomain || order.channel || 'shopify',
              primaryWh || 'Unassigned warehouse',
              primaryShipment?.carrier || order.carrier || null,
              dest?.city || dest?.countryCode || null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="oj-skel-hero-aside">
          <PackageDecor />
          <div className="oj-skel-hero-actions">
            {order.source !== 'demo' ? (
              <button
                type="button"
                className="oj-skel-chip oj-live-chip"
                disabled={syncing || groups.every((g) => g.status !== 'shipped')}
                onClick={() => void pushShopify(needsShopifySync ? false : true)}
              >
                <Icon name="bolt" className="oj-skel-icon--xs" />
                {syncing ? 'Syncing…' : needsShopifySync ? 'Push Shopify' : 'Re-sync'}
              </button>
            ) : null}
            {order.fileLink?.url ? (
              <a className="oj-skel-chip oj-live-chip" href={order.fileLink.url} target="_blank" rel="noreferrer">
                <Icon name="description" className="oj-skel-icon--xs" />
                EDI 940
              </a>
            ) : null}
            <button
              type="button"
              className="oj-skel-chip oj-live-chip oj-live-chip--icon"
              onClick={() => void load()}
              aria-label="Refresh order"
              title="Refresh"
            >
              <Icon name="refresh" className="oj-skel-icon--sm" />
            </button>
          </div>
        </div>
      </section>

      {(order.lastError ||
        needsShopifySync ||
        order.sftpError ||
        waitingModernwms ||
        (order.suggestedWarehouseId && !order.warehouseId)) && (
        <div className="oj-live-alerts">
          {order.lastError ? <Alert tone="danger">{order.lastError}</Alert> : null}
          {needsShopifySync ? (
            <Alert tone="danger">
              Fulfilled in WMS but Shopify still needs an update. Use <strong>Push Shopify</strong>.
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
              Open <strong>WMS Linker inside Shopify Admin → Apps</strong> so a new Admin API token can be stored, then
              try Push again.
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
            <Alert tone="info">Waiting on ModernWMS warehouse ops. Linker will auto-sync when delivery is reported.</Alert>
          ) : null}
        </div>
      )}

      <section className="oj-skel-metas">
        <MetaCard
          icon="calendar_today"
          label="Created"
          value={new Date(order.createdAt).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
          sub={new Date(order.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
        />
        <MetaCard
          icon="description"
          label="940 file"
          value={order.fileLink?.fileName || (order.sftpStatus === 'sent' ? 'Sent' : 'Not generated')}
          sub={order.sftpStatus || (order.fileLink ? 'Ready' : '—')}
          action={
            order.fileLink?.url ? (
              <a className="oj-live-meta-link" href={order.fileLink.url} target="_blank" rel="noreferrer">
                Download
              </a>
            ) : null
          }
        />
        <MetaCard
          icon="warehouse"
          label="Warehouse"
          value={primaryWh || 'Unassigned'}
          sub={
            groups.length > 1
              ? `Split · ${groups.length} packages`
              : order.routingReason || (order.suggestedWarehouseId && !order.warehouseId ? 'Suggestion pending' : '—')
          }
        />
        <MetaCard
          icon="local_shipping"
          label="Tracking"
          value={
            primaryShipment?.trackingNumber || order.trackingNumber ? (
              <TruncatedCopyId value={primaryShipment?.trackingNumber || order.trackingNumber} maxLen={18} />
            ) : (
              '—'
            )
          }
          sub={primaryShipment?.carrier || order.carrier || 'No carrier'}
        />
        <MetaCard
          iconNode={<ShopifyGlyph />}
          label="Shopify sync"
          value={syncLabel}
          sub={needsShopifySync ? 'Push required' : shop?.shopDomain || order.shopifyOrderId || '—'}
        />
      </section>

      <nav className="oj-skel-tabs" aria-label="Order sections">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`oj-skel-tab oj-live-tab${tab === t.id ? ' is-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <Icon name={t.icon} className="oj-skel-icon--sm" />
            {t.label}
            {t.id === 'returns' && returns.length > 0 ? <span className="oj-live-tab-count">{returns.length}</span> : null}
          </button>
        ))}
      </nav>

      {(tab === 'overview' || tab === 'fulfillment') && (
        <section className="oj-skel-card oj-skel-pipeline">
          <header className="oj-skel-card-head">
            <Icon name="route" />
            <span>Package journey</span>
          </header>
          <div className="oj-skel-flow oj-skel-flow--wide">
            <div className="oj-skel-timeline">
              {timeline.map((s, i) => (
                <div key={s.title} className={`oj-skel-tl-item is-${s.tone}`}>
                  <div className="oj-skel-tl-rail">
                    <Icon name={s.icon} className="oj-skel-icon--sm" />
                    {i < timeline.length - 1 ? <span className="oj-skel-tl-line" /> : null}
                  </div>
                  <div className="oj-skel-tl-body">
                    <div className="oj-live-tl-title">{s.title}</div>
                    <div className="oj-live-tl-detail">{s.detail}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="oj-skel-packages">
              {(groups.length ? groups : [null]).map((g, n) => {
                const shipment = g
                  ? shipments.find((s) => s.fulfillmentGroupId === g.id)
                  : primaryShipment
                const journey = packageJourneyState(shipment, g || undefined, returns.length > 0)
                const wh =
                  warehouses.find((w) => w.id === g?.warehouseId)?.name ||
                  (g?.warehouseId ? `WH ${g.warehouseId.slice(-4)}` : primaryWh || 'Package')
                return (
                  <div key={g?.id || 'pending'} className="oj-skel-pkg">
                    <div className="oj-skel-pkg-head">
                      <Icon name="inventory_2" className="oj-skel-icon--sm" />
                      <span>
                        Package {n + 1}
                        {groups.length > 1 ? ` · ${wh}` : ''}
                      </span>
                      {shipment?.trackingNumber ? (
                        <span className="oj-skel-ml oj-live-mono oj-live-pkg-track">{shipment.trackingNumber}</span>
                      ) : null}
                    </div>
                    <div className="oj-skel-journey oj-skel-journey--wide">
                      {journey.steps.flatMap((step, i) => {
                        const last = journey.steps.length - 1
                        const isReturn = 'tone' in step && step.tone === 'return'
                        const nodes = [
                          <JourneyStep
                            key={step.id}
                            icon={step.icon}
                            label={step.label}
                            tone={isReturn ? 'return' : undefined}
                            active={i === journey.activeIdx}
                            done={i < journey.activeIdx || (journey.activeIdx === last && isReturn)}
                          />,
                        ]
                        if (i < journey.steps.length - 1) {
                          const nextIsReturn = 'tone' in journey.steps[i + 1] && journey.steps[i + 1].tone === 'return'
                          nodes.push(
                            <span
                              key={`${step.id}-line`}
                              className={`oj-skel-journey-line${i >= journey.activeIdx ? ' is-dim' : ''}${nextIsReturn ? ' is-return' : ''}`}
                            />,
                          )
                        }
                        return nodes
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {tab === 'fulfillment' ? (
        <div className="oj-ff-split">
          <div className="oj-ff-split-main">
            <section className="oj-skel-card">
              <OrderFulfillmentPanel
                orderId={order.id}
                warehouses={warehouses}
                onDone={onDone}
                onError={setError}
                hideLogs
                showTracker={false}
              />
            </section>

            <section className="oj-skel-card oj-adv-panel">
              {shipments.length > 0 ? (
                <ShipmentTracker
                  shipments={shipments}
                  warehouses={warehouses}
                  onDone={onDone}
                  onError={setError}
                />
              ) : (
                <div className="oj-adv-empty-state">
                  <Icon name="timeline" />
                  <div>
                    <strong>Advance shipment</strong>
                    <p>Ship a fulfillment group to unlock stage controls here.</p>
                  </div>
                </div>
              )}
            </section>
          </div>

          <aside className="oj-skel-card oj-skel-actions oj-ff-split-aside">
            <header className="oj-skel-card-head">
              <Icon name="tune" />
              <span>Actions</span>
            </header>

            {canAssign ? (
              <div className="oj-skel-action-block">
                <span className="oj-live-action-label">Warehouse</span>
                <div className="oj-skel-select oj-live-select">
                  <Icon name="warehouse" className="oj-skel-icon--sm" />
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
                </div>
                <button
                  type="button"
                  className="oj-skel-btn oj-skel-btn--accent"
                  disabled={assigning || selectedWarehouseId === (order.warehouseId || '')}
                  onClick={() => void assignSelectedWarehouse()}
                >
                  <Icon name="check" className="oj-skel-icon--sm" />
                  {assigning ? 'Saving…' : 'Assign'}
                </button>
                <p className="oj-live-hint">
                  {eligibleWarehouses.length === 0
                    ? 'No warehouse stocks these SKUs yet.'
                    : `${eligibleWarehouses.length} warehouse${eligibleWarehouses.length === 1 ? '' : 's'} with stock`}
                </p>
              </div>
            ) : null}

            <div className="oj-skel-action-block">
              <span className="oj-live-action-label">Ship</span>
              {groups.length <= 1 ? (
                <div className="oj-live-ship oj-live-ship--compact">
                  <OrderShipActions
                    order={order}
                    actor="company"
                    fulfillmentGroupId={groups[0]?.id || null}
                    onDone={onDone}
                    onError={setError}
                    compact
                  />
                </div>
              ) : (
                <p className="oj-live-hint">Split order — ship each group on the left.</p>
              )}
            </div>

            <div className="oj-skel-action-block">
              <span className="oj-live-action-label">Return</span>
              <div className="oj-skel-select oj-skel-select--tall oj-live-select">
                <textarea
                  placeholder="Return reason"
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  rows={2}
                />
              </div>
              <button
                type="button"
                className="oj-skel-btn oj-skel-btn--ghost"
                disabled={creatingReturn || !shipCan}
                onClick={() => void startReturn()}
              >
                <Icon name="assignment_return" className="oj-skel-icon--sm" />
                {creatingReturn ? 'Creating…' : 'Create return'}
              </button>
            </div>

            {(waitingModernwms || needsShopifySync || order.routingReason) && (
              <div className="oj-skel-alert">
                <Icon name="info" className="oj-skel-icon--sm" />
                <div>
                  {needsShopifySync
                    ? 'Shopify still needs a fulfillment push for shipped groups.'
                    : waitingModernwms
                      ? 'ModernWMS ops in progress — auto-sync when complete.'
                      : order.routingReason}
                </div>
              </div>
            )}
          </aside>
        </div>
      ) : null}

      {tab === 'flow' ? (
        <OrderFlowPanel
          order={order}
          groups={groups}
          shipments={shipments}
          returns={returns}
          warehouses={warehouses}
          shopDomain={shop?.shopDomain}
        />
      ) : null}

      {tab !== 'fulfillment' && tab !== 'flow' ? (
      <div className="oj-skel-grid">
        <div className="oj-skel-main">
          {tab === 'overview' ? (
            <>
              <section className="oj-skel-card oj-skel-card--split">
                <div>
                  <header className="oj-skel-card-head">
                    <Icon name="person" />
                    <span>Customer</span>
                  </header>
                  <div className="oj-skel-fields">
                    <Field label="Name">{order.customerName || '—'}</Field>
                    <Field label="Email">
                      {order.email ? <a href={`mailto:${order.email}`}>{order.email}</a> : '—'}
                    </Field>
                    <Field label="Phone">{order.phone || dest?.phone || order.billingAddress?.phone || '—'}</Field>
                    <Field label="Channel">
                      {order.channel || 'shopify'}
                      {order.isB2B ? ' · B2B' : ''}
                    </Field>
                  </div>
                </div>
                <div>
                  <header className="oj-skel-card-head">
                    <Icon name="location_on" />
                    <span>Ship to</span>
                  </header>
                  <div className="oj-skel-fields">
                    {formatAddress(order.shippingAddress).length ? (
                      formatAddress(order.shippingAddress).map((line, i) => (
                        <Field key={`ship-${line}-${i}`} label={i === 0 ? 'Name' : ' '}>
                          {line}
                        </Field>
                      ))
                    ) : (
                      <p className="oj-live-hint">No shipping address</p>
                    )}
                    <Field label="Method">
                      {order.shippingMethod?.title ||
                        order.shippingMethod?.shopifyServiceCode ||
                        order.shippingMethod?.wmsShipCode ||
                        '—'}
                      {order.shippingMethod?.isExpedited ? ' · Expedited' : ''}
                    </Field>
                  </div>
                </div>
              </section>

              <section className="oj-skel-card oj-skel-card--split">
                <div>
                  <header className="oj-skel-card-head">
                    <Icon name="receipt_long" />
                    <span>Bill to</span>
                  </header>
                  <div className="oj-skel-fields">
                    {formatAddress(order.billingAddress).length ? (
                      formatAddress(order.billingAddress).map((line, i) => (
                        <Field key={`bill-${line}-${i}`} label={i === 0 ? 'Name' : ' '}>
                          {line}
                        </Field>
                      ))
                    ) : (
                      <p className="oj-live-hint">Same as shipping / none on file</p>
                    )}
                  </div>
                </div>
                <div>
                  <header className="oj-skel-card-head">
                    <Icon name="info" />
                    <span>Order facts</span>
                  </header>
                  <div className="oj-skel-fields">
                    {order.poNumber ? (
                      <Field label="PO">
                        <TruncatedCopyId value={order.poNumber} maxLen={24} />
                      </Field>
                    ) : null}
                    <Field label="Routing">{order.routingReason || 'No rule applied yet'}</Field>
                    <Field label="Warehouse">{primaryWh || 'Unassigned'}</Field>
                    {order.tags ? (
                      <Field label="Tags">
                        <div className="oj-live-tags">
                          {order.tags
                            .split(/[,\s]+/)
                            .map((t) => t.trim())
                            .filter(Boolean)
                            .map((tag) => (
                              <span key={tag} className="oj-live-chip-tag">
                                {tag}
                              </span>
                            ))}
                        </div>
                      </Field>
                    ) : null}
                    {order.giftMessage ? <Field label="Note">{order.giftMessage}</Field> : null}
                    {!order.poNumber && !order.tags && !order.giftMessage ? (
                      <Field label="Status">{headline}</Field>
                    ) : null}
                  </div>
                </div>
              </section>

              <section className="oj-skel-card">
                <header className="oj-skel-card-head">
                  <Icon name="shopping_bag" />
                  <span>Line items</span>
                  <span className="oj-skel-ml oj-live-count">{qtyTotal || lineItems.length}</span>
                </header>
                {lineItems.length ? (
                  <div className="oj-skel-table">
                    <div className="oj-skel-table-head">
                      {['Item', 'SKU', 'Qty', 'Status'].map((h) => (
                        <span key={h}>{h}</span>
                      ))}
                    </div>
                    {lineItems.map((row: OrderLineItem, idx) => (
                      <div key={row.id || `${row.sku}-${idx}`} className="oj-skel-table-row">
                        <div className="oj-skel-item">
                          <span className="oj-skel-thumb">
                            <Icon name="image" className="oj-skel-icon--sm" />
                          </span>
                          <div className="oj-live-item-text">
                            <div className="oj-live-item-title">{row.title || row.name || 'Item'}</div>
                            {row.variantTitle ? <div className="oj-live-item-sub">{row.variantTitle}</div> : null}
                            {row.price ? <div className="oj-live-item-sub">{formatMoney(row.price, currency)}</div> : null}
                          </div>
                        </div>
                        <span className="oj-live-mono">{row.sku || '—'}</span>
                        <span className="oj-live-mono">{row.quantity ?? 0}</span>
                        <span className="oj-skel-pill oj-live-pill">
                          {(row.fulfillmentStatus || row.status || 'unfulfilled').replace(/_/g, ' ')}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="oj-live-hint">No line items.</p>
                )}
              </section>

              {(order.totals?.subtotal || order.totals?.totalPrice) && (
                <section className="oj-skel-card oj-live-totals">
                  <header className="oj-skel-card-head">
                    <Icon name="payments" />
                    <span>Totals</span>
                    <span className="oj-skel-ml oj-live-mono">{formatMoney(order.totals?.totalPrice, currency)}</span>
                  </header>
                  <dl className="oj-live-money">
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
                      <dd>{order.totals?.totalDiscounts ? formatMoney(order.totals.totalDiscounts, currency) : '—'}</dd>
                    </div>
                  </dl>
                </section>
              )}

              <section className="oj-skel-card">
                <header className="oj-skel-card-head">
                  <Icon name="link" />
                  <span>IDs &amp; documents</span>
                </header>
                <div className="oj-live-id-grid">
                  <div className="oj-live-id-row">
                    <span className="oj-live-field-label">Shopify order</span>
                    <div className="oj-live-field-value">
                      {order.shopifyOrderId ? <TruncatedCopyId value={order.shopifyOrderId} maxLen={20} /> : '—'}
                    </div>
                  </div>
                  <div className="oj-live-id-row">
                    <span className="oj-live-field-label">Linker ID</span>
                    <div className="oj-live-field-value">
                      <TruncatedCopyId value={order.id} maxLen={16} />
                    </div>
                  </div>
                  <div className="oj-live-id-row">
                    <span className="oj-live-field-label">Shop</span>
                    <div className="oj-live-field-value oj-live-mono">{shop?.shopDomain || order.shopId || '—'}</div>
                  </div>
                  <div className="oj-live-id-row">
                    <span className="oj-live-field-label">Tracking link</span>
                    <div className="oj-live-field-value">
                      {primaryShipment?.trackingUrl ? (
                        <a href={primaryShipment.trackingUrl} target="_blank" rel="noreferrer">
                          Open carrier
                        </a>
                      ) : (
                        '—'
                      )}
                    </div>
                  </div>
                  <div className="oj-live-id-row">
                    <span className="oj-live-field-label">EDI 940</span>
                    <div className="oj-live-field-value">
                      {order.fileLink?.url ? (
                        <a href={order.fileLink.url} target="_blank" rel="noreferrer">
                          {order.fileLink.fileName || 'Download'}
                        </a>
                      ) : (
                        order.sftpStatus || 'Not generated'
                      )}
                    </div>
                  </div>
                  <div className="oj-live-id-row">
                    <span className="oj-live-field-label">Shopify fulfillment</span>
                    <div className="oj-live-field-value">
                      {primaryShipment?.shopifyFulfillmentId ? (
                        <TruncatedCopyId value={primaryShipment.shopifyFulfillmentId} maxLen={18} />
                      ) : needsShopifySync ? (
                        'Pending push'
                      ) : (
                        '—'
                      )}
                    </div>
                  </div>
                </div>
              </section>

              {modernwmsLinks.length > 0 ? (
                <section className="oj-skel-card">
                  <header className="oj-skel-card-head">
                    <Icon name="hub" />
                    <span>ModernWMS</span>
                    <span className="oj-skel-ml oj-live-count">{modernwmsLinks.length}</span>
                  </header>
                  <ul className="oj-live-mw-list">
                    {modernwmsLinks.map((link) => (
                      <li key={link.id} className={link.closed ? 'is-closed' : link.waitingOnOps ? 'is-wait' : ''}>
                        <div>
                          <div className="oj-live-act-title">
                            {link.dispatchNo || 'Pending dispatch'}
                            <span className="oj-live-mw-status">{link.statusLabel}</span>
                          </div>
                          <div className="oj-live-act-detail">
                            {warehouses.find((w) => w.id === link.warehouseId)?.name ||
                              (link.warehouseId ? `WH ${link.warehouseId.slice(-4)}` : 'Warehouse')}
                            {link.lastPolledAt
                              ? ` · Polled ${new Date(link.lastPolledAt).toLocaleString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: 'numeric',
                                  minute: '2-digit',
                                })}`
                              : ''}
                          </div>
                          {link.pushError ? <div className="oj-live-mw-err">{link.pushError}</div> : null}
                        </div>
                        <span className={`oj-skel-dot ${link.closed ? 'is-ok' : link.waitingOnOps ? 'is-mid' : 'is-wait'}`} />
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          ) : null}

          {tab === 'activity' ? (
            <section className="oj-skel-card">
              <header className="oj-skel-card-head">
                <Icon name="history" />
                <span>Activity</span>
                <button
                  type="button"
                  className="oj-skel-ml oj-live-ghost-btn"
                  onClick={() => setShowEvents((v) => !v)}
                >
                  {showEvents ? 'Hide detail' : 'Full events'}
                </button>
              </header>
              <ul className="oj-skel-activity">
                {audit.length === 0 ? (
                  <li className="oj-live-hint">No events yet.</li>
                ) : (
                  audit.map((row) => (
                    <li key={row.id}>
                      <span className={`oj-skel-dot ${row.ok ? 'is-ok' : 'is-mid'}`} />
                      <div>
                        <div className="oj-live-act-title">{row.event}</div>
                        <div className="oj-live-act-detail">
                          {row.origin}
                          {row.details ? ` · ${row.details}` : ''}
                        </div>
                        <div className="oj-live-act-time">
                          {new Date(row.at).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                    </li>
                  ))
                )}
              </ul>
              {showEvents ? (
                <div className="oj-live-fulfill-embed">
                  <OrderEventsPanel logs={logs} groups={groups} shipments={shipments} />
                </div>
              ) : null}
            </section>
          ) : null}

          {tab === 'returns' ? (
            <section className="oj-skel-card">
              <header className="oj-skel-card-head">
                <Icon name="assignment_return" />
                <span>Returns</span>
                <button
                  type="button"
                  className="oj-skel-ml oj-live-ghost-btn"
                  onClick={() => void navigate({ to: '/account/returns' })}
                >
                  All returns
                </button>
              </header>
              <div className="oj-live-return-create">
                <input
                  className="demo-input flex-1"
                  placeholder="Return reason"
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                />
                <button
                  type="button"
                  className="oj-skel-btn oj-skel-btn--ghost"
                  disabled={creatingReturn || !shipCan}
                  onClick={() => void startReturn()}
                >
                  <Icon name="assignment_return" className="oj-skel-icon--sm" />
                  {creatingReturn ? 'Creating…' : 'Create return'}
                </button>
              </div>
              {returns.length === 0 ? (
                <p className="oj-live-hint">No returns yet. After ship, create an RMA to track receive / restock.</p>
              ) : (
                <ul className="oj-skel-activity">
                  {returns.map((r) => (
                    <li key={r.id}>
                      <span
                        className={`oj-skel-dot ${
                          /restocked|closed|cancelled|disposed/i.test(r.status)
                            ? 'is-ok'
                            : /received|inspect/i.test(r.status)
                              ? 'is-mid'
                              : 'is-wait'
                        }`}
                      />
                      <div>
                        <div className="oj-live-act-title">
                          {r.rmaNumber} · {r.status.replace(/_/g, ' ')}
                        </div>
                        <div className="oj-live-act-detail">
                          {(r.lines || []).map((l) => `${l.sku}×${l.quantity}`).join(', ') || `${r.lines?.length || 0} line(s)`}
                          {r.reason ? ` · ${r.reason}` : ''}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {tab === 'overview' ? (
            <section className="oj-skel-card">
              <header className="oj-skel-card-head">
                <Icon name="history" />
                <span>Activity</span>
              </header>
              <ul className="oj-skel-activity">
                {audit.length === 0 ? (
                  <li className="oj-live-hint">No events yet.</li>
                ) : (
                  audit.slice(0, 5).map((row) => (
                    <li key={row.id}>
                      <span className={`oj-skel-dot ${row.ok ? 'is-ok' : 'is-mid'}`} />
                      <div>
                        <div className="oj-live-act-title">{row.event}</div>
                        <div className="oj-live-act-detail">
                          {row.origin}
                          {row.details ? ` · ${row.details}` : ''}
                        </div>
                      </div>
                    </li>
                  ))
                )}
              </ul>
              {audit.length > 5 ? (
                <button type="button" className="oj-live-ghost-btn" onClick={() => setTab('activity')}>
                  View all activity →
                </button>
              ) : null}
            </section>
          ) : null}
        </div>

        <aside className="oj-skel-aside">
          <section className="oj-skel-card oj-skel-actions">
            <header className="oj-skel-card-head">
              <Icon name="tune" />
              <span>Actions</span>
            </header>

            {canAssign ? (
              <div className="oj-skel-action-block">
                <span className="oj-live-action-label">Warehouse</span>
                <div className="oj-skel-select oj-live-select">
                  <Icon name="warehouse" className="oj-skel-icon--sm" />
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
                </div>
                <button
                  type="button"
                  className="oj-skel-btn oj-skel-btn--accent"
                  disabled={assigning || selectedWarehouseId === (order.warehouseId || '')}
                  onClick={() => void assignSelectedWarehouse()}
                >
                  <Icon name="check" className="oj-skel-icon--sm" />
                  {assigning ? 'Saving…' : 'Assign'}
                </button>
                <p className="oj-live-hint">
                  {eligibleWarehouses.length === 0
                    ? 'No warehouse stocks these SKUs yet.'
                    : `${eligibleWarehouses.length} warehouse${eligibleWarehouses.length === 1 ? '' : 's'} with stock`}
                </p>
              </div>
            ) : null}

            <div className="oj-skel-action-block">
              <span className="oj-live-action-label">Ship</span>
              {groups.length <= 1 ? (
                <div className="oj-live-ship oj-live-ship--compact">
                  <OrderShipActions
                    order={order}
                    actor="company"
                    fulfillmentGroupId={groups[0]?.id || null}
                    onDone={onDone}
                    onError={setError}
                    compact
                  />
                </div>
              ) : (
                <p className="oj-live-hint">Split order — ship each group under Fulfillment.</p>
              )}
            </div>

            <div className="oj-skel-action-block">
              <span className="oj-live-action-label">Return</span>
              <div className="oj-skel-select oj-skel-select--tall oj-live-select">
                <textarea
                  placeholder="Return reason"
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  rows={2}
                />
              </div>
              <button
                type="button"
                className="oj-skel-btn oj-skel-btn--ghost"
                disabled={creatingReturn || !shipCan}
                onClick={() => void startReturn()}
              >
                <Icon name="assignment_return" className="oj-skel-icon--sm" />
                {creatingReturn ? 'Creating…' : 'Create return'}
              </button>
            </div>

            {(waitingModernwms || needsShopifySync || order.routingReason) && (
              <div className="oj-skel-alert">
                <Icon name="info" className="oj-skel-icon--sm" />
                <div>
                  {needsShopifySync
                    ? 'Shopify still needs a fulfillment push for shipped groups.'
                    : waitingModernwms
                      ? 'ModernWMS ops in progress — auto-sync when complete.'
                      : order.routingReason}
                </div>
              </div>
            )}
          </section>
        </aside>
      </div>
      ) : null}
    </div>
  )
}
