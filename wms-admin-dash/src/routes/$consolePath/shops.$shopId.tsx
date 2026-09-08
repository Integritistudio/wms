import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useState, type FormEvent } from 'react'
import OrderShipActions from '../../components/OrderShipActions'
import PlatformShell from '../../components/PlatformShell'
import {
  DataTable,
  FormField,
  ListToolbar,
  PageHeader,
  PageSection,
  Pagination,
  StatusBadge,
} from '../../components/ui'
import {
  createUploader,
  emailOrderLink,
  getShop,
  listShopEvents,
  listShopOrders,
  listUploaders,
  protectOrderLink,
  replayEvent,
  simulateOrder,
  testShopConnection,
  type Shop,
  type ShopOrder,
  type Uploader,
  type WebhookEvent,
} from '../../lib/api'
import { isPlatformAuthenticated } from '../../lib/auth'
import { ADMIN_CONSOLE_PATH } from '../../lib/config'

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'received', label: 'Received' },
  { value: 'allocated', label: 'Allocated' },
  { value: 'partially_fulfilled', label: 'Partial' },
  { value: 'fulfilled', label: 'Fulfilled' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'error', label: 'Error' },
]

export const Route = createFileRoute('/$consolePath/shops/$shopId')({
  ssr: false,
  beforeLoad: ({ params }) => {
    if (!isPlatformAuthenticated()) {
      throw redirect({ to: '/$consolePath/login', params: { consolePath: params.consolePath } })
    }
  },
  component: ShopDetailPage,
})

