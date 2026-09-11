import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import OrderShipActions from '../OrderShipActions'
import { Alert, DataTable, FormField, PageHeader, PageSection, StatusBadge, type DataTableColumn } from '../ui'
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

function addressLines(address?: OrderAddress | null) {
  if (!address) return []
  const lines = [
    address.name,
    address.company,
    address.address1,
    address.address2,
    [address.city, address.provinceCode || address.province, address.zip].filter(Boolean).join(', '),
    address.country || address.countryCode,
  ]
  return lines.map((line) => String(line || '').trim()).filter(Boolean)
}

function AddressBlock({ title, address }: { title: string; address?: OrderAddress | null }) {
  const lines = addressLines(address)
  return (
    <div className="order-info-card">
      <h4 className="order-info-card-title">{title}</h4>
      {lines.length ? (
        <address className="order-address">
          {lines.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </address>
      ) : (
        <p className="demo-muted text-sm">No address on file</p>
      )}
      {address?.phone ? <p className="order-info-meta">Phone: {address.phone}</p> : null}
    </div>
  )
}

function MetaItem({ label, children }: { label: string; children: ReactNode }) {
  if (children == null || children === '' || children === '—') return null
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
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

  const lineColumns: DataTableColumn<OrderLineItem>[] = [
    {
      key: 'item',
      header: 'Item',
      render: (row) => (
        <div>
          <div className="demo-cell-primary">{row.title || row.name || 'Item'}</div>
          {row.variantTitle ? <div className="demo-cell-secondary">{row.variantTitle}</div> : null}
          {row.vendor ? <div className="demo-muted text-xs">{row.vendor}</div> : null}
        </div>
      ),
    },
    {
      key: 'sku',
      header: 'SKU',
      render: (row) => <code>{row.sku || '—'}</code>,
    },
    {
      key: 'qty',
      header: 'Qty',
      render: (row) => String(row.quantity ?? 0),
    },
    {
      key: 'alloc',
      header: 'Allocated',
      render: (row) => String(row.allocatedQty ?? 0),
    },
    {
      key: 'shipped',
      header: 'Shipped',
      render: (row) => String(row.shippedQty ?? 0),
    },
    {
      key: 'price',
      header: 'Price',
      align: 'right',
      render: (row) => formatMoney(row.price, currency),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => row.fulfillmentStatus || row.status || '—',
    },
  ]

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

      <dl className="meta-grid">
        <div>
          <dt>Status</dt>
          <dd>
            <StatusBadge status={order.status} />
          </dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{new Date(order.createdAt).toLocaleString()}</dd>
        </div>
        <div>
          <dt>940 file</dt>
          <dd>
            {order.fileLink?.url ? (
              <a href={order.fileLink.url} target="_blank" rel="noreferrer">
                Download 940
              </a>
            ) : (
              <span className="demo-muted">Not generated</span>
            )}
          </dd>
        </div>
        {order.trackingNumber ? (
          <div>
            <dt>Tracking</dt>
            <dd>
              {order.carrier} {order.trackingNumber}
            </dd>
          </div>
        ) : null}
        <div>
          <dt>Shopify sync</dt>
          <dd>
            {order.source === 'demo' ? (
              <span className="demo-muted">Demo (no Shopify)</span>
            ) : needsShopifySync ? (
              <StatusBadge status="error" label="Pending" variant="warning" />
            ) : groups.some((g) => g.status === 'shipped') ? (
              <StatusBadge status="fulfilled" label="Synced" />
            ) : (
              <span className="demo-muted">Not shipped yet</span>
            )}
          </dd>
        </div>
      </dl>

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
          Open <strong>WMS Linker inside Shopify Admin → Apps</strong> (not a normal browser tab) so a new Admin API
          token can be stored, then try Push again.
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
      {order.routingReason && !(order.suggestedWarehouseId && !order.warehouseId) ? (
        <p className="demo-muted text-sm">Routing: {order.routingReason}</p>
      ) : null}
      {order.sftpError ? <Alert tone="danger">{order.sftpError}</Alert> : null}
      {modernwmsLinks.length ? (
        <Alert tone="info" title="ModernWMS">
          <ul className="ui-stack-sm">
            {modernwmsLinks.map((link) => (
              <li key={link.id}>
                Dispatch <code>{link.dispatchNo || 'pending'}</code> · {link.statusLabel}
                {link.lastPolledAt ? ` · polled ${new Date(link.lastPolledAt).toLocaleString()}` : ''}
                {link.waitingOnOps ? ' · waiting on MWMS ops' : link.closed ? ' · synced to Shopify path' : ''}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}
      {waitingModernwms ? (
        <Alert tone="info">
          Waiting on ModernWMS warehouse ops to complete pick/ship. Linker will auto-sync when delivery status is reported.
        </Alert>
      ) : null}

      <PageSection title="Customer" description="Contact details and order attributes from Shopify.">
        <dl className="meta-grid">
          <MetaItem label="Name">{order.customerName || '—'}</MetaItem>
          <MetaItem label="Email">
            {order.email ? (
              <a href={`mailto:${order.email}`}>{order.email}</a>
            ) : (
              '—'
            )}
          </MetaItem>
          <MetaItem label="Phone">
            {order.phone || order.shippingAddress?.phone || order.billingAddress?.phone || '—'}
          </MetaItem>
          <MetaItem label="Store">{shop?.shopDomain || order.shopId}</MetaItem>
          <MetaItem label="Shopify order">{order.shopifyOrderId}</MetaItem>
          <MetaItem label="Channel">{order.channel || 'shopify'}</MetaItem>
          <MetaItem label="B2B">{order.isB2B ? 'Yes' : 'No'}</MetaItem>
          <MetaItem label="PO number">{order.poNumber || undefined}</MetaItem>
          <MetaItem label="Risk">{order.riskLevel && order.riskLevel !== 'NONE' ? order.riskLevel : undefined}</MetaItem>
          <MetaItem label="Tags">{order.tags || undefined}</MetaItem>
        </dl>
        {order.giftMessage ? (
          <div className="order-note-box mt-3">
            <strong>Note / gift message</strong>
            <p>{order.giftMessage}</p>
          </div>
        ) : null}
      </PageSection>

      <PageSection title="Addresses" description="Ship-to and bill-to from the Shopify order.">
        <div className="order-address-grid">
          <AddressBlock title="Shipping address" address={order.shippingAddress} />
          <AddressBlock title="Billing address" address={order.billingAddress} />
        </div>
        <dl className="meta-grid mt-3">
          <MetaItem label="Shipping method">
            {order.shippingMethod?.title ||
              order.shippingMethod?.shopifyServiceCode ||
              order.shippingMethod?.wmsShipCode ||
              undefined}
          </MetaItem>
          <MetaItem label="Service code">{order.shippingMethod?.shopifyServiceCode || undefined}</MetaItem>
          <MetaItem label="Carrier SCAC">{order.shippingMethod?.carrierScac || undefined}</MetaItem>
          <MetaItem label="Expedited">{order.shippingMethod?.isExpedited ? 'Yes' : undefined}</MetaItem>
          <MetaItem label="Shipping price">
            {order.shippingMethod?.price
              ? formatMoney(order.shippingMethod.price, currency)
              : order.totals?.totalShipping
                ? formatMoney(order.totals.totalShipping, currency)
                : undefined}
          </MetaItem>
        </dl>
      </PageSection>

      <PageSection title="Line items" description={`${lineItems.length} item(s) on the order.`}>
        {lineItems.length ? (
          <DataTable
            columns={lineColumns}
            rows={lineItems}
            rowKey={(row) => row.id || `${row.sku || 'line'}-${row.title || 'item'}`}
            emptyTitle="No line items"
          />
        ) : (
          <p className="demo-muted text-sm">No line items on this order.</p>
        )}
        {(order.totals?.subtotal || order.totals?.totalPrice) && (
          <dl className="meta-grid mt-3">
            <MetaItem label="Subtotal">{formatMoney(order.totals?.subtotal, currency)}</MetaItem>
            <MetaItem label="Discounts">
              {order.totals?.totalDiscounts ? formatMoney(order.totals.totalDiscounts, currency) : undefined}
            </MetaItem>
            <MetaItem label="Shipping">{formatMoney(order.totals?.totalShipping, currency)}</MetaItem>
            <MetaItem label="Tax">{formatMoney(order.totals?.totalTax, currency)}</MetaItem>
            <MetaItem label="Total">{formatMoney(order.totals?.totalPrice, currency)}</MetaItem>
            <MetaItem label="Currency">{currency || undefined}</MetaItem>
          </dl>
        )}
      </PageSection>

      <OrderShipmentFlow
        order={order}
        groups={groups}
        shipments={shipments}
        logs={showEvents ? [] : logs}
        warehouses={warehouses}
        modernwmsLinks={modernwmsLinks}
      />

      {showEvents ? (
        <PageSection title="Events">
          <OrderEventsPanel logs={logs} groups={groups} shipments={shipments} />
        </PageSection>
      ) : null}

      <PageSection title="Actions">
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
      </PageSection>

      <PageSection title="Returns">
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
          <ul className="ui-stack-sm text-sm">
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
      </PageSection>
    </div>
  )
}
