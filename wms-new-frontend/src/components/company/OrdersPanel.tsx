import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Package,
  RefreshCw,
  Warehouse,
} from 'lucide-react'
import {
  DataTable,
  ListToolbar,
  Pagination,
  StatusBadge,
  StatusTabs,
  type DataTableColumn,
} from '../ui'
import { useCompanyPortal } from './CompanyPortalContext'
import { listCompanyOrders, type ShopOrder } from '../../lib/api'
import { OrderCarrierChip, OrderShipProgressCell, OrderSftpCell } from './OrderListShipCells'

function isShopifyOrder(row: ShopOrder) {
  const channel = (row.channel || '').toLowerCase()
  if (channel === 'shopify') return true
  if (channel && channel !== 'shopify') return false
  return Boolean(row.shopifyOrderId)
}

const ORDER_STATUS_TABS = [
  { id: 'all', label: 'All' },
  { id: 'received', label: 'Received' },
  { id: 'allocated', label: 'Allocated' },
  { id: 'partially_fulfilled', label: 'Partial' },
  { id: 'fulfilled', label: 'Fulfilled' },
  { id: 'returns', label: 'Return' },
  { id: 'in_transit', label: 'In transit' },
  { id: 'on_hold', label: 'On hold' },
  { id: 'error', label: 'Error' },
]

const UNASSIGNED_WAREHOUSE = 'unassigned'
const ORDER_SEARCH_STATUSES = new Set(ORDER_STATUS_TABS.map((tab) => tab.id).filter((id) => id !== 'all'))