function ShopDetailPage() {
  const { shopId } = Route.useParams()
  const [shop, setShop] = useState<Shop | null>(null)
  const [orders, setOrders] = useState<ShopOrder[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(25)
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [status, setStatus] = useState('all')
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [uploaders, setUploaders] = useState<Uploader[]>([])
  const [events, setEvents] = useState<WebhookEvent[]>([])
  const [error, setError] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [sku, setSku] = useState('DEMO-SKU')
  const [testingShopify, setTestingShopify] = useState(false)
  const [shopifyOk, setShopifyOk] = useState('')

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q.trim()), 300)
    return () => window.clearTimeout(t)
  }, [q])

  async function refreshMeta() {
    try {
      const [nextShop, nextUploaders, nextEvents] = await Promise.all([
        getShop(shopId),
        listUploaders(shopId),
        listShopEvents(shopId),
      ])
      setShop(nextShop)
      setUploaders(nextUploaders)
      setEvents(nextEvents)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load shop')
    }
  }

  async function refreshOrders() {
    setOrdersLoading(true)
    try {
      const result = await listShopOrders(shopId, {
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
      setOrdersLoading(false)
    }
  }

  async function refresh() {
    await Promise.all([refreshMeta(), refreshOrders()])
  }

  useEffect(() => {
    void refreshMeta()
  }, [shopId])

  useEffect(() => {
    void refreshOrders()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId, debouncedQ, status, page, limit])

  async function onCreateUploader(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      await createUploader(shopId, { username, password })
      setUsername('')
      setPassword('')
      await refreshMeta()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create uploader')
    }
  }

  async function onSimulate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      await simulateOrder(shopId, { sku, quantity: 1, customerName: 'Demo Customer' })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create demo order')
    }
  }

  async function onTestShopify() {
    setTestingShopify(true)
    setShopifyOk('')
    try {
      const result = await testShopConnection(shopId)
      setShopifyOk(`Connected to ${result.shopName} (${result.myshopifyDomain})`)
      setError('')
    } catch (err) {
      setShopifyOk('')
      setError(err instanceof Error ? err.message : 'Shopify connection failed')
    } finally {
      setTestingShopify(false)
    }
  }

  return (
    <PlatformShell
      title={shop?.shopDomain || 'Shop'}
      subtitle={`${shop?.enabled ? 'Enabled' : 'Disabled'} · ${shop?.installed ? 'Installed' : 'Not installed'}${shop?.installed ? '' : ' · Demo orders still run the 940 → 945 loop locally'}`}
    >
      {shop?.companyId ? (
        <p className="demo-muted mb-4 text-sm">
          <Link
            to="/$consolePath/companies/$companyId"
            params={{ consolePath: ADMIN_CONSOLE_PATH, companyId: shop.companyId }}
          >
            {shop.companyName || 'Company'}
          </Link>
          {' / '}
          {shop.shopDomain}
        </p>
      ) : null}
      {error ? <p className="demo-alert-danger demo-alert mb-4">{error}</p> : null}
      {shopifyOk ? <p className="demo-alert mb-4 text-sm">{shopifyOk}</p> : null}

      <PageHeader
        title={shop?.shopDomain || 'Shop'}
        description={`${shop?.enabled ? 'Enabled' : 'Disabled'} · ${shop?.installed ? 'Installed' : 'Not installed'}`}
        count={total}
        actions={
          <div className="page-header-actions">
            <button type="button" className="demo-btn demo-btn-sm" onClick={() => void onTestShopify()} disabled={testingShopify || !shop?.installed}>
              {testingShopify ? 'Testing…' : 'Test Shopify'}
            </button>
            {shop?.reconnectUrl ? (
              <a className="demo-btn demo-btn-sm no-underline" href={shop.reconnectUrl} target="_blank" rel="noreferrer">
                Reconnect
              </a>
            ) : null}
            <button type="button" className="demo-btn demo-btn-sm" onClick={() => void refresh()}>
              Refresh
            </button>
          </div>
        }
      />

      <PageSection title="Create a demo order" description="Writes a 940 immediately. Ship with tracking or upload a 945 to close the loop.">
        <form className="flex flex-wrap gap-3 items-end" onSubmit={onSimulate}>
          <FormField label="SKU">
            <input
              className="demo-input max-w-xs"
              value={sku}
              onChange={(event) => setSku(event.target.value)}
              required
            />
          </FormField>
          <button className="demo-button" type="submit">
            Simulate order
          </button>
        </form>
      </PageSection>

      <PageSection title="Warehouse uploader" description="Uploaders sign in at /u/login.">
        <form className="mb-4 flex flex-wrap gap-3 items-end" onSubmit={onCreateUploader}>
          <FormField label="Username">
            <input
              className="demo-input max-w-xs"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </FormField>
          <FormField label="Password">
            <input
              className="demo-input max-w-xs"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={6}
              required
            />
          </FormField>
          <button className="demo-button" type="submit">
            Create uploader
          </button>
        </form>
        <p className="demo-muted text-sm m-0">
          Existing: {uploaders.map((item) => item.username).join(', ') || 'none'}
        </p>
      </PageSection>

      <PageSection title="Orders" description="940 downloads, tracking, and fulfillment actions.">
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
              render: (order) => (
                <div>
                  <div className="demo-cell-primary">{order.orderNumber}</div>
                  <div className="demo-cell-secondary">{order.customerName}{order.source === 'demo' ? ' · demo' : ''}</div>
                  {order.lastError ? <div className="demo-cell-secondary">{order.lastError}</div> : null}
                </div>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (order) => (
                <div>
                  <StatusBadge status={order.status} />
                  {order.trackingNumber ? <div className="demo-cell-secondary">{order.carrier} {order.trackingNumber}</div> : null}
                </div>
              ),
            },
            {
              key: '940',
              header: '940',
              render: (order) => order.fileLink?.url ? (
                <div className="demo-action-group">
                  <a className="demo-btn demo-btn-sm no-underline" href={order.fileLink.url} target="_blank" rel="noreferrer">Download</a>
                  <button className="demo-btn demo-btn-sm demo-btn-ghost" type="button" onClick={() => {
                    const next = window.prompt('Optional password for this link')
                    if (next) void protectOrderLink(order.id, next).then(() => void refreshOrders())
                  }}>Protect</button>
                  <button className="demo-btn demo-btn-sm demo-btn-ghost" type="button" onClick={() => void emailOrderLink(order.id).then(() => void refreshOrders())}>Email</button>
                </div>
              ) : '—',
            },
            {
              key: 'ship',
              header: 'Ship',
              align: 'right',
              render: (order) => (
                <OrderShipActions order={order} onDone={() => void refreshOrders()} onError={setError} />
              ),
            },
          ]}
          rows={orders}
          rowKey={(order) => order.id}
          loading={ordersLoading}
          emptyTitle="No orders yet"
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

      <PageSection title="Webhook Events" description="Replay failed Shopify webhook processing.">
        <DataTable
          columns={[
            {
              key: 'topic',
              header: 'Topic',
              render: (event) => (
                <div>
                  <div className="demo-cell-primary">{event.topic}</div>
                  {event.error ? <div className="demo-cell-secondary">{event.error}</div> : null}
                </div>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (event) => <StatusBadge status={event.status} />,
            },
            {
              key: 'actions',
              header: 'Actions',
              align: 'right',
              render: (event) => (
                <button
                  className="demo-btn demo-btn-sm"
                  type="button"
                  onClick={() =>
                    void replayEvent(event.id)
                      .then(refresh)
                      .catch((err) => setError(err instanceof Error ? err.message : 'Replay failed'))
                  }
                >
                  Replay
                </button>
              ),
            },
          ]}
          rows={events}
          rowKey={(event) => event.id}
          emptyTitle="No Shopify webhooks yet"
        />
      </PageSection>
    </PlatformShell>
  )
}
