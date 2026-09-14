import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import AppShell from '../../components/AppShell'
import AppearanceMenu from '../../components/AppearanceMenu'
import OrderShipActions from '../../components/OrderShipActions'
import {
  Alert,
  DataTable,
  ListToolbar,
  PageHeader,
  PageSection,
  Pagination,
  StatusBadge,
  TruncatedCopyId,
} from '../../components/ui'
import { listUploaderOrders, type ShopOrder } from '../../lib/api'
import { clearUploaderSession, getUploaderSession, isUploaderAuthenticated } from '../../lib/auth'

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'received', label: 'Received' },
  { value: 'allocated', label: 'Allocated' },
  { value: 'partially_fulfilled', label: 'Partial' },
  { value: 'fulfilled', label: 'Fulfilled' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'error', label: 'Error' },
]

export const Route = createFileRoute('/u/')({
  ssr: false,
  beforeLoad: () => {
    if (!isUploaderAuthenticated()) {
      throw redirect({ to: '/u/login' })
    }
  },
  component: UploaderHomePage,
})

function UploaderHomePage() {
  const navigate = useNavigate()
  const user = getUploaderSession()?.user
  const [orders, setOrders] = useState<ShopOrder[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(25)
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [status, setStatus] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q.trim()), 300)
    return () => window.clearTimeout(t)
  }, [q])

  async function refresh() {
    setLoading(true)
    try {
      const result = await listUploaderOrders({
        q: debouncedQ || undefined,
        status: status === 'all' ? undefined : status,
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
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ, status, page, limit])

  return (
    <AppShell
      workspace="Warehouse"
      workspaceKicker="Uploader"
      userName={user?.username || 'Uploader'}
      userMeta="945 uploads"
      title="Orders"
      subtitle="Upload a 945 or enter tracking to close the loop."
      nav={[{ id: 'uploads', label: 'Orders', hint: 'Assigned shops' }]}
      activeId="uploads"
      topbarActions={<AppearanceMenu />}
      onNav={() => undefined}
      onSignOut={() => {
        clearUploaderSession()
        void navigate({ to: '/u/login' })
      }}
    >
      {error ? (
        <Alert tone="danger" className="mb-4" onDismiss={() => setError('')}>
          {error}
        </Alert>
      ) : null}

      <PageHeader
        title="Assigned Orders"
        description="Upload a 945 or enter tracking to close the loop."
        count={total}
        actions={
          <button type="button" className="demo-btn demo-btn-sm" onClick={() => void refresh()}>
            Refresh
          </button>
        }
      />

      <PageSection title="Orders" description="Orders assigned to your uploader account.">
        <ListToolbar
          search={q}
          searchPlaceholder="Search order #, SKU, customer…"
          onSearchChange={(value) => {
            setQ(value)
            setPage(1)
          }}
          filters={[
            {
              key: 'status',
              label: 'Status',
              value: status,
              options: STATUS_OPTIONS,
              onChange: (value) => {
                setStatus(value)
                setPage(1)
              },
            },
          ]}
          resultCount={total}
          resultLabel="orders"
          onClear={() => {
            setQ('')
            setStatus('all')
            setPage(1)
          }}
        />
        <DataTable
          columns={[
            {
              key: 'order',
              header: 'Order',
              render: (order) => <span className="demo-cell-primary">{order.orderNumber}</span>,
            },
            {
              key: 'status',
              header: 'Status',
              render: (order) => <StatusBadge status={order.status} />,
            },
            {
              key: 'tracking',
              header: 'Tracking',
              render: (order) =>
                order.trackingNumber ? <TruncatedCopyId value={order.trackingNumber} maxLen={16} /> : '—',
            },
            {
              key: 'ship',
              header: 'Ship',
              align: 'right',
              render: (order) => (
                <OrderShipActions
                  order={order}
                  actor="uploader"
                  onDone={() => void refresh()}
                  onError={setError}
                />
              ),
            },
          ]}
          rows={orders}
          rowKey={(order) => order.id}
          loading={loading}
          emptyTitle="No assigned orders"
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
      </PageSection>
    </AppShell>
  )
}
