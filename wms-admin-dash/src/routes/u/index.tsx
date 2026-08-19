import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import AppShell from '../../components/AppShell'
import OrderShipActions from '../../components/OrderShipActions'
import { listUploaderOrders, type ShopOrder } from '../../lib/api'
import { clearUploaderSession, getUploaderSession, isUploaderAuthenticated } from '../../lib/auth'

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
  const [error, setError] = useState('')

  async function refresh() {
    try {
      setOrders(await listUploaderOrders())
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load orders')
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

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
      onNav={() => undefined}
      onSignOut={() => {
        clearUploaderSession()
        void navigate({ to: '/u/login' })
      }}
    >
      {error ? <p className="demo-alert-danger demo-alert mb-4">{error}</p> : null}

      <section className="demo-table-shell">
        <table className="demo-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Status</th>
              <th>Tracking</th>
              <th>Ship</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={4}>No assigned orders</td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr key={order.id}>
                  <td>{order.orderNumber}</td>
                  <td>{order.status}</td>
                  <td>{order.trackingNumber || '—'}</td>
                  <td>
                    <OrderShipActions
                      order={order}
                      actor="uploader"
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
    </AppShell>
  )
}
