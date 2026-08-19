import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import React, { useEffect, useMemo, useState, type FormEvent } from 'react'
import AppShell from '../../components/AppShell'
import OrderShipActions from '../../components/OrderShipActions'
import {
  addCompanyWarehouse,
  assignCompanyOrderWarehouse,
  createCompanyUser,
  createSftpConnection,
  deleteWarehouseTemplate,
  failedOrdersCount,
  getCompanyMe,
  getNotifications,
  getSmtpSettings,
  getWarehouseTemplate,
  inviteCompanyUser,
  listCompanyOrders,
  listCompanyUsers,
  listFailedOrders,
  listOrderLogs,
  markAllNotificationsRead,
  markNotificationRead,
  reassignFailedOrder,
  resetCompanyUser,
  retryFailedOrder,
  saveSmtpSettings,
  saveWarehouseTemplate,
  skipFailedOrder,
  testSmtpSettings,
  testSftpConnection,
  updateCompanyWarehouse,
  updateSftpConnection,
  type ActivityLogEntry,
  type AppNotification,
  type Company,
  type CompanyMember,
  type FailedOrder,
  type ShopOrder,
  type SmtpSettings,
  type SftpConnection,
  type ConditionGroup,
  type ConditionRule,
  type ConditionalValue,
  type OperatorOption,
  type TemplateField,
  type Warehouse,
  type WarehouseTemplate,
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
  const [tab, setTab] = useState<'orders' | 'team' | 'warehouses' | 'sftp' | 'failed' | 'notifications' | 'email'>('orders')
  const [failedOrders, setFailedOrders] = useState<FailedOrder[]>([])
  const [failedCount, setFailedCount] = useState(0)
  const [unreadNotifCount, setUnreadNotifCount] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')

  const isRoot = (currentUser?.role || session?.user.role) === 'root'
  const shopsById = useMemo(() => {
    return new Map((company?.shops || []).map((shop) => [shop.id, shop]))
  }, [company])

  async function refresh() {
    try {
      const [sessionData, nextOrders, dlqCount, notifData] = await Promise.all([
        getCompanyMe(),
        listCompanyOrders(),
        failedOrdersCount(),
        getNotifications(true).catch(() => ({ data: [], unreadCount: 0 })),
      ])
      setCompany(sessionData.company)
      setCurrentUser(sessionData.user)
      setOrders(nextOrders)
      setFailedCount(dlqCount.count)
      setUnreadNotifCount(notifData.unreadCount)
      if (sessionData.user.role === 'root') {
        setUsers(await listCompanyUsers())
      }
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load account')
    }
  }

  async function refreshFailed() {
    try {
      const entries = await listFailedOrders()
      setFailedOrders(entries)
      setFailedCount(entries.length)
    } catch { /* ignore */ }
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
    failed: { title: 'Failed Orders', subtitle: 'Orders that need manual intervention' },
    team: { title: 'Users', subtitle: 'Invite company and warehouse users' },
    warehouses: { title: 'Warehouses', subtitle: 'Locations assigned to Shopify stores' },
    sftp: { title: 'SFTP', subtitle: 'Named connections warehouses can share or keep separate' },
    notifications: { title: 'Notifications', subtitle: 'In-app alerts for order events' },
    email: { title: 'Email Settings', subtitle: 'Configure SMTP for email notifications' },
  }[tab]
  const nav = [
    { id: 'orders', label: 'Orders', hint: '940s and shipments' },
    { id: 'failed', label: `Failed${failedCount > 0 ? ` (${failedCount})` : ''}`, hint: failedCount > 0 ? 'Needs attention' : 'DLQ' },
    { id: 'notifications', label: `Notifications${unreadNotifCount > 0 ? ` (${unreadNotifCount})` : ''}`, hint: 'Alerts' },
    ...(isRoot
      ? [
          { id: 'team', label: 'Users', hint: 'Invites and access' },
          { id: 'warehouses', label: 'Warehouses' },
          { id: 'sftp', label: 'SFTP', hint: 'Push 940 files' },
          { id: 'email', label: 'Email Settings', hint: 'SMTP config' },
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
      {tab === 'failed' ? (
        <FailedOrdersPanel
          entries={failedOrders}
          warehouses={company?.warehouses || []}
          onRefresh={refreshFailed}
          onRetry={async (id) => { await retryFailedOrder(id); await refreshFailed() }}
          onReassign={async (id, wId) => { await reassignFailedOrder(id, wId); await refreshFailed() }}
          onSkip={async (id) => { await skipFailedOrder(id); await refreshFailed() }}
        />
      ) : null}

      {tab === 'notifications' ? (
        <NotificationsPanel onCountChange={setUnreadNotifCount} />
      ) : null}

      {tab === 'email' ? (
        <SmtpSettingsPanel />
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

function OrderLogTimeline({ orderId }: { orderId: string }) {
  const [logs, setLogs] = useState<ActivityLogEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listOrderLogs(orderId).then(setLogs).catch(() => {}).finally(() => setLoading(false))
  }, [orderId])

  if (loading) return <p className="demo-muted">Loading logs…</p>
  if (logs.length === 0) return <p className="demo-muted">No activity recorded yet.</p>

  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0', fontSize: '0.8rem' }}>
      {logs.map((log) => (
        <li key={log.id} style={{ padding: '0.25rem 0', borderBottom: '1px solid var(--border, #eee)' }}>
          <strong>{log.type.replace('_', ' ')}</strong>{' '}
          <span>{log.message}</span>{' '}
          <span className="demo-muted">{new Date(log.createdAt).toLocaleString()}</span>
        </li>
      ))}
    </ul>
  )
}

function FailedOrdersPanel({
  entries,
  warehouses,
  onRefresh,
  onRetry,
  onReassign,
  onSkip,
}: {
  entries: FailedOrder[]
  warehouses: Warehouse[]
  onRefresh: () => void
  onRetry: (id: string) => Promise<void>
  onReassign: (id: string, warehouseId: string) => Promise<void>
  onSkip: (id: string) => Promise<void>
}) {
  const [busy, setBusy] = useState('')

  useEffect(() => { onRefresh() }, [])

  async function handle(id: string, action: () => Promise<void>) {
    setBusy(id)
    try { await action() } catch { /* ignore */ }
    setBusy('')
  }

  if (entries.length === 0) {
    return <p className="demo-muted">No failed orders. All clear.</p>
  }

  return (
    <div className="demo-table-wrap">
      <table className="demo-table">
        <thead>
          <tr>
            <th>Reason</th>
            <th>Error</th>
            <th>Attempts</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td><span className="demo-badge demo-badge-danger">{entry.reason}</span></td>
              <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.errorMessage}</td>
              <td>{entry.attempts}</td>
              <td>{new Date(entry.createdAt).toLocaleString()}</td>
              <td>
                <button className="demo-btn demo-btn-sm" disabled={busy === entry.id} onClick={() => handle(entry.id, () => onRetry(entry.id))}>Retry</button>{' '}
                <select disabled={busy === entry.id} onChange={(e) => { if (e.target.value) handle(entry.id, () => onReassign(entry.id, e.target.value)) }} defaultValue="">
                  <option value="" disabled>Reassign…</option>
                  {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>{' '}
                <button className="demo-btn demo-btn-sm" disabled={busy === entry.id} onClick={() => handle(entry.id, () => onSkip(entry.id))}>Skip</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
  const [expandedId, setExpandedId] = useState<string | null>(null)

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
              <React.Fragment key={order.id}>
              <tr>
                <td>
                  <button type="button" className="demo-link" onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}>{order.orderNumber}</button>
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
              {expandedId === order.id ? (
                <tr>
                  <td colSpan={6} style={{ background: 'var(--surface-alt, #f9f9f9)', padding: '1rem' }}>
                    <OrderLogTimeline orderId={order.id} />
                  </td>
                </tr>
              ) : null}
              </React.Fragment>
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

function ConditionRuleEditor({ rule, paths, operators, onChange, onRemove }: {
  rule: ConditionRule
  paths: string[]
  operators: OperatorOption[]
  onChange: (r: ConditionRule) => void
  onRemove: () => void
}) {
  const needsValue = !['is_empty', 'is_not_empty'].includes(rule.operator)
  return (
    <div className="flex items-center gap-1 mb-1" style={{ fontSize: '0.75rem' }}>
      <select className="demo-input" style={{ width: 140 }} value={rule.field} onChange={(e) => onChange({ ...rule, field: e.target.value })}>
        <option value="">Select field…</option>
        {paths.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <select className="demo-input" style={{ width: 120 }} value={rule.operator} onChange={(e) => onChange({ ...rule, operator: e.target.value })}>
        {operators.map((op) => <option key={op.id} value={op.id}>{op.label}</option>)}
      </select>
      {needsValue && (
        <input className="demo-input" style={{ width: 100 }} value={rule.value} onChange={(e) => onChange({ ...rule, value: e.target.value })} placeholder="value" />
      )}
      <button type="button" className="demo-btn demo-btn-sm" onClick={onRemove}>x</button>
    </div>
  )
}

function ConditionGroupEditor({ group, paths, operators, onChange, label }: {
  group: ConditionGroup
  paths: string[]
  operators: OperatorOption[]
  onChange: (g: ConditionGroup) => void
  label: string
}) {
  function addCondition() {
    onChange({ ...group, conditions: [...group.conditions, { field: paths[0] || '', operator: 'equals', value: '' }] })
  }
  function updateCondition(idx: number, rule: ConditionRule) {
    onChange({ ...group, conditions: group.conditions.map((c, i) => i === idx ? rule : c) })
  }
  function removeCondition(idx: number) {
    onChange({ ...group, conditions: group.conditions.filter((_, i) => i !== idx) })
  }

  return (
    <div style={{ background: 'var(--surface-alt, #f5f5f5)', borderRadius: 6, padding: '0.5rem', marginTop: '0.25rem' }}>
      <div className="flex items-center gap-2 mb-1">
        <span style={{ fontSize: '0.7rem', fontWeight: 600 }}>{label}</span>
        <select className="demo-input" style={{ width: 60, fontSize: '0.7rem' }} value={group.logic} onChange={(e) => onChange({ ...group, logic: e.target.value as 'and' | 'or' })}>
          <option value="and">AND</option>
          <option value="or">OR</option>
        </select>
      </div>
      {group.conditions.map((rule, idx) => (
        <ConditionRuleEditor key={idx} rule={rule} paths={paths} operators={operators} onChange={(r) => updateCondition(idx, r)} onRemove={() => removeCondition(idx)} />
      ))}
      <button type="button" className="demo-btn demo-btn-sm" onClick={addCondition} style={{ fontSize: '0.7rem' }}>+ Add condition</button>
    </div>
  )
}

function TemplateEditor({ warehouseId, onClose }: { warehouseId: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true)
  const [format, setFormat] = useState<'x12' | 'csv'>('csv')
  const [csvDelimiter, setCsvDelimiter] = useState(',')
  const [csvHeaders, setCsvHeaders] = useState(true)
  const [fields, setFields] = useState<TemplateField[]>([])
  const [x12Config, setX12Config] = useState({ senderId: 'WMSLINKER', receiverId: 'WAREHOUSE', version: '004010' })
  const [paths, setPaths] = useState<string[]>([])
  const [operators, setOperators] = useState<OperatorOption[]>([])
  const [saving, setSaving] = useState(false)
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  useEffect(() => {
    getWarehouseTemplate(warehouseId).then(({ template, shopifyPaths, operators: ops }) => {
      setPaths(shopifyPaths)
      setOperators(ops)
      if (template) {
        setFormat(template.format)
        setCsvDelimiter(template.csvDelimiter)
        setCsvHeaders(template.csvHeaders)
        setFields(template.fields)
        setX12Config(template.x12Config)
      }
    }).catch(() => {}).finally(() => setLoading(false))
  }, [warehouseId])

  function addField() {
    setFields([...fields, { position: fields.length + 1, outputLabel: '', source: 'shopify', shopifyPath: paths[0] || '', staticValue: '', includeCondition: null, conditionalValues: [], fallbackValue: '' }])
  }

  function updateField(idx: number, patch: Partial<TemplateField>) {
    setFields(fields.map((f, i) => i === idx ? { ...f, ...patch } : f))
  }

  function removeField(idx: number) {
    setFields(fields.filter((_, i) => i !== idx))
    if (expandedIdx === idx) setExpandedIdx(null)
  }

  function addConditionalValue(idx: number) {
    const field = fields[idx]
    const cvs = [...(field.conditionalValues || []), { when: { logic: 'and' as const, conditions: [] }, then: '' }]
    updateField(idx, { conditionalValues: cvs })
  }

  function updateConditionalValue(fieldIdx: number, cvIdx: number, patch: Partial<ConditionalValue>) {
    const field = fields[fieldIdx]
    const cvs = (field.conditionalValues || []).map((cv, i) => i === cvIdx ? { ...cv, ...patch } : cv)
    updateField(fieldIdx, { conditionalValues: cvs })
  }

  function removeConditionalValue(fieldIdx: number, cvIdx: number) {
    const field = fields[fieldIdx]
    updateField(fieldIdx, { conditionalValues: (field.conditionalValues || []).filter((_, i) => i !== cvIdx) })
  }

  async function save() {
    setSaving(true)
    try {
      await saveWarehouseTemplate(warehouseId, { format, csvDelimiter, csvHeaders, fields, x12Config })
      onClose()
    } catch { /* ignore */ }
    setSaving(false)
  }

  async function reset() {
    await deleteWarehouseTemplate(warehouseId)
    onClose()
  }

  if (loading) return <p className="demo-muted">Loading template…</p>

  return (
    <div style={{ border: '1px solid var(--border, #ddd)', borderRadius: 8, padding: '1rem', marginTop: '0.5rem' }}>
      <div className="mb-3 flex items-center gap-3 flex-wrap">
        <label className="text-sm font-medium">Format:</label>
        <select className="demo-input" value={format} onChange={(e) => setFormat(e.target.value as 'x12' | 'csv')}>
          <option value="csv">CSV</option>
          <option value="x12">X12 EDI</option>
        </select>
        {format === 'csv' && (
          <>
            <label className="text-sm">Delimiter:</label>
            <input className="demo-input" style={{ width: 40 }} value={csvDelimiter} onChange={(e) => setCsvDelimiter(e.target.value)} />
            <label className="text-sm"><input type="checkbox" checked={csvHeaders} onChange={(e) => setCsvHeaders(e.target.checked)} /> Headers</label>
          </>
        )}
        {format === 'x12' && (
          <>
            <input className="demo-input" style={{ width: 100 }} placeholder="Sender ID" value={x12Config.senderId} onChange={(e) => setX12Config({ ...x12Config, senderId: e.target.value })} />
            <input className="demo-input" style={{ width: 100 }} placeholder="Receiver ID" value={x12Config.receiverId} onChange={(e) => setX12Config({ ...x12Config, receiverId: e.target.value })} />
          </>
        )}
      </div>

      {fields.map((field, idx) => (
        <div key={idx} style={{ border: '1px solid var(--border, #e0e0e0)', borderRadius: 6, padding: '0.5rem', marginBottom: '0.5rem' }}>
          <div className="flex items-center gap-2 flex-wrap">
            <input className="demo-input" type="number" style={{ width: 40 }} value={field.position} onChange={(e) => updateField(idx, { position: Number(e.target.value) })} title="Position" />
            <input className="demo-input" style={{ width: 120 }} value={field.outputLabel} onChange={(e) => updateField(idx, { outputLabel: e.target.value })} placeholder="Column name" />
            <select className="demo-input" style={{ width: 130 }} value={field.source} onChange={(e) => updateField(idx, { source: e.target.value as 'shopify' | 'static' | 'conditional' })}>
              <option value="shopify">Shopify field</option>
              <option value="static">Static value</option>
              <option value="conditional">Conditional (if/else)</option>
            </select>
            {field.source === 'shopify' && (
              <select className="demo-input" style={{ width: 160 }} value={field.shopifyPath} onChange={(e) => updateField(idx, { shopifyPath: e.target.value })}>
                {paths.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            )}
            {field.source === 'static' && (
              <input className="demo-input" style={{ width: 140 }} value={field.staticValue} onChange={(e) => updateField(idx, { staticValue: e.target.value })} placeholder="Fixed value" />
            )}
            <button type="button" className="demo-btn demo-btn-sm" onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)} title="Show/hide conditions">
              {expandedIdx === idx ? '▼' : '▶'} Rules
            </button>
            <button type="button" className="demo-btn demo-btn-sm" onClick={() => removeField(idx)} title="Remove field">✕</button>
          </div>

          {expandedIdx === idx && (
            <div style={{ marginTop: '0.5rem', paddingLeft: '0.5rem', borderLeft: '3px solid var(--border, #ccc)' }}>
              {/* Include condition: only show this field when... */}
              <div style={{ marginBottom: '0.5rem' }}>
                <div className="flex items-center gap-2 mb-1">
                  <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Only include this field when:</span>
                  {!field.includeCondition?.conditions?.length && (
                    <button type="button" className="demo-btn demo-btn-sm" style={{ fontSize: '0.7rem' }} onClick={() => updateField(idx, { includeCondition: { logic: 'and', conditions: [{ field: paths[0] || '', operator: 'equals', value: '' }] } })}>
                      + Add include rule
                    </button>
                  )}
                  {(field.includeCondition?.conditions?.length ?? 0) > 0 && (
                    <button type="button" className="demo-btn demo-btn-sm" style={{ fontSize: '0.7rem' }} onClick={() => updateField(idx, { includeCondition: null })}>
                      Clear (always include)
                    </button>
                  )}
                </div>
                {field.includeCondition && field.includeCondition.conditions.length > 0 && (
                  <ConditionGroupEditor
                    group={field.includeCondition}
                    paths={paths}
                    operators={operators}
                    onChange={(g) => updateField(idx, { includeCondition: g })}
                    label="Include when"
                  />
                )}
              </div>

              {/* Conditional values (if source is "conditional") */}
              {field.source === 'conditional' && (
                <div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Value rules (first match wins):</span>
                  {(field.conditionalValues || []).map((cv, cvIdx) => (
                    <div key={cvIdx} style={{ marginTop: '0.25rem', padding: '0.4rem', background: 'var(--surface, #fff)', borderRadius: 4, border: '1px solid var(--border, #e8e8e8)' }}>
                      <div className="flex items-center gap-2 mb-1">
                        <span style={{ fontSize: '0.7rem' }}>IF:</span>
                        <button type="button" className="demo-btn demo-btn-sm" onClick={() => removeConditionalValue(idx, cvIdx)} style={{ fontSize: '0.7rem', marginLeft: 'auto' }}>Remove rule</button>
                      </div>
                      <ConditionGroupEditor
                        group={cv.when}
                        paths={paths}
                        operators={operators}
                        onChange={(g) => updateConditionalValue(idx, cvIdx, { when: g })}
                        label={`Rule ${cvIdx + 1}`}
                      />
                      <div className="flex items-center gap-2 mt-1">
                        <span style={{ fontSize: '0.7rem' }}>THEN value:</span>
                        <input className="demo-input" style={{ width: 160 }} value={cv.then} onChange={(e) => updateConditionalValue(idx, cvIdx, { then: e.target.value })} placeholder="Output value" />
                      </div>
                    </div>
                  ))}
                  <button type="button" className="demo-btn demo-btn-sm mt-1" onClick={() => addConditionalValue(idx)} style={{ fontSize: '0.7rem' }}>+ Add IF rule</button>
                  <div className="flex items-center gap-2 mt-2">
                    <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>ELSE (fallback):</span>
                    <input className="demo-input" style={{ width: 160 }} value={field.fallbackValue || ''} onChange={(e) => updateField(idx, { fallbackValue: e.target.value })} placeholder="Default value" />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      <div className="mt-3 flex gap-2 flex-wrap">
        <button type="button" className="demo-button demo-button-secondary" onClick={addField}>+ Add field</button>
        <button type="button" className="demo-button" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save template'}</button>
        <button type="button" className="demo-button demo-button-secondary" onClick={reset}>Reset to default</button>
        <button type="button" className="demo-button demo-button-secondary" onClick={onClose}>Cancel</button>
      </div>
    </div>
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
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)

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
              <th>940 Template</th>
            </tr>
          </thead>
          <tbody>
            {warehouses.length === 0 ? (
              <tr>
                <td colSpan={5}>None yet</td>
              </tr>
            ) : (
              warehouses.map((warehouse) => (
                <React.Fragment key={warehouse.id}>
                <tr>
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
                  <td>
                    <button
                      type="button"
                      className="demo-button demo-button-secondary px-3 py-1 text-xs"
                      onClick={() => setEditingTemplateId(editingTemplateId === warehouse.id ? null : warehouse.id)}
                    >
                      {editingTemplateId === warehouse.id ? 'Close' : 'Configure 940'}
                    </button>
                  </td>
                </tr>
                {editingTemplateId === warehouse.id && (
                  <tr>
                    <td colSpan={5}>
                      <TemplateEditor warehouseId={warehouse.id} onClose={() => setEditingTemplateId(null)} />
                    </td>
                  </tr>
                )}
                </React.Fragment>
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

function NotificationsPanel({ onCountChange }: { onCountChange: (n: number) => void }) {
  const [items, setItems] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const res = await getNotifications()
      setItems(res.data)
      onCountChange(res.unreadCount)
    } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  async function handleMarkAllRead() {
    await markAllNotificationsRead()
    await load()
  }

  async function handleMarkRead(id: string) {
    await markNotificationRead(id)
    setItems((prev) => prev.map((n) => (n._id === id ? { ...n, read: true } : n)))
    onCountChange(Math.max(0, items.filter((n) => !n.read && n._id !== id).length))
  }

  if (loading) return <p className="demo-muted">Loading notifications...</p>

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <p className="demo-muted text-sm">{items.filter((n) => !n.read).length} unread</p>
        <button className="demo-button demo-button-secondary text-xs" onClick={handleMarkAllRead}>Mark all read</button>
      </div>
      {items.length === 0 ? <p className="demo-muted">No notifications yet.</p> : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li key={n._id} className={`p-3 rounded border ${n.read ? 'border-gray-200 bg-white' : 'border-indigo-200 bg-indigo-50'}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-sm">{n.title}</p>
                  {n.message && <p className="text-xs text-gray-600 mt-0.5">{n.message}</p>}
                  <p className="text-xs text-gray-400 mt-1">{new Date(n.createdAt).toLocaleString()} · {n.type}{n.emailSent ? ' · emailed' : ''}</p>
                </div>
                {!n.read && (
                  <button className="text-xs text-indigo-600 whitespace-nowrap" onClick={() => handleMarkRead(n._id)}>Mark read</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function SmtpSettingsPanel() {
  const [settings, setSettings] = useState<SmtpSettings>({
    host: '', port: 587, secure: false, username: '', password: '', fromName: 'WMS Linker', fromEmail: '', enabled: true, notifyOn: ['order_error', 'sftp_failed', 'dlq_entry'], recipients: [],
  })
  const [recipientInput, setRecipientInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const existing = await getSmtpSettings()
        if (existing) setSettings(existing)
      } catch { /* ignore */ }
      setLoading(false)
    })()
  }, [])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMsg('')
    try {
      await saveSmtpSettings(settings)
      setMsg('Saved!')
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Failed to save')
    }
    setSaving(false)
  }

  async function handleTest() {
    setTesting(true)
    setMsg('')
    try {
      await testSmtpSettings()
      setMsg('Test email sent successfully!')
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Test failed')
    }
    setTesting(false)
  }

  function addRecipient() {
    const email = recipientInput.trim()
    if (email && !settings.recipients.includes(email)) {
      setSettings({ ...settings, recipients: [...settings.recipients, email] })
    }
    setRecipientInput('')
  }

  const notifyOptions = [
    { value: 'order_error', label: 'Order Errors' },
    { value: 'sftp_failed', label: 'SFTP Failures' },
    { value: 'dlq_entry', label: 'Dead Letter Queue' },
    { value: '945_received', label: '945 Received' },
    { value: 'order_fulfilled', label: 'Order Fulfilled' },
    { value: 'order_received', label: 'Order Received' },
  ]

  if (loading) return <p className="demo-muted">Loading...</p>

  return (
    <section>
      <form onSubmit={handleSave} className="space-y-4 max-w-lg">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="demo-label">SMTP Host</label>
            <input className="demo-input w-full" value={settings.host} onChange={(e) => setSettings({ ...settings, host: e.target.value })} required placeholder="smtp.gmail.com" />
          </div>
          <div>
            <label className="demo-label">Port</label>
            <input className="demo-input w-full" type="number" value={settings.port} onChange={(e) => setSettings({ ...settings, port: Number(e.target.value) })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="demo-label">Username</label>
            <input className="demo-input w-full" value={settings.username} onChange={(e) => setSettings({ ...settings, username: e.target.value })} required />
          </div>
          <div>
            <label className="demo-label">Password</label>
            <input className="demo-input w-full" type="password" value={settings.password} onChange={(e) => setSettings({ ...settings, password: e.target.value })} required />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="demo-label">From Name</label>
            <input className="demo-input w-full" value={settings.fromName} onChange={(e) => setSettings({ ...settings, fromName: e.target.value })} />
          </div>
          <div>
            <label className="demo-label">From Email</label>
            <input className="demo-input w-full" type="email" value={settings.fromEmail} onChange={(e) => setSettings({ ...settings, fromEmail: e.target.value })} required />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" checked={settings.secure} onChange={(e) => setSettings({ ...settings, secure: e.target.checked })} id="smtp-secure" />
          <label htmlFor="smtp-secure" className="text-sm">Use TLS/SSL</label>
          <span className="mx-4" />
          <input type="checkbox" checked={settings.enabled} onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} id="smtp-enabled" />
          <label htmlFor="smtp-enabled" className="text-sm">Enabled</label>
        </div>

        <div>
          <label className="demo-label">Notify On</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {notifyOptions.map((opt) => (
              <label key={opt.value} className="flex items-center gap-1 text-xs">
                <input type="checkbox" checked={settings.notifyOn.includes(opt.value)} onChange={(e) => {
                  const next = e.target.checked ? [...settings.notifyOn, opt.value] : settings.notifyOn.filter((v) => v !== opt.value)
                  setSettings({ ...settings, notifyOn: next })
                }} />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="demo-label">Recipients</label>
          <div className="flex gap-2 mt-1">
            <input className="demo-input flex-1" type="email" value={recipientInput} onChange={(e) => setRecipientInput(e.target.value)} placeholder="email@example.com" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRecipient() } }} />
            <button type="button" className="demo-button demo-button-secondary text-xs" onClick={addRecipient}>Add</button>
          </div>
          {settings.recipients.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {settings.recipients.map((r) => (
                <span key={r} className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded text-xs">
                  {r}
                  <button type="button" className="text-red-500" onClick={() => setSettings({ ...settings, recipients: settings.recipients.filter((x) => x !== r) })}>×</button>
                </span>
              ))}
            </div>
          )}
        </div>

        {msg && <p className="text-sm text-indigo-600">{msg}</p>}
        <div className="flex gap-2">
          <button type="submit" className="demo-button" disabled={saving}>{saving ? 'Saving...' : 'Save Settings'}</button>
          <button type="button" className="demo-button demo-button-secondary" onClick={handleTest} disabled={testing}>{testing ? 'Sending...' : 'Send Test Email'}</button>
        </div>
      </form>
    </section>
  )
}
