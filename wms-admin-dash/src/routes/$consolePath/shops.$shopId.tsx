import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useState, type FormEvent } from 'react'
import OrderShipActions from '../../components/OrderShipActions'
import PlatformShell from '../../components/PlatformShell'
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
  type Shop,
  type ShopOrder,
  type Uploader,
  type WebhookEvent,
} from '../../lib/api'
import { isPlatformAuthenticated } from '../../lib/auth'
import { ADMIN_CONSOLE_PATH } from '../../lib/config'

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
  const [uploaders, setUploaders] = useState<Uploader[]>([])
  const [events, setEvents] = useState<WebhookEvent[]>([])
  const [error, setError] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [sku, setSku] = useState('DEMO-SKU')

  async function refresh() {
    try {
      const [nextShop, nextOrders, nextUploaders, nextEvents] = await Promise.all([
        getShop(shopId),
        listShopOrders(shopId),
        listUploaders(shopId),
        listShopEvents(shopId),
      ])
      setShop(nextShop)
      setOrders(nextOrders)
      setUploaders(nextUploaders)
      setEvents(nextEvents)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load shop')
    }
  }

  useEffect(() => {
    void refresh()
  }, [shopId])

  async function onCreateUploader(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      await createUploader(shopId, { username, password })
      setUsername('')
      setPassword('')
      await refresh()
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

      <section className="island-shell mb-6 rounded-3xl p-6">
        <h2 className="demo-section-title mb-3">Create a demo order</h2>
        <form className="flex flex-wrap gap-3" onSubmit={onSimulate}>
          <input
            className="demo-input max-w-xs"
            placeholder="SKU"
            value={sku}
            onChange={(event) => setSku(event.target.value)}
            required
          />
          <button className="demo-button" type="submit">
            Simulate order
          </button>
        </form>
        <p className="demo-muted mt-3 text-sm">
          Writes a 940 immediately. Ship with tracking or upload a 945 to close the loop. Shopify
          fulfillment runs only when this domain is installed.
        </p>
      </section>

      <section className="island-shell mb-6 rounded-3xl p-6">
        <h2 className="demo-section-title mb-3">Warehouse uploader</h2>
        <form className="mb-4 flex flex-wrap gap-3" onSubmit={onCreateUploader}>
          <input
            className="demo-input max-w-xs"
            placeholder="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
          <input
            className="demo-input max-w-xs"
            placeholder="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={6}
            required
          />
          <button className="demo-button" type="submit">
            Create uploader
          </button>
        </form>
        <p className="demo-muted text-sm">
          Uploaders sign in at <code>/u/login</code>. Existing:{' '}
          {uploaders.map((item) => item.username).join(', ') || 'none'}
        </p>
      </section>

      <section className="demo-table-shell mb-6">
        <table className="demo-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Status</th>
              <th>940</th>
              <th>Ship</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={4}>No orders yet</td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr key={order.id}>
                  <td>
                    {order.orderNumber}
                    <div className="demo-muted text-xs">
                      {order.customerName}
                      {order.source === 'demo' ? ' · demo' : ''}
                    </div>
                    {order.lastError ? <div className="demo-muted text-xs">{order.lastError}</div> : null}
                  </td>
                  <td>
                    {order.status}
                    {order.trackingNumber ? (
                      <div className="demo-muted text-xs">
                        {order.carrier} {order.trackingNumber}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    {order.fileLink?.url ? (
                      <div className="flex flex-col gap-2">
                        <a href={order.fileLink.url} target="_blank" rel="noreferrer">
                          Download
                        </a>
                        <button
                          className="demo-button demo-button-secondary px-3 py-2 text-xs"
                          type="button"
                          onClick={() => {
                            const next = window.prompt('Optional password for this link')
                            if (next) {
                              void protectOrderLink(order.id, next).then(refresh)
                            }
                          }}
                        >
                          Password-protect
                        </button>
                        <button
                          className="demo-button demo-button-secondary px-3 py-2 text-xs"
                          type="button"
                          onClick={() => void emailOrderLink(order.id).then(() => refresh())}
                        >
                          Email link
                        </button>
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <OrderShipActions
                      order={order}
                      onDone={() => void refresh()}
                      onError={setError}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="island-shell rounded-3xl p-6">
        <h2 className="demo-section-title mb-3">Webhook events</h2>
        <div className="demo-table-shell">
          <table className="demo-table">
            <thead>
              <tr>
                <th>Topic</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td colSpan={3}>No Shopify webhooks yet</td>
                </tr>
              ) : (
                events.map((event) => (
                  <tr key={event.id}>
                    <td>
                      {event.topic}
                      {event.error ? <div className="demo-muted text-xs">{event.error}</div> : null}
                    </td>
                    <td>{event.status}</td>
                    <td>
                      <button
                        className="demo-button demo-button-secondary px-3 py-2 text-xs"
                        type="button"
                        onClick={() =>
                          void replayEvent(event.id)
                            .then(refresh)
                            .catch((err) => setError(err instanceof Error ? err.message : 'Replay failed'))
                        }
                      >
                        Replay
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </PlatformShell>
  )
}
