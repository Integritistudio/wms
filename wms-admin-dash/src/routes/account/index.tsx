import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import AppShell from '../../components/AppShell'
import OrderShipActions from '../../components/OrderShipActions'
import {
  addCompanyWarehouse,
  assignCompanyOrderWarehouse,
  createCompanyUser,
  createSftpConnection,
  getCompanyMe,
  inviteCompanyUser,
  listCompanyOrders,
  listCompanyUsers,
  resetCompanyUser,
  testSftpConnection,
  updateCompanyWarehouse,
  updateSftpConnection,
  type Company,
  type CompanyMember,
  type ShopOrder,
  type SftpConnection,
  type Warehouse,
} from '../../lib/api'
import { clearCompanySession, getCompanySession, isCompanyAuthenticated } from '../../lib/auth'

export const Route = createFileRoute('/account/')({
  ssr: false,
  beforeLoad: () => {
    if (!isCompanyAuthenticated()) {
      throw redirect({ to: '/account/login' })
    }
  },
  component: CompanyHomePage,
})

function CompanyHomePage() {
  const navigate = useNavigate()
  const session = getCompanySession()
  const [company, setCompany] = useState<Company | null>(null)
  const [currentUser, setCurrentUser] = useState<CompanyMember | null>(null)
  const [orders, setOrders] = useState<ShopOrder[]>([])
  const [users, setUsers] = useState<CompanyMember[]>([])
  const [tab, setTab] = useState<'orders' | 'team' | 'warehouses' | 'sftp'>('orders')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')

  const isRoot = (currentUser?.role || session?.user.role) === 'root'
  const shopsById = useMemo(() => {
    return new Map((company?.shops || []).map((shop) => [shop.id, shop]))
  }, [company])

  async function refresh() {
    try {
      const [sessionData, nextOrders] = await Promise.all([getCompanyMe(), listCompanyOrders()])
      setCompany(sessionData.company)
      setCurrentUser(sessionData.user)
      setOrders(nextOrders)
      if (sessionData.user.role === 'root') {
        setUsers(await listCompanyUsers())
      }
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load account')
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  function logout() {
    clearCompanySession()
    void navigate({ to: '/account/login' })
  }

  const role = currentUser?.role || 'member'
  const roleLabel = role === 'root' ? 'User' : role === 'warehouse' ? 'Warehouse' : 'Member'
  const pageCopy = {
    orders: { title: 'Orders', subtitle: '940 files, tracking, and 945 uploads' },
    team: { title: 'Users', subtitle: 'Invite company and warehouse users' },
    warehouses: { title: 'Warehouses', subtitle: 'Locations assigned to Shopify stores' },
    sftp: { title: 'SFTP', subtitle: 'Named connections warehouses can share or keep separate' },
  }[tab]
  const nav = [
    { id: 'orders', label: 'Orders', hint: '940s and shipments' },
    ...(isRoot
      ? [
          { id: 'team', label: 'Users', hint: 'Invites and access' },
          { id: 'warehouses', label: 'Warehouses' },
          { id: 'sftp', label: 'SFTP', hint: 'Push 940 files' },
        ]
      : []),
  ]

  return (
    <AppShell
      workspace={company?.name || session?.user.companyName || 'Company'}
      workspaceKicker="Company portal"
      userName={currentUser?.name || session?.user.name || session?.user.email || 'User'}
      userMeta={`${currentUser?.email || session?.user.email || ''} · ${roleLabel}`}
      title={pageCopy?.title || 'Orders'}
      subtitle={pageCopy?.subtitle}
      nav={nav}
      activeId={tab}
      onNav={(id) => setTab(id as typeof tab)}
      onSignOut={logout}
    >
      {error ? <p className="demo-alert-danger demo-alert mb-4">{error}</p> : null}
      {notice ? <p className="demo-muted mb-4">{notice}</p> : null}
      {inviteUrl ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <input className="demo-input min-w-[18rem] flex-1" readOnly value={inviteUrl} />
          <button
            className="demo-button demo-button-secondary"
            type="button"
            onClick={() => void navigator.clipboard.writeText(inviteUrl)}
          >
            Copy link
          </button>
        </div>
      ) : null}

      {tab === 'orders' ? (
        <OrdersPanel
          orders={orders}
          shopsById={shopsById}
          warehouses={company?.warehouses || []}
          canAssign={role !== 'warehouse'}
          onDone={() => void refresh()}
          onError={setError}
        />
      ) : null}
      {tab === 'team' && isRoot ? (
        <TeamPanel
          users={users}
          warehouses={company?.warehouses || []}
          onNotice={setNotice}
          onInviteUrl={setInviteUrl}
          onError={setError}
          onDone={() => void refresh()}
        />
      ) : null}
      {tab === 'warehouses' && isRoot ? (
        <WarehousePanel
          warehouses={company?.warehouses || []}
          connections={company?.sftpConnections || []}
          onError={setError}
          onDone={() => void refresh()}
        />
      ) : null}
      {tab === 'sftp' && isRoot ? (
        <SftpPanel
          connections={company?.sftpConnections || []}
          onError={setError}
          onNotice={setNotice}
          onDone={() => void refresh()}
        />
      ) : null}
    </AppShell>
  )
}

function OrdersPanel({
  orders,
  shopsById,
  warehouses,
  canAssign,
  onDone,
  onError,
}: {
  orders: ShopOrder[]
  shopsById: Map<string, { shopDomain: string; warehouseId: string | null }>
  warehouses: Warehouse[]
  canAssign: boolean
  onDone: () => void
  onError: (message: string) => void
}) {
  const warehousesById = useMemo(() => new Map(warehouses.map((item) => [item.id, item])), [warehouses])

  return (
    <section className="demo-table-shell">
      <table className="demo-table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Store</th>
            <th>Warehouse</th>
            <th>Status</th>
            <th>940</th>
            <th>945</th>
          </tr>
        </thead>
        <tbody>
          {orders.length === 0 ? (
            <tr>
              <td colSpan={6}>{canAssign ? 'No orders yet' : 'No orders assigned to your warehouse'}</td>
            </tr>
          ) : (
            orders.map((order) => (
              <tr key={order.id}>
                <td>
                  {order.orderNumber}
                  <div className="demo-muted text-xs">{order.customerName}</div>
                </td>
                <td>{shopsById.get(order.shopId)?.shopDomain || '—'}</td>
                <td>
                  {canAssign ? (
                    <select
                      className="demo-input min-w-[10rem]"
                      value={order.warehouseId || ''}
                      onChange={(event) => {
                        const warehouseId = event.target.value || null
                        void assignCompanyOrderWarehouse(order.id, warehouseId)
                          .then(onDone)
                          .catch((err) => onError(err instanceof Error ? err.message : 'Unable to assign warehouse'))
                      }}
                    >
                      <option value="">Unassigned</option>
                      {warehouses.map((warehouse) => (
                        <option key={warehouse.id} value={warehouse.id}>
                          {warehouse.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    warehousesById.get(order.warehouseId || '')?.name || '—'
                  )}
                </td>
                <td>
                  {order.status}
                  {order.sftpStatus && order.sftpStatus !== 'skipped' ? (
                    <div className="demo-muted text-xs">SFTP {order.sftpStatus}</div>
                  ) : order.warehouseId ? (
                    <div className="demo-muted text-xs">SFTP skipped</div>
                  ) : (
                    <div className="demo-muted text-xs">Assign a warehouse to send the 940</div>
                  )}
                  {order.sftpError ? <div className="demo-muted text-xs">{order.sftpError}</div> : null}
                  {order.trackingNumber ? (
                    <div className="demo-muted text-xs">
                      {order.carrier} {order.trackingNumber}
                    </div>
                  ) : null}
                </td>
                <td>
                  {order.fileLink?.url ? (
                    <a href={order.fileLink.url} target="_blank" rel="noreferrer">
                      Download 940
                    </a>
                  ) : (
                    '—'
                  )}
                  {canAssign && order.warehouseId ? (
                    <div>
                      <button
                        className="demo-button demo-button-secondary mt-2 px-3 py-2 text-xs"
                        type="button"
                        onClick={() =>
                          void assignCompanyOrderWarehouse(order.id, order.warehouseId || null)
                            .then(onDone)
                            .catch((err) => onError(err instanceof Error ? err.message : 'Unable to send 940'))
                        }
                      >
                        Send 940
                      </button>
                    </div>
                  ) : null}
                </td>
                <td>
                  <OrderShipActions order={order} actor="company" onDone={onDone} onError={onError} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  )
}

function TeamPanel({
  users,
  warehouses,
  onNotice,
  onInviteUrl,
  onError,
  onDone,
}: {
  users: CompanyMember[]
  warehouses: { id: string; name: string }[]
  onNotice: (value: string) => void
  onInviteUrl: (value: string) => void
  onError: (value: string) => void
  onDone: () => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'member' | 'warehouse'>('member')
  const [warehouseIds, setWarehouseIds] = useState<string[]>([])

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      const result = await createCompanyUser({
        name,
        email,
        role,
        warehouseIds: role === 'warehouse' ? warehouseIds : [],
      })
      setName('')
      setEmail('')
      setWarehouseIds([])
      onInviteUrl(result.inviteUrl || '')
      onNotice(result.inviteSent ? `Invite emailed to ${email}` : 'Invite email was not sent. Copy the link.')
      onDone()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to add user')
    }
  }

  return (
    <section className="island-shell rounded-3xl p-6">
      <h2 className="demo-section-title mb-3">Add a user</h2>
      <form className="mb-6 grid gap-3 md:grid-cols-2" onSubmit={onCreate}>
        <input className="demo-input" placeholder="Name" value={name} onChange={(event) => setName(event.target.value)} required />
        <input
          className="demo-input"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <select className="demo-input" value={role} onChange={(event) => setRole(event.target.value as 'member' | 'warehouse')}>
          <option value="member">Company user</option>
          <option value="warehouse">Warehouse user</option>
        </select>
        {role === 'warehouse' ? (
          <select
            className="demo-input"
            multiple
            value={warehouseIds}
            onChange={(event) =>
              setWarehouseIds(Array.from(event.target.selectedOptions).map((option) => option.value))
            }
            required
          >
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name}
              </option>
            ))}
          </select>
        ) : (
          <p className="demo-muted self-center text-sm">Can view all orders and upload 945s.</p>
        )}
        <div className="md:col-span-2">
          <button className="demo-button" type="submit">
            Invite user
          </button>
        </div>
      </form>
      <div className="demo-table-shell">
        <table className="demo-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>
                  {user.name}
                  <div className="demo-muted text-xs">{user.email}</div>
                </td>
                <td>{user.role}</td>
                <td>{user.status}</td>
                <td>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="demo-button demo-button-secondary px-3 py-2 text-xs"
                      type="button"
                      onClick={() =>
                        void inviteCompanyUser(user.id)
                          .then((result) => {
                            onInviteUrl(result.inviteUrl || '')
                            onNotice(result.inviteSent ? 'Invite sent' : 'Copy the invite link')
                          })
                          .catch((err) => onError(err instanceof Error ? err.message : 'Unable to invite'))
                      }
                    >
                      Resend invite
                    </button>
                    <button
                      className="demo-button demo-button-secondary px-3 py-2 text-xs"
                      type="button"
                      onClick={() =>
                        void resetCompanyUser(user.id)
                          .then((result) => {
                            onInviteUrl(result.resetUrl || '')
                            onNotice(result.sent ? 'Reset email sent' : 'Copy the reset link')
                          })
                          .catch((err) => onError(err instanceof Error ? err.message : 'Unable to reset'))
                      }
                    >
                      Password reset
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function WarehousePanel({
  warehouses,
  connections,
  onError,
  onDone,
}: {
  warehouses: Warehouse[]
  connections: SftpConnection[]
  onError: (value: string) => void
  onDone: () => void
}) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [address, setAddress] = useState('')
  const [sftpConnectionId, setSftpConnectionId] = useState('')

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      await addCompanyWarehouse({
        name,
        code,
        address,
        sftpConnectionId: sftpConnectionId || undefined,
      })
      setName('')
      setCode('')
      setAddress('')
      setSftpConnectionId('')
      onDone()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to add warehouse')
    }
  }

  return (
    <section className="island-shell rounded-3xl p-6">
      <h2 className="demo-section-title mb-3">Add a warehouse</h2>
      <p className="demo-muted mb-4 text-sm">
        Several warehouses can share one SFTP connection, or each can use its own.
      </p>
      <form className="mb-6 grid gap-3 md:grid-cols-2" onSubmit={onCreate}>
        <input className="demo-input" placeholder="Name" value={name} onChange={(event) => setName(event.target.value)} required />
        <input className="demo-input" placeholder="Code" value={code} onChange={(event) => setCode(event.target.value)} />
        <input className="demo-input" placeholder="Address" value={address} onChange={(event) => setAddress(event.target.value)} />
        <select
          className="demo-input"
          value={sftpConnectionId}
          onChange={(event) => setSftpConnectionId(event.target.value)}
        >
          <option value="">No SFTP yet</option>
          {connections.map((connection) => (
            <option key={connection.id} value={connection.id}>
              {connection.name}
              {connection.enabled ? '' : ' (off)'}
            </option>
          ))}
        </select>
        <div className="md:col-span-2">
          <button className="demo-button" type="submit">
            Add warehouse
          </button>
        </div>
      </form>
      <div className="demo-table-shell">
        <table className="demo-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Code</th>
              <th>Address</th>
              <th>SFTP</th>
            </tr>
          </thead>
          <tbody>
            {warehouses.length === 0 ? (
              <tr>
                <td colSpan={4}>None yet</td>
              </tr>
            ) : (
              warehouses.map((warehouse) => (
                <tr key={warehouse.id}>
                  <td>{warehouse.name}</td>
                  <td>{warehouse.code || '—'}</td>
                  <td>{warehouse.address || '—'}</td>
                  <td>
                    <select
                      className="demo-input min-w-[10rem]"
                      value={warehouse.sftpConnectionId || ''}
                      onChange={(event) =>
                        void updateCompanyWarehouse(warehouse.id, {
                          sftpConnectionId: event.target.value || null,
                        })
                          .then(onDone)
                          .catch((err) =>
                            onError(err instanceof Error ? err.message : 'Unable to update warehouse'),
                          )
                      }
                    >
                      <option value="">None</option>
                      {connections.map((connection) => (
                        <option key={connection.id} value={connection.id}>
                          {connection.name}
                          {connection.enabled ? '' : ' (off)'}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function SftpPanel({
  connections,
  onError,
  onNotice,
  onDone,
}: {
  connections: SftpConnection[]
  onError: (value: string) => void
  onNotice: (value: string) => void
  onDone: () => void
}) {
  const [name, setName] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [host, setHost] = useState('')
  const [port, setPort] = useState('22')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remotePath, setRemotePath] = useState('/inbound/940')

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      await createSftpConnection({
        name,
        enabled,
        host,
        port: Number(port || 22),
        username,
        password: password || undefined,
        remotePath,
      })
      setName('')
      setHost('')
      setUsername('')
      setPassword('')
      setRemotePath('/inbound/940')
      setEnabled(true)
      onNotice('SFTP connection saved. Attach it to one or more warehouses.')
      onDone()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to save SFTP')
    }
  }

  return (
    <div className="grid gap-6">
      <section className="island-shell rounded-3xl p-6">
        <h2 className="demo-section-title mb-3">Add an SFTP connection</h2>
        <p className="demo-muted mb-4 text-sm">
          Warehouses pick a connection. When you assign an order to a warehouse and sending is on,
          the 940 is uploaded automatically.
        </p>
        <form className="grid gap-3 md:grid-cols-2" onSubmit={onCreate}>
          <input
            className="demo-input"
            placeholder="Name (e.g. Main 3PL)"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
          <label className="demo-muted flex items-center gap-2 text-sm">
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
            Send 940s over this connection
          </label>
          <input className="demo-input" placeholder="Host" value={host} onChange={(event) => setHost(event.target.value)} required />
          <input className="demo-input" placeholder="Port" value={port} onChange={(event) => setPort(event.target.value)} />
          <input
            className="demo-input"
            placeholder="Username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
          <input
            className="demo-input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <input
            className="demo-input md:col-span-2"
            placeholder="Remote path"
            value={remotePath}
            onChange={(event) => setRemotePath(event.target.value)}
          />
          <div className="md:col-span-2">
            <button className="demo-button" type="submit">
              Save connection
            </button>
          </div>
        </form>
      </section>

      {connections.map((connection) => (
        <SftpConnectionCard
          key={connection.id}
          connection={connection}
          onError={onError}
          onNotice={onNotice}
          onDone={onDone}
        />
      ))}
    </div>
  )
}

function SftpConnectionCard({
  connection,
  onError,
  onNotice,
  onDone,
}: {
  connection: SftpConnection
  onError: (value: string) => void
  onNotice: (value: string) => void
  onDone: () => void
}) {
  const [name, setName] = useState(connection.name)
  const [enabled, setEnabled] = useState(connection.enabled)
  const [host, setHost] = useState(connection.host)
  const [port, setPort] = useState(String(connection.port || 22))
  const [username, setUsername] = useState(connection.username)
  const [password, setPassword] = useState('')
  const [remotePath, setRemotePath] = useState(connection.remotePath)

  useEffect(() => {
    setName(connection.name)
    setEnabled(connection.enabled)
    setHost(connection.host)
    setPort(String(connection.port || 22))
    setUsername(connection.username)
    setRemotePath(connection.remotePath)
  }, [connection])

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      await updateSftpConnection(connection.id, {
        name,
        enabled,
        host,
        port: Number(port || 22),
        username,
        password: password || undefined,
        remotePath,
      })
      setPassword('')
      onNotice(`${name} saved.`)
      onDone()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to update SFTP')
    }
  }

  return (
    <section className="island-shell rounded-3xl p-6">
      <h2 className="demo-section-title mb-3">{connection.name}</h2>
      <form className="grid gap-3 md:grid-cols-2" onSubmit={onSave}>
        <input className="demo-input" placeholder="Name" value={name} onChange={(event) => setName(event.target.value)} required />
        <label className="demo-muted flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
          Send 940s over this connection
        </label>
        <input className="demo-input" placeholder="Host" value={host} onChange={(event) => setHost(event.target.value)} />
        <input className="demo-input" placeholder="Port" value={port} onChange={(event) => setPort(event.target.value)} />
        <input className="demo-input" placeholder="Username" value={username} onChange={(event) => setUsername(event.target.value)} />
        <input
          className="demo-input"
          type="password"
          placeholder={connection.passwordSet ? 'Password (unchanged)' : 'Password'}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <input
          className="demo-input md:col-span-2"
          placeholder="Remote path"
          value={remotePath}
          onChange={(event) => setRemotePath(event.target.value)}
        />
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <button className="demo-button" type="submit">
            Save
          </button>
          <button
            className="demo-button demo-button-secondary"
            type="button"
            onClick={() =>
              void testSftpConnection(connection.id)
                .then(() => onNotice(`${connection.name} connected`))
                .catch((err) => onError(err instanceof Error ? err.message : 'SFTP test failed'))
            }
          >
            Test connection
          </button>
        </div>
      </form>
    </section>
  )
}
