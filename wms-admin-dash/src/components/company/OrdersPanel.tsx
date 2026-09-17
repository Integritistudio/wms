import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import {
  DataTable,
  ListToolbar,
  PageHeader,
  Pagination,
  StatusBadge,
  StatusTabs,
  TruncatedCopyId,
  type DataTableColumn,
} from '../ui'
import { useCompanyPortal } from './CompanyPortalContext'
import { listCompanyOrders, type ShopOrder } from '../../lib/api'

const ORDER_STATUS_TABS = [
  { id: 'all', label: 'All' },
  { id: 'received', label: 'Received' },
  { id: 'allocated', label: 'Allocated' },
  { id: 'partially_fulfilled', label: 'Partial' },
  { id: 'fulfilled', label: 'Fulfilled' },
  { id: 'returns', label: 'Return' },
  { id: 'error', label: 'Error' },
]

const UNASSIGNED_WAREHOUSE = 'unassigned'

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

  const [orders, setOrders] = useState<ShopOrder[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(25)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [status, setStatus] = useState('all')
  const [shopId, setShopId] = useState('all')
  const [warehouseId, setWarehouseId] = useState(initialWarehouse)

  function syncWarehouseSearch(next: string) {
    setWarehouseId(next)
    setPage(1)
    void navigate({
      to: '/account/orders/',
      search: next === 'all' ? {} : { warehouse: next },
      replace: true,
    })
  }

  function openOrder(order: ShopOrder) {
    void navigate({ to: '/account/orders/$orderId', params: { orderId: order.id } })
  }

  useEffect(() => {
    const next =
      search.warehouse === UNASSIGNED_WAREHOUSE || warehouses.some((w) => w.id === search.warehouse)
        ? search.warehouse!
        : 'all'
    setWarehouseId((prev) => (prev === next ? prev : next))
  }, [search.warehouse, warehouses])

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

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ, status, shopId, warehouseId, page, limit])

  const columns = useMemo<DataTableColumn<ShopOrder>[]>(
    () => [
      {
        key: 'order',
        header: 'Order',
        sortable: true,
        sortValue: (row) => row.orderNumber,
        render: (row) => (
          <div>
            <div className="demo-cell-primary">{row.orderNumber}</div>
            <div className="demo-cell-secondary">{row.customerName || '—'}</div>
          </div>
        ),
      },
      {
        key: 'store',
        header: 'Store',
        render: (row) => shopsById.get(row.shopId)?.shopDomain || '—',
      },
      {
        key: 'warehouse',
        header: 'Warehouse',
        render: (row) => {
          const assigned = warehouses.find((w) => w.id === row.warehouseId)?.name
          if (assigned) return assigned
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
            <div className="orders-status-cell">
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
              {row.trackingNumber ? (
                <div className="demo-cell-secondary orders-tracking-id">
                  <TruncatedCopyId
                    value={row.trackingNumber}
                    prefix={row.carrier ? `${row.carrier} ` : ''}
                    maxLen={14}
                  />
                </div>
              ) : null}
            </div>
          )
        },
      },
      {
        key: 'sftp',
        header: 'SFTP',
        render: (row) =>
          row.sftpStatus && row.sftpStatus !== 'skipped' ? (
            <StatusBadge status={row.sftpStatus} label={`SFTP ${row.sftpStatus}`} />
          ) : (
            <span className="demo-cell-secondary">{row.warehouseId ? 'Skipped' : '—'}</span>
          ),
      },
      {
        key: 'actions',
        header: 'Actions',
        align: 'right',
        render: (row) => (
          <button
            type="button"
            className="demo-btn demo-btn-sm"
            onClick={(e) => {
              e.stopPropagation()
              openOrder(row)
            }}
          >
            View flow
          </button>
        ),
      },
    ],
    [shopsById, warehouses],
  )

  return (
    <div>
      <PageHeader
        title="Orders"
        description="Filter by store, warehouse, or status. Open an order to see its shipment flow diagram."
        count={total}
        actions={
          <button type="button" className="demo-btn demo-btn-sm" onClick={() => void load()}>
            Refresh
          </button>
        }
      />

      <StatusTabs
        activeId={status}
        onChange={(id) => {
          setStatus(id)
          setPage(1)
        }}
        tabs={ORDER_STATUS_TABS}
      />

      {status === 'returns' ? (
        <p className="demo-muted text-sm mb-3">
          Showing orders with an open RMA.{' '}
          <button type="button" className="demo-link text-[var(--shell-accent-deep)]" onClick={() => void navigate({ to: '/account/returns' })}>
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