export default function OrdersPanel() {
  const navigate = useNavigate()
  const search = useSearch({ from: '/account/orders/' })
  const { company, currentUser, shopsById, setError } = useCompanyPortal()
  const warehouses = company?.warehouses || []
  const shops = company?.shops || []
  const canAssign = (currentUser?.role || 'member') !== 'warehouse'

  const initialWarehouse =
    search.warehouse === UNASSIGNED_WAREHOUSE || warehouses.some((w) => w.id === search.warehouse)
      ? search.warehouse!
      : 'all'
  const initialStatus =
    typeof search.status === 'string' && ORDER_SEARCH_STATUSES.has(search.status) ? search.status : 'all'

  const [orders, setOrders] = useState<ShopOrder[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(25)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [status, setStatus] = useState(initialStatus)
  const [shopId, setShopId] = useState('all')
  const [warehouseId, setWarehouseId] = useState(initialWarehouse)
  const [stats, setStats] = useState({ total: 0, allocated: 0, fulfilled: 0, error: 0 })

  function syncListSearch(next: { warehouse?: string; status?: string }) {
    const nextWarehouse = next.warehouse ?? warehouseId
    const nextStatus = next.status ?? status
    if (next.warehouse !== undefined) setWarehouseId(nextWarehouse)
    if (next.status !== undefined) setStatus(nextStatus)
    setPage(1)
    void navigate({
      to: '/account/orders/',
      search: {
        ...(nextWarehouse !== 'all' ? { warehouse: nextWarehouse } : {}),
        ...(nextStatus !== 'all' ? { status: nextStatus } : {}),
      },
      replace: true,
    })
  }

  function syncWarehouseSearch(next: string) {
    syncListSearch({ warehouse: next })
  }

  function openOrder(order: ShopOrder) {
    void navigate({ to: '/account/orders/$orderId', params: { orderId: order.id } })
  }

  useEffect(() => {
    const nextWarehouse =
      search.warehouse === UNASSIGNED_WAREHOUSE || warehouses.some((w) => w.id === search.warehouse)
        ? search.warehouse!
        : 'all'
    setWarehouseId((prev) => (prev === nextWarehouse ? prev : nextWarehouse))

    const nextStatus =
      typeof search.status === 'string' && ORDER_SEARCH_STATUSES.has(search.status) ? search.status : 'all'
    setStatus((prev) => (prev === nextStatus ? prev : nextStatus))
  }, [search.warehouse, search.status, warehouses])

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q.trim()), 300)
    return () => window.clearTimeout(t)
  }, [q])

  async function load() {
    setLoading(true)
    try {
      const result = await listCompanyOrders({
        q: debouncedQ || undefined,
        status: status === 'all' ? undefined : status,
        shopId: shopId === 'all' ? undefined : shopId,
        warehouseId: warehouseId === 'all' ? undefined : warehouseId,
        page,
        limit,
      })
      setOrders(result.items)
      setTotal(result.total)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load orders')
    } finally {
      setLoading(false)
    }
  }

  async function loadStats() {
    try {
      const [all, allocated, fulfilled, errorOrders] = await Promise.all([
        listCompanyOrders({ page: 1, limit: 1 }),
        listCompanyOrders({ status: 'allocated', page: 1, limit: 1 }),
        listCompanyOrders({ status: 'fulfilled', page: 1, limit: 1 }),
        listCompanyOrders({ status: 'error', page: 1, limit: 1 }),
      ])
      setStats({
        total: all.total,
        allocated: allocated.total,
        fulfilled: fulfilled.total,
        error: errorOrders.total,
      })
    } catch {
      /* keep previous snapshot */
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ, status, shopId, warehouseId, page, limit])

  useEffect(() => {
    void loadStats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const statusTabs = useMemo(
    () =>
      ORDER_STATUS_TABS.map((tab) =>
        tab.id === status ? { ...tab, count: total } : tab,
      ),
    [status, total],
  )

  const columns = useMemo<DataTableColumn<ShopOrder>[]>(
    () => [
      {
        key: 'order',
        header: 'Order',
        className: 'orders-col-order',
        sortable: true,
        sortValue: (row) => row.orderNumber,
        render: (row) => {
          const fromShopify = isShopifyOrder(row)
          const customer = row.customerName?.trim()
          return (
            <div className="ol-order">
              <div className="ol-order-id">
                {fromShopify ? (
                  <img
                    className="ol-shopify"
                    src="/shopify-logo-svgrepo-com.svg"
                    alt=""
                    title="Shopify"
                  />
                ) : null}
                <span className="demo-cell-primary">{row.orderNumber}</span>
              </div>
              {customer ? <div className="demo-cell-secondary">{customer}</div> : null}
            </div>
          )
        },
      },
      {
        key: 'store',
        header: 'Store',
        className: 'orders-col-store',
        render: (row) => {
          const domain = shopsById.get(row.shopId)?.shopDomain || '—'
          return (
            <span className="ol-store" title={domain}>
              {domain}
            </span>
          )
        },
      },
      {
        key: 'warehouse',
        header: 'Warehouse',
        className: 'orders-col-warehouse',
        render: (row) => {
          const assigned = warehouses.find((w) => w.id === row.warehouseId)?.name
          if (assigned) {
            return (
              <span className="ol-wh" title={assigned}>
                {assigned}
              </span>
            )
          }
          if (row.suggestedWarehouseId) {
            const suggested = warehouses.find((w) => w.id === row.suggestedWarehouseId)?.name || 'Suggested'
            return (
              <div>
                <span className="demo-cell-secondary">Unassigned</span>
                <div className="text-xs text-amber-800">Needs accept: {suggested}</div>
              </div>
            )
          }
          return row.status === 'error' ? (
            <span className="text-red-700">Unassigned</span>
          ) : (
            'Unassigned'
          )
        },
      },
      {
        key: 'status',
        header: 'Status',
        sortable: true,
        className: 'orders-col-status',
        sortValue: (row) => row.status,
        render: (row) => {
          const isAllocated = row.status === '940_ready' || row.status === '945_received'
          const needsAccept = Boolean(row.suggestedWarehouseId && !row.warehouseId)
          return (
            <StatusBadge
              status={needsAccept ? 'on_hold' : isAllocated ? 'allocated' : row.status}
              label={
                needsAccept
                  ? 'Needs accept'
                  : isAllocated
                    ? 'Allocated'
                    : row.status === 'partially_fulfilled'
                      ? 'Partial'
                      : undefined
              }
              variant={needsAccept ? 'warning' : row.status === 'error' ? 'danger' : undefined}
            />
          )
        },
      },
      {
        key: 'carrier',
        header: 'Carrier',
        className: 'orders-col-carrier',
        sortable: true,
        sortValue: (row) => row.carrier || '',
        render: (row) => <OrderCarrierChip carrier={row.carrier} />,
      },
      {
        key: 'ship',
        header: 'Shipment',
        className: 'orders-col-ship',
        sortable: true,
        sortValue: (row) => row.shipmentStatus || row.status,
        render: (row) => <OrderShipProgressCell order={row} />,
      },
      {
        key: 'sftp',
        header: 'SFTP',
        className: 'orders-col-sftp',
        render: (row) => <OrderSftpCell status={row.sftpStatus} hasWarehouse={Boolean(row.warehouseId)} />,
      },
      {
        key: 'actions',
        header: '',
        align: 'right',
        className: 'orders-col-actions',
        render: (row) => (
          <button
            type="button"
            className="ol-open"
            aria-label={`Open order ${row.orderNumber}`}
            onClick={(e) => {
              e.stopPropagation()
              openOrder(row)
            }}
          >
            <span>Open</span>
            <ChevronRight size={14} strokeWidth={2.4} aria-hidden />
          </button>
        ),
      },
    ],
    [shopsById, warehouses],
  )

  return (
    <div className="oj-page oj-skel orders-page analytics-anime">
      <header className="analytics-anime-hero orders-hero">
        <div className="analytics-anime-hero-mist" aria-hidden />
        <div className="analytics-anime-hero-orb analytics-anime-hero-orb--a" aria-hidden />
        <div className="analytics-anime-hero-orb analytics-anime-hero-orb--b" aria-hidden />

        <div className="analytics-anime-hero-copy">
          <div className="analytics-anime-crumb">
            <Package size={14} strokeWidth={2} aria-hidden />
            <span>Company</span>
            <span>/</span>
            <strong>Orders</strong>
          </div>
          <div className="analytics-anime-title-row">
            <h1>
              Orders in.
              <em> Work out.</em>
            </h1>
            <span className="analytics-anime-pill">
              <Activity size={12} strokeWidth={2.4} aria-hidden />
              {stats.total || total} orders
            </span>
          </div>
          <p>Track every order from receive to delivery — filter by stage, store, or warehouse.</p>
        </div>
      </header>

      <section className="orders-stats" aria-label="Orders snapshot">
        <button
          type="button"
          className={`orders-stat tone-all${status === 'all' && warehouseId === 'all' ? ' is-active' : ''}`}
          onClick={() => syncListSearch({ status: 'all', warehouse: 'all' })}
        >
          <div className="orders-stat-main">
            <div className="orders-stat-copy">
              <span className="orders-stat-label">All</span>
              <strong className="orders-stat-value">{stats.total.toLocaleString()}</strong>
            </div>
            <span className="orders-stat-icon" aria-hidden>
              <Package size={18} strokeWidth={2.1} />
            </span>
          </div>
          <span className="orders-stat-meta">
            <span className="orders-stat-pill">All stages</span>
            <span className="orders-stat-sub">Across pipeline</span>
          </span>
        </button>
        <button
          type="button"
          className={`orders-stat tone-allocated${status === 'allocated' ? ' is-active' : ''}`}
          onClick={() => syncListSearch({ status: 'allocated' })}
        >
          <div className="orders-stat-main">
            <div className="orders-stat-copy">
              <span className="orders-stat-label">Allocated</span>
              <strong className="orders-stat-value">{stats.allocated.toLocaleString()}</strong>
            </div>
            <span className="orders-stat-icon" aria-hidden>
              <Warehouse size={18} strokeWidth={2.1} />
            </span>
          </div>
          <span className="orders-stat-meta">
            <span className="orders-stat-pill">In queue</span>
            <span className="orders-stat-sub">Ready for warehouse</span>
          </span>
        </button>
        <button
          type="button"
          className={`orders-stat tone-fulfilled${status === 'fulfilled' ? ' is-active' : ''}`}
          onClick={() => syncListSearch({ status: 'fulfilled' })}
        >
          <div className="orders-stat-main">
            <div className="orders-stat-copy">
              <span className="orders-stat-label">Fulfilled</span>
              <strong className="orders-stat-value">{stats.fulfilled.toLocaleString()}</strong>
            </div>
            <span className="orders-stat-icon" aria-hidden>
              <CheckCircle2 size={18} strokeWidth={2.1} />
            </span>
          </div>
          <span className="orders-stat-meta">
            <span className="orders-stat-pill">Done</span>
            <span className="orders-stat-sub">Completed shipments</span>
          </span>
        </button>
        <button
          type="button"
          className={`orders-stat tone-error${status === 'error' ? ' is-active' : ''}`}
          onClick={() => syncListSearch({ status: 'error' })}
        >
          <div className="orders-stat-main">
            <div className="orders-stat-copy">
              <span className="orders-stat-label">Errors</span>
              <strong className="orders-stat-value">{stats.error.toLocaleString()}</strong>
            </div>
            <span className="orders-stat-icon" aria-hidden>
              <AlertTriangle size={18} strokeWidth={2.1} />
            </span>
          </div>
          <span className="orders-stat-meta">
            <span className="orders-stat-pill">Alert</span>
            <span className="orders-stat-sub">Needs attention</span>
          </span>
        </button>
      </section>

      <div className="orders-status-tabs">
        <StatusTabs
          activeId={status}
          onChange={(id) => syncListSearch({ status: id })}
          tabs={statusTabs}
        />
        <button
          type="button"
          className="orders-refresh-btn"
          onClick={() => {
            void load()
            void loadStats()
          }}
          disabled={loading}
          aria-label="Refresh orders"
          title="Refresh"
        >
          <RefreshCw size={16} strokeWidth={2.1} className={loading ? 'oj-skel-spin' : undefined} aria-hidden />
        </button>
      </div>

      {status === 'returns' ? (
        <p className="demo-muted text-sm mb-3">
          Showing orders with an open RMA.{' '}
          <button type="button" className="demo-link text-[var(--shell-accent-deep)]" onClick={() => void navigate({ to: '/account/returns', search: { returnId: undefined } })}>
            Open Returns
          </button>{' '}
          to authorize, receive, and restock.
        </p>
      ) : null}

      {warehouseId === UNASSIGNED_WAREHOUSE ? (
        <p className="demo-muted text-sm mb-3">
          Showing orders with no warehouse assigned. Assign a warehouse from the order detail page.
        </p>
      ) : null}

      <ListToolbar
        search={q}
        searchPlaceholder="Search order #, SKU, customer…"
        onSearchChange={(value) => {
          setQ(value)
          setPage(1)
        }}
        filters={[
          {
            key: 'shop',
            label: 'Store',
            value: shopId,
            options: [{ value: 'all', label: 'All stores' }, ...shops.map((s) => ({ value: s.id, label: s.shopDomain }))],
            onChange: (value) => {
              setShopId(value)
              setPage(1)
            },
          },
          {
            key: 'warehouse',
            label: 'Warehouse',
            value: warehouseId,
            options: [
              { value: 'all', label: 'All warehouses' },
              ...(canAssign ? [{ value: UNASSIGNED_WAREHOUSE, label: 'Unassigned' }] : []),
              ...warehouses.map((w) => ({ value: w.id, label: w.name })),
            ],
            onChange: syncWarehouseSearch,
          },
        ]}
        resultCount={total}
        resultLabel="orders"
        onClear={() => {
          setQ('')
          setStatus('all')
          setShopId('all')
          syncWarehouseSearch('all')
          setPage(1)
        }}
      />

      <div className="orders-table">
        <DataTable
          columns={columns}
          rows={orders}
          rowKey={(row) => row.id}
          loading={loading}
          emptyTitle={
            warehouseId === UNASSIGNED_WAREHOUSE
              ? 'No unassigned orders'
              : canAssign
                ? 'No orders yet'
                : 'No orders for your warehouse'
          }
          emptyMessage="Try adjusting search or filters."
          onRowClick={openOrder}
          rowClassName={(row) => {
            if (row.status === 'error') return 'is-attention'
            if (row.suggestedWarehouseId && !row.warehouseId) return 'is-needs-accept'
            return undefined
          }}
        />
      </div>

      <Pagination
        page={page}
        limit={limit}
        total={total}
        onPageChange={setPage}
        onLimitChange={(next) => {
          setLimit(next)
          setPage(1)
        }}
      />
    </div>
  )
}
